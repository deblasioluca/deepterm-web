import { NextRequest, NextResponse } from 'next/server';
import { airflowJSON } from '@/lib/airflow';

export const dynamic = 'force-dynamic';

interface AirflowDagRun {
  dag_id: string;
  dag_run_id: string;
  state: string;
  start_date: string | null;
  end_date: string | null;
  conf: Record<string, unknown>;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10), 100);

    const data = await airflowJSON<{ dag_runs: AirflowDagRun[] }>(
      `/dags/~/dagRuns?limit=${limit}&order_by=-start_date`
    );

    const runs = (data.dag_runs || []).map(r => ({
      dagId: r.dag_id,
      runId: r.dag_run_id,
      state: r.state,
      startDate: r.start_date || null,
      endDate: r.end_date || null,
      conf: r.conf || {},
    }));

    return NextResponse.json({ runs });
  } catch (error) {
    console.error('Pipeline runs error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to fetch runs';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
