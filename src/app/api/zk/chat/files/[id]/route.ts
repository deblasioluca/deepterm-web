import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { readFile } from 'fs/promises';
import {
  getAuthFromRequest,
  errorResponse,
  handleCorsPreflightRequest,
  addCorsHeaders,
} from '@/lib/zk';

export async function OPTIONS() {
  return handleCorsPreflightRequest();
}

/**
 * GET /api/zk/chat/files/[id]
 * Download a chat file.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = getAuthFromRequest(request);
    if (!auth) return errorResponse('Unauthorized', 401);

    const { id } = await params;
    const chatFile = await prisma.chatFile.findUnique({
      where: { id },
    });
    if (!chatFile) return errorResponse('File not found', 404);

    // Verify org membership
    const membership = await prisma.organizationUser.findUnique({
      where: {
        organizationId_userId: {
          organizationId: chatFile.organizationId,
          userId: auth.userId,
        },
      },
    });
    if (!membership || membership.status !== 'confirmed') {
      return errorResponse('Access denied', 403);
    }

    const buffer = await readFile(chatFile.storagePath);
    const response = new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': chatFile.mimeType,
        'Content-Disposition': `attachment; filename="${chatFile.originalFilename.replace(/[\\"\r\n]/g, '_')}"`,
        'Content-Length': String(chatFile.sizeBytes),
      },
    });
    return addCorsHeaders(response);
  } catch (error) {
    console.error('File download error:', error);
    return errorResponse('Failed to download file', 500);
  }
}
