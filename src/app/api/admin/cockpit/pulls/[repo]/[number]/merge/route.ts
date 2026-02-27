import { NextRequest, NextResponse } from 'next/server';
import { mergePR } from '@/lib/github-pulls';

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

    const body = await req.json().catch(() => ({}));
    const method = body.method || 'squash';
    const commitTitle = body.commitTitle;

    const result = await mergePR(repo, prNumber, method, commitTitle);
    if (result.merged) {
      return NextResponse.json(result);
    }
    return NextResponse.json(result, { status: 409 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Merge failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
