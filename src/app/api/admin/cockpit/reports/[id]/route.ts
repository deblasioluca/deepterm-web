import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET: Full report detail
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const report = await prisma.implementationReport.findUnique({
      where: { id: params.id },
    });
    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }
    return NextResponse.json(report);
  } catch (error) {
    console.error('Report get error:', error);
    return NextResponse.json({ error: 'Failed to get report' }, { status: 500 });
  }
}

// PATCH: Update report fields
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const { summary, testsAdded, testsUpdated, docsUpdated, helpPagesUpdated, filesChanged, prNumbers, status } = body;

    const data: Record<string, unknown> = {};
    if (summary !== undefined) data.summary = summary;
    if (testsAdded !== undefined) data.testsAdded = typeof testsAdded === 'string' ? testsAdded : JSON.stringify(testsAdded);
    if (testsUpdated !== undefined) data.testsUpdated = typeof testsUpdated === 'string' ? testsUpdated : JSON.stringify(testsUpdated);
    if (docsUpdated !== undefined) data.docsUpdated = typeof docsUpdated === 'string' ? docsUpdated : JSON.stringify(docsUpdated);
    if (helpPagesUpdated !== undefined) data.helpPagesUpdated = typeof helpPagesUpdated === 'string' ? helpPagesUpdated : JSON.stringify(helpPagesUpdated);
    if (filesChanged !== undefined) data.filesChanged = typeof filesChanged === 'string' ? filesChanged : JSON.stringify(filesChanged);
    if (prNumbers !== undefined) data.prNumbers = typeof prNumbers === 'string' ? prNumbers : JSON.stringify(prNumbers);
    if (status !== undefined) data.status = status;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const report = await prisma.implementationReport.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json(report);
  } catch (error) {
    console.error('Report update error:', error);
    return NextResponse.json({ error: 'Failed to update report' }, { status: 500 });
  }
}
