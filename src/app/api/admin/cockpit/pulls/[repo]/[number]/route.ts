import { NextRequest, NextResponse } from 'next/server';
import { getPRFiles, getPRReviews } from '@/lib/github-pulls';

export const dynamic = 'force-dynamic';

// repo param is encoded as "owner--reponame" (double dash replaces slash)
function decodeRepo(encoded: string): string {
  return encoded.replace('--', '/');
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { repo: string; number: string } }
) {
  try {
    const repo = decodeRepo(params.repo);
    const prNumber = parseInt(params.number, 10);
    if (isNaN(prNumber)) {
      return NextResponse.json({ error: 'Invalid PR number' }, { status: 400 });
    }

    const [files, reviews] = await Promise.all([
      getPRFiles(repo, prNumber),
      getPRReviews(repo, prNumber),
    ]);

    return NextResponse.json({ files, reviews });
  } catch (error) {
    console.error('PR detail error:', error);
    const msg = error instanceof Error ? error.message : 'Failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
