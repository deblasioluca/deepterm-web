import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const REPOS: Record<string, string> = {
  'deepterm-web': 'deblasioluca/deepterm-web',
  'deepterm': 'deblasioluca/deepterm',
};

export async function POST(req: NextRequest) {
  try {
    const { repo, workflow, ref } = await req.json();

    if (!repo || !workflow) {
      return NextResponse.json({ error: 'repo and workflow required' }, { status: 400 });
    }
    if (!GITHUB_TOKEN) {
      return NextResponse.json({ error: 'GITHUB_TOKEN not configured' }, { status: 500 });
    }

    const fullRepo = REPOS[repo] || repo;
    const branch = ref || 'main';

    const res = await fetch(
      `https://api.github.com/repos/${fullRepo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ ref: branch }),
      }
    );

    if (res.status === 204) {
      return NextResponse.json({ ok: true, message: `Triggered ${workflow} on ${fullRepo} (${branch})` });
    }

    const body = await res.text();
    return NextResponse.json(
      { error: `GitHub returned ${res.status}: ${body}` },
      { status: res.status }
    );
  } catch (error) {
    console.error('GitHub dispatch error:', error);
    return NextResponse.json({ error: 'Failed to dispatch workflow' }, { status: 500 });
  }
}
