import { NextRequest, NextResponse } from 'next/server';
import { airflowJSON } from '@/lib/airflow';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { dagId, conf } = await req.json();

    if (!dagId) {
      return NextResponse.json({ error: 'dagId is required' }, { status: 400 });
    }

    const result = await airflowJSON<{ dag_run_id: string; state: string }>(
      `/dags/${encodeURIComponent(dagId)}/dagRuns`,
      {
        method: 'POST',
        body: JSON.stringify({ conf: conf || {} }),
      }
    );

    return NextResponse.json({
      ok: true,
      runId: result.dag_run_id,
      state: result.state,
      message: `Triggered ${dagId}`,
    });
  } catch (error) {
    console.error('Pipeline trigger error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to trigger DAG';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
