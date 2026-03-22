import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import {
  getAuthFromRequest,
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
 * - If the invitee is already registered (ZKUser), creates OrganizationUser
 *   with their userId and the encrypted org key.
 * - If the invitee is NOT registered, creates OrganizationUser with just
 *   their email and a token so they can accept via the web invite link.
 *   The encrypted org key will be provided later when they register and
 *   the admin confirms.
 * In both cases an invitation email is sent.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const auth = getAuthFromRequest(request);

    if (!auth) {
      return errorResponse('Unauthorized', 401);
    }

    const { orgId } = await params;
    const body = await request.json();
    const { email, role = 'member', encryptedOrgKey } = body;

    if (!email) {
      return errorResponse('Email is required');
    }

    // encryptedOrgKey is optional — only available when invitee is already
    // registered and the inviter has their public key.

    // Verify admin+ membership
    const orgUser = await prisma.organizationUser.findFirst({
      where: {
        userId: auth.userId,
        organizationId: orgId,
        status: 'confirmed',
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

    // Check member limit
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        _count: { select: { members: { where: { status: 'confirmed' } } } },
      },
    });

    if (!org) {
      return errorResponse('Organization not found', 404);
    }

    if (org._count.members >= org.maxMembers) {
      return errorResponse(`Organization member limit reached (${org.maxMembers})`, 403);
    }

    const normalizedEmail = email.toLowerCase();

    // Generate invite token for email link
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Find the user to invite (may or may not exist yet)
    const invitee = await prisma.zKUser.findUnique({
      where: { email: normalizedEmail },
    });

    if (invitee) {
      // ── Registered user path ──
      const existingMembership = await prisma.organizationUser.findFirst({
        where: {
          userId: invitee.id,
          organizationId: orgId,
        },
      });

      if (existingMembership) {
        if (existingMembership.status === 'revoked') {
          await prisma.organizationUser.update({
            where: { id: existingMembership.id },
            data: {
              status: OrganizationUserStatus.INVITED,
              role,
              encryptedOrgKey: encryptedOrgKey || null,
              token,
              invitedEmail: normalizedEmail,
              expiresAt,
            },
          });
        } else {
          return errorResponse('User is already a member or has a pending invitation', 409);
        }
      } else {
        await prisma.organizationUser.create({
          data: {
            userId: invitee.id,
            organizationId: orgId,
            role,
            status: OrganizationUserStatus.INVITED,
            encryptedOrgKey: encryptedOrgKey || null,
            token,
            invitedEmail: normalizedEmail,
            expiresAt,
          },
        });
      }

      await createAuditLog({
        userId: auth.userId,
        organizationId: orgId,
        eventType: 'user_invited',
        targetType: 'user',
        targetId: invitee.id,
        ipAddress: getClientIP(request),
        userAgent: request.headers.get('user-agent') || undefined,
        metadata: { inviteeEmail: normalizedEmail, role },
      });
    } else {
      // ── Unregistered user path ──
      const existingEmailInvite = await prisma.organizationUser.findFirst({
        where: {
          invitedEmail: normalizedEmail,
          organizationId: orgId,
          status: 'invited',
        },
      });

      if (existingEmailInvite) {
        return errorResponse('An invitation has already been sent to this email', 409);
      }

      await prisma.organizationUser.create({
        data: {
          organizationId: orgId,
          role,
          status: OrganizationUserStatus.INVITED,
          token,
          invitedEmail: normalizedEmail,
          expiresAt,
        },
      });

      await createAuditLog({
        userId: auth.userId,
        organizationId: orgId,
        eventType: 'user_invited',
        targetType: 'email',
        targetId: normalizedEmail,
        ipAddress: getClientIP(request),
        userAgent: request.headers.get('user-agent') || undefined,
        metadata: { inviteeEmail: normalizedEmail, role, unregistered: true },
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

    const response = successResponse({ message: 'Invitation sent successfully' }, 201);
    return addCorsHeaders(response);
  } catch (error) {
    console.error('Invite member error:', error);
    return errorResponse('Failed to invite member', 500);
  }
}
