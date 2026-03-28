import { NextResponse } from 'next/server';
import { updateAlias, deleteAlias } from '@/lib/improvmx';

/** PUT /api/admin/email/aliases/[id] — update forwarding address */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json() as { forward?: string };
    const { forward } = body;

    if (!forward) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'forward is required' },
        { status: 400 },
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forward)) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Invalid forwarding email address' },
        { status: 400 },
      );
    }

    const updated = await updateAlias(id, forward);
    return NextResponse.json({ alias: updated });
  } catch (error) {
    console.error('Failed to update email alias:', error);
    return NextResponse.json(
      { error: 'Failed to update alias', message: String(error) },
      { status: 500 },
    );
  }
}

/** DELETE /api/admin/email/aliases/[id] — delete an alias */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await deleteAlias(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete email alias:', error);
    return NextResponse.json(
      { error: 'Failed to delete alias', message: String(error) },
      { status: 500 },
    );
  }
}
