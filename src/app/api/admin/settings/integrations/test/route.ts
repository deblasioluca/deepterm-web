import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { integration } = await request.json();

    if (integration === 'github') {
      const token = process.env.GITHUB_TOKEN;
      if (!token) return NextResponse.json({ ok: false, message: 'GITHUB_TOKEN not configured' }, { status: 400 });

      const res = await fetch('https://api.github.com/repos/deblasioluca/deepterm', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        return NextResponse.json({ ok: false, message: `GitHub API returned ${res.status}` });
      }
      const data = await res.json();
      return NextResponse.json({ ok: true, message: `Connected to ${data.full_name} (${data.open_issues_count} open issues)` });
    }

    if (integration === 'node-red') {
      const url = process.env.NODE_RED_URL;
      if (!url) return NextResponse.json({ ok: false, message: 'NODE_RED_URL not configured' }, { status: 400 });

      const res = await fetch(`${url}/deepterm/health`, {
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        return NextResponse.json({ ok: true, message: `Node-RED reachable at ${url}` });
      }
      return NextResponse.json({ ok: false, message: `Node-RED returned ${res.status}` });
    }

    if (integration === 'ai-dev') {
      const key = process.env.AI_DEV_API_KEY || process.env.NODE_RED_API_KEY;
      if (!key) return NextResponse.json({ ok: false, message: 'AI_DEV_API_KEY not configured' }, { status: 400 });
      // AI Dev Mac is a pull-based model — we can only confirm the key is set
      return NextResponse.json({ ok: true, message: 'AI Dev API key is configured. The Mac polls /api/internal/ai-dev/tasks for work.' });
    }

    if (integration === 'airflow') {
      try {
        const { airflowJSON } = await import('@/lib/airflow');
        const health = await airflowJSON<{ metadatabase?: { status?: string } }>('/health');
        // Also count DAGs for a nicer message
        let dagCount = 0;
        try {
          const dags = await airflowJSON<{ dags: unknown[] }>('/dags?only_active=true');
          dagCount = dags.dags?.length || 0;
        } catch { /* ok */ }
        const dbStatus = health.metadatabase?.status || 'unknown';
        return NextResponse.json({
          ok: true,
          message: `Connected to Airflow (DB: ${dbStatus}, ${dagCount} active DAGs)`,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Connection failed';
        return NextResponse.json({ ok: false, message: msg });
      }
    }

    return NextResponse.json({ ok: false, message: `Unknown integration: ${integration}` }, { status: 400 });
  } catch (error) {
    console.error('Integration test error:', error);
    const msg = error instanceof Error ? error.message : 'Test failed';
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}
