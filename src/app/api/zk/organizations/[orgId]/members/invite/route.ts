import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import {
  getAuthFromRequest,
  getAuthFromRequestOrSession,
  isSessionOnlyAuth,
  createAuditLog,
  getClientIP,
  errorResponse,
  successResponse,
  handleCorsPreflightRequest,
  addCorsHeaders,
  OrganizationUserStatus,
} from '@/lib/zk';
import { sendOrgInvitationEmail } from '@/lib/email';

export async function OPTIONS() {
  return handleCorsPreflightRequest();
}

/**
 * POST /api/zk/organizations/[orgId]/members/invite
 * Invite a user to the organization.
 *
 * Subscription-aware invite flow:
 * 1. Look up org plan and invitee's individual plan.
 * 2. If the invitee is on free/starter and the org has a paid plan (team+),
 *    the inviter must explicitly accept covering the seat by sending
 *    `coverSeat: true`. Without it, a 402 is returned with the invitee's
 *    plan info so the client can show a confirmation dialog.
 * 3. Seat availability is checked against org.seats (paid seats).
 * 4. The `seatCoveredByOrg` flag is stored on OrganizationUser.
 *
 * Body params:
 *   - email: string (required)
 *   - role: 'admin' | 'member' | 'readonly' (default: 'member')
 *   - encryptedOrgKey: string (optional, only when invitee has public key)
 *   - coverSeat: boolean (required when invitee is on free/starter and org
 *     has a paid plan — inviter must accept covering the subscription cost)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const auth = await getAuthFromRequestOrSession(request);

    if (!auth || isSessionOnlyAuth(auth)) {
      return errorResponse('Unauthorized', 401);
    }

    const { orgId } = await params;
    const body = await request.json();
    const { email, role = 'member', encryptedOrgKey, coverSeat } = body;

    if (!email) {
      return errorResponse('Email is required');
    }

    // Verify admin+ membership
    const orgUser = await prisma.organizationUser.findFirst({
      where: {
        userId: auth.userId,
        organizationId: orgId,
        status: { in: ['confirmed', 'active'] },
        role: { in: ['owner', 'admin'] },
      },
    });

    if (!orgUser) {
      return errorResponse('Organization not found or insufficient permissions', 404);
    }

    // Validate role (can't invite as owner)
    const validRoles = ['admin', 'member', 'readonly'];
    if (!validRoles.includes(role)) {
      return errorResponse(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }

    // Fetch org with member count (confirmed + invited = seats in use)
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        _count: {
          select: {
            members: { where: { status: { in: ['confirmed', 'invited'] } } },
          },
        },
      },
    });

    if (!org) {
      return errorResponse('Organization not found', 404);
    }

    // Check hard member limit
    if (org._count.members >= org.maxMembers) {
      return errorResponse(`Organization member limit reached (${org.maxMembers})`, 403);
    }

    const normalizedEmail = email.toLowerCase();

    // ── Subscription-aware checks ──
    // Look up invitee's current plan (if they're a registered user)
    const inviteeZKUser = await prisma.zKUser.findUnique({
      where: { email: normalizedEmail },
      include: { webUser: true },
    });

    const inviteePlan = inviteeZKUser?.webUser?.plan || 'free';
    const inviteeIsOnFreePlan = inviteePlan === 'free' || inviteePlan === 'starter';
    const orgHasPaidPlan = org.plan !== 'free' && org.plan !== 'starter';

    // Determine if the org needs to cover this seat.
    // Consult org.memberBillingMode to decide behavior:
    //   'org_covers' (default) → auto-cover, no client confirmation needed
    //   'hybrid' → client must send coverSeat: true to confirm
    //   'self_pay' → never cover seats (invitee must have own paid plan)
    let seatCoveredByOrg = false;

    if (orgHasPaidPlan && inviteeIsOnFreePlan) {
      const billingMode = org.memberBillingMode || 'org_covers';

      if (billingMode === 'self_pay') {
        // Self-pay mode: org doesn't cover seats — invitee must upgrade first
        const response = NextResponse.json(
          {
            error: 'subscription_required',
            message: `${normalizedEmail} is on the ${inviteePlan === 'free' ? 'Free' : 'Starter'} plan. ` +
              `Your organization requires members to have their own paid subscription. ` +
              `Ask them to upgrade before inviting.`,
            inviteePlan,
            orgPlan: org.plan,
            requiresCoverSeat: false,
          },
          { status: 402 }
        );
        return addCorsHeaders(response);
      }

      // Count only org-covered seats (self-paying members don't consume org seats)
      const orgCoveredSeats = await prisma.organizationUser.count({
        where: {
          organizationId: orgId,
          status: { in: ['confirmed', 'invited'] },
          seatCoveredByOrg: true,
        },
      });

      if (billingMode === 'hybrid' && coverSeat !== true) {
        // Hybrid mode: client must explicitly confirm seat coverage
        const response = NextResponse.json(
          {
            error: 'subscription_required',
            message: `${normalizedEmail} is on the ${inviteePlan === 'free' ? 'Free' : 'Starter'} plan. ` +
              `To add them to your organization, you must cover their subscription ` +
              `under your ${org.plan} plan. This will use 1 seat.`,
            inviteePlan,
            orgPlan: org.plan,
            seatsUsed: orgCoveredSeats,
            seatsTotal: org.seats,
            seatsAvailable: Math.max(0, org.seats - orgCoveredSeats),
            requiresCoverSeat: true,
          },
          { status: 402 }
        );
        return addCorsHeaders(response);
      }

      // org_covers or hybrid (with coverSeat confirmed) — check seat availability
      if (orgCoveredSeats >= org.seats) {
        const response = NextResponse.json(
          {
            error: 'seats_exhausted',
            message: `All ${org.seats} seats are in use. Purchase additional seats ` +
              `or remove a member before inviting.`,
            seatsUsed: orgCoveredSeats,
            seatsTotal: org.seats,
          },
          { status: 402 }
        );
        return addCorsHeaders(response);
      }

      seatCoveredByOrg = true;
    } else if (orgHasPaidPlan && !inviteeIsOnFreePlan) {
      // Invitee already has their own paid plan — no seat consumed
      seatCoveredByOrg = false;
    }

    // Generate invite token for email link
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    if (inviteeZKUser) {
      // ── Registered user path ──
      const existingMembership = await prisma.organizationUser.findFirst({
        where: {
          organizationId: orgId,
          OR: [
            { userId: inviteeZKUser.id },
            { invitedEmail: normalizedEmail },
          ],
        },
      });

      if (existingMembership) {
        if (existingMembership.status === 'revoked') {
          await prisma.organizationUser.update({
            where: { id: existingMembership.id },
            data: {
              status: OrganizationUserStatus.INVITED,
              role,
              userId: inviteeZKUser.id,
              encryptedOrgKey: encryptedOrgKey || null,
              confirmedAt: null,
              token,
              invitedEmail: normalizedEmail,
              expiresAt,
              seatCoveredByOrg,
            },
          });
        } else {
          return errorResponse('User is already a member or has a pending invitation', 409);
        }
      } else {
        await prisma.organizationUser.create({
          data: {
            userId: inviteeZKUser.id,
            organizationId: orgId,
            role,
            status: OrganizationUserStatus.INVITED,
            encryptedOrgKey: encryptedOrgKey || null,
            token,
            invitedEmail: normalizedEmail,
            expiresAt,
            seatCoveredByOrg,
          },
        });
      }

      await createAuditLog({
        userId: auth.userId,
        organizationId: orgId,
        eventType: 'user_invited',
        targetType: 'user',
        targetId: inviteeZKUser.id,
        ipAddress: getClientIP(request),
        userAgent: request.headers.get('user-agent') || undefined,
        metadata: {
          inviteeEmail: normalizedEmail,
          role,
          inviteePlan,
          seatCoveredByOrg,
        },
      });
    } else {
      // ── Unregistered user path ──
      // Unregistered users are treated as free-plan users.
      const existingEmailInvite = await prisma.organizationUser.findFirst({
        where: {
          invitedEmail: normalizedEmail,
          organizationId: orgId,
        },
      });

      if (existingEmailInvite) {
        if (existingEmailInvite.status === 'revoked') {
          await prisma.organizationUser.update({
            where: { id: existingEmailInvite.id },
            data: {
              status: OrganizationUserStatus.INVITED,
              role,
              confirmedAt: null,
              token,
              invitedEmail: normalizedEmail,
              expiresAt,
              seatCoveredByOrg,
            },
          });
        } else {
          return errorResponse('An invitation has already been sent to this email', 409);
        }
      } else {
        await prisma.organizationUser.create({
          data: {
            organizationId: orgId,
            role,
            status: OrganizationUserStatus.INVITED,
            token,
            invitedEmail: normalizedEmail,
            expiresAt,
            seatCoveredByOrg,
          },
        });
      }

      await createAuditLog({
        userId: auth.userId,
        organizationId: orgId,
        eventType: 'user_invited',
        targetType: 'user',
        targetId: normalizedEmail,
        ipAddress: getClientIP(request),
        userAgent: request.headers.get('user-agent') || undefined,
        metadata: {
          inviteeEmail: normalizedEmail,
          role,
          unregistered: true,
          inviteePlan: 'free',
          seatCoveredByOrg,
        },
      });
    }

    // Get inviter info for the email
    const inviter = await prisma.zKUser.findUnique({
      where: { id: auth.userId },
    });

    // Send invitation email
    await sendOrgInvitationEmail({
      email: normalizedEmail,
      orgName: org.name,
      inviterName: inviter?.email || 'A team member',
      role,
      token,
    });

    const response = successResponse({
      message: 'Invitation sent successfully',
      inviteePlan,
      seatCoveredByOrg,
    }, 201);
    return addCorsHeaders(response);
  } catch (error) {
    console.error('Invite member error:', error);
    return errorResponse('Failed to invite member', 500);
  }
}
