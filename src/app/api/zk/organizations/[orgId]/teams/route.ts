import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getAuthFromRequest,
  getAuthFromRequestOrSession,
  isSessionOnlyAuth,
  errorResponse,
  successResponse,
  handleCorsPreflightRequest,
  addCorsHeaders,
  createAuditLog,
  getClientIP,
} from '@/lib/zk';

export async function OPTIONS() {
  return handleCorsPreflightRequest();
}

/**
 * GET /api/zk/organizations/[orgId]/teams
 * List teams within an organization
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const auth = await getAuthFromRequestOrSession(request);
    if (!auth) return errorResponse('Unauthorized', 401);

    const { orgId } = await params;
    const sessionOnly = isSessionOnlyAuth(auth);

    // Verify membership — session-only users are checked by invitedEmail
    const orgUser = await prisma.organizationUser.findFirst({
      where: {
        organizationId: orgId,
        status: 'confirmed',
        ...(sessionOnly
          ? { invitedEmail: auth.email }
          : {
              OR: [
                { userId: auth.userId },
                ...(auth.email ? [{ invitedEmail: auth.email }] : []),
              ],
            }),
      },
    });
    if (!orgUser) return errorResponse('Organization not found or access denied', 404);

    const teams = await prisma.orgTeam.findMany({
      where: { organizationId: orgId },
      include: { _count: { select: { members: true } } },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });

    const response = successResponse({
      teams: teams.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        isDefault: t.isDefault,
        memberCount: t._count.members,
        ownerId: t.ownerId,
        createdAt: t.createdAt.toISOString(),
      })),
    });
    return addCorsHeaders(response);
  } catch (error) {
    console.error('List teams error:', error);
    return errorResponse('Failed to list teams', 500);
  }
}

/**
 * POST /api/zk/organizations/[orgId]/teams
 * Create a new team within an organization (owner/admin only)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const auth = await getAuthFromRequestOrSession(request);
    if (!auth || isSessionOnlyAuth(auth)) return errorResponse('Unauthorized', 401);

    const { orgId } = await params;

    // Verify admin/owner
    const orgUser = await prisma.organizationUser.findFirst({
      where: { userId: auth.userId, organizationId: orgId, status: 'confirmed' },
    });
    if (!orgUser) return errorResponse('Organization not found or access denied', 404);
    if (orgUser.role !== 'owner' && orgUser.role !== 'admin') {
      return errorResponse('Only owners and admins can create teams', 403);
    }

    const body = await request.json();
    const { name, description } = body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return errorResponse('Team name is required', 400);
    }

    // Check for duplicate name
    const existing = await prisma.orgTeam.findFirst({
      where: { organizationId: orgId, name: name.trim() },
    });
    if (existing) return errorResponse('A team with this name already exists', 409);

    const team = await prisma.orgTeam.create({
      data: {
        organizationId: orgId,
        name: name.trim(),
        description: description?.trim() || null,
        ownerId: auth.userId,
      },
    });

    // Auto-add creator as team member with owner role
    await prisma.orgTeamMember.create({
      data: { teamId: team.id, userId: auth.userId, role: 'owner' },
    });

    await createAuditLog({
      userId: auth.userId,
      organizationId: orgId,
      eventType: 'team_created',
      targetType: 'team',
      targetId: team.id,
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
    });

    const response = successResponse({
      team: {
        id: team.id,
        name: team.name,
        description: team.description,
        isDefault: team.isDefault,
        memberCount: 1,
        ownerId: team.ownerId,
        createdAt: team.createdAt.toISOString(),
      },
    });
    return addCorsHeaders(response);
  } catch (error) {
    console.error('Create team error:', error);
    return errorResponse('Failed to create team', 500);
  }
}
