import { NextRequest, NextResponse } from 'next/server';
import { submitReview } from '@/lib/github-pulls';

function decodeRepo(encoded: string): string {
  return encoded.replace('--', '/');
}

export async function POST(
  req: NextRequest,
  { params }: { params: { repo: string; number: string } }
) {
  try {
    const repo = decodeRepo(params.repo);
    const prNumber = parseInt(params.number, 10);
    if (isNaN(prNumber)) {
      return NextResponse.json({ error: 'Invalid PR number' }, { status: 400 });
    }

    const { event, body } = await req.json();
    if (!['APPROVE', 'REQUEST_CHANGES', 'COMMENT'].includes(event)) {
      return NextResponse.json({ error: 'Invalid review event' }, { status: 400 });
    }

    const result = await submitReview(repo, prNumber, event, body);
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Review failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
