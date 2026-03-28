import { NextResponse } from 'next/server';
import { listAliases, createAlias } from '@/lib/improvmx';

/** GET /api/admin/email/aliases — list all email aliases */
export async function GET() {
  try {
    const aliases = await listAliases();
    return NextResponse.json({ aliases });
  } catch (error) {
    console.error('Failed to list email aliases:', error);
    return NextResponse.json(
      { error: 'Failed to list aliases', message: String(error) },
      { status: 500 },
    );
  }
}

/** POST /api/admin/email/aliases — create a new alias */
export async function POST(request: Request) {
  try {
    const body = await request.json() as { alias?: string; forward?: string };
    const { alias, forward } = body;

    if (!alias || !forward) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'alias and forward are required' },
        { status: 400 },
      );
    }

    // Basic validation
    if (!/^[a-zA-Z0-9._*-]+$/.test(alias)) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Invalid alias format. Use letters, numbers, dots, hyphens, or * for catch-all.' },
        { status: 400 },
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forward)) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Invalid forwarding email address' },
        { status: 400 },
      );
    }

    const created = await createAlias(alias, forward);
    return NextResponse.json({ alias: created }, { status: 201 });
  } catch (error) {
    console.error('Failed to create email alias:', error);
    const message = String(error);
    const status = message.includes('409') || message.includes('already exists') ? 409 : 500;
    return NextResponse.json(
      { error: 'Failed to create alias', message },
      { status },
    );
  }
}
