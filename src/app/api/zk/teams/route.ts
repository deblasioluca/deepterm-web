import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getAuthFromRequest,
  createAuditLog,
  getClientIP,
  errorResponse,
  successResponse,
  handleCorsPreflightRequest,
  addCorsHeaders,
} from '@/lib/zk';

export async function OPTIONS() {
  return handleCorsPreflightRequest();
}

/**
 * GET /api/zk/teams?orgId=xxx
 * List teams within an organization that the user belongs to.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);
    if (!auth) return errorResponse('Unauthorized', 401);

    const orgId = request.nextUrl.searchParams.get('orgId');
    if (!orgId) return errorResponse('orgId query parameter required');

    // Verify org membership
    const orgMembership = await prisma.organizationUser.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId: auth.userId } },
    });
    if (!orgMembership || orgMembership.status !== 'confirmed') {
      return errorResponse('Not a member of this organization', 403);
    }

    // Get teams the user is a member of
    const teams = await prisma.orgTeam.findMany({
      where: {
        organizationId: orgId,
        members: { some: { userId: auth.userId } },
      },
      include: {
        members: {
          include: { user: { select: { id: true, email: true } } },
        },
        _count: { select: { chatChannels: true, sharedSessions: true } },
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });

    const result = teams.map(team => ({
      id: team.id,
      name: team.name,
      description: team.description,
      organizationId: team.organizationId,
      ownerId: team.ownerId,
      isDefault: team.isDefault,
      allowFederation: team.allowFederation,
      members: team.members.map(m => ({
        id: m.id,
        userId: m.userId,
        email: m.user?.email ?? m.invitedEmail ?? '',
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
      })),
      channelCount: team._count.chatChannels,
      sessionCount: team._count.sharedSessions,
      createdAt: team.createdAt.toISOString(),
      updatedAt: team.updatedAt.toISOString(),
    }));

    const response = successResponse(result);
    return addCorsHeaders(response);
  } catch (error) {
    console.error('List teams error:', error);
    return errorResponse('Failed to list teams', 500);
  }
}

/**
 * POST /api/zk/teams
 * Create a new team within an organization.
 * Body: { orgId, name, description? }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);
    if (!auth) return errorResponse('Unauthorized', 401);

    const body = await request.json();
    const { orgId, name, description } = body;

    if (!orgId) return errorResponse('orgId is required');
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return errorResponse('name is required');
    }

    // Verify org membership (must be admin or owner to create teams)
    const orgMembership = await prisma.organizationUser.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId: auth.userId } },
    });
    if (!orgMembership || orgMembership.status !== 'confirmed') {
      return errorResponse('Not a member of this organization', 403);
    }
    if (!['owner', 'admin'].includes(orgMembership.role)) {
      return errorResponse('Only org owners and admins can create teams', 403);
    }

    // Check for duplicate team name
    const existing = await prisma.orgTeam.findUnique({
      where: { organizationId_name: { organizationId: orgId, name: name.trim() } },
    });
    if (existing) {
      return errorResponse('A team with this name already exists in the organization');
    }

    // Create team with creator as owner member
    const team = await prisma.orgTeam.create({
      data: {
        organizationId: orgId,
        name: name.trim(),
        description: description || null,
        ownerId: auth.userId,
        members: {
          create: { userId: auth.userId, role: 'owner' },
        },
      },
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

    const response = successResponse({ id: team.id }, 201);
    return addCorsHeaders(response);
  } catch (error) {
    console.error('Create team error:', error);
    return errorResponse('Failed to create team', 500);
  }
}
