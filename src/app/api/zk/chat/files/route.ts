import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import {
  getAuthFromRequest,
  errorResponse,
  successResponse,
  handleCorsPreflightRequest,
  addCorsHeaders,
} from '@/lib/zk';

export async function OPTIONS() {
  return handleCorsPreflightRequest();
}

/**
 * POST /api/zk/chat/files
 * Upload a file for team chat.
 * Expects multipart form data with: file, orgId
 */
export async function POST(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);
    if (!auth) return errorResponse('Unauthorized', 401);

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const orgId = formData.get('orgId') as string | null;

    if (!file) return errorResponse('file is required');
    if (!orgId) return errorResponse('orgId is required');

    // Verify membership
    const membership = await prisma.organizationUser.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId: auth.userId } },
    });
    if (!membership || membership.status !== 'confirmed') {
      return errorResponse('Not a member of this organization', 403);
    }

    // Max file size: 50MB
    if (file.size > 50 * 1024 * 1024) {
      return errorResponse('File too large (max 50MB)');
    }

    // Save to disk
    const uploadDir = path.join(process.cwd(), 'uploads', 'chat', orgId);
    await mkdir(uploadDir, { recursive: true });

    const ext = path.extname(file.name) || '';
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const storagePath = path.join(uploadDir, filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(storagePath, buffer);

    const chatFile = await prisma.chatFile.create({
      data: {
        organizationId: orgId,
        uploaderId: auth.userId,
        originalFilename: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        storagePath,
      },
    });

    const response = successResponse({
      id: chatFile.id,
      originalFilename: chatFile.originalFilename,
      mimeType: chatFile.mimeType,
      sizeBytes: chatFile.sizeBytes,
    }, 201);
    return addCorsHeaders(response);
  } catch (error) {
    console.error('File upload error:', error);
    return errorResponse('Failed to upload file', 500);
  }
}
