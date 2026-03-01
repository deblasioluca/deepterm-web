import { NextResponse } from 'next/server';
import { getAllModels, getDelegate } from '@/lib/database-explorer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const models = getAllModels();

    const counts = await Promise.all(
      models.map(async (m) => {
        const delegate = getDelegate(m.name);
        if (!delegate) return 0;
        try {
          return await delegate.count();
        } catch {
          return 0;
        }
      })
    );

    return NextResponse.json({
      models: models.map((m, i) => ({
        name: m.name,
        fieldCount: m.scalarFields.length,
        recordCount: counts[i],
        isProtected: m.isProtected,
      })),
    });
  } catch (error) {
    console.error('Failed to fetch models:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to fetch models' },
      { status: 500 }
    );
  }
}
