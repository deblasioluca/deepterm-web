import { NextRequest, NextResponse } from 'next/server';
import { airflowJSON, airflowFetch, getAirflowConfig } from '@/lib/airflow';

export const dynamic = 'force-dynamic';

const STUCK_THRESHOLD_MS = 60 * 60 * 1000; // 60 minutes

interface AirflowDagRun {
  dag_id: string;
  dag_run_id: string;
  state: string;
  start_date: string | null;
  end_date: string | null;
  execution_date: string;
  logical_date: string;
  conf: Record<string, unknown>;
  note: string | null;
}

export async function GET() {
  try {
    const config = await getAirflowConfig();
    if (!config) {
      return NextResponse.json({
        configured: false,
        runs: [],
        error: 'Airflow not configured. Add credentials in Settings → Integrations.',
      });
    }

    // Fetch DAG runs from the last 24 hours across all DAGs
    const since = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const data = await airflowJSON<{ dag_runs: AirflowDagRun[]; total_entries: number }>(
      `/dags/~/dagRuns?limit=200&order_by=-start_date&start_date_gte=${encodeURIComponent(since)}`
    );

    const now = Date.now();
    const runs = (data.dag_runs || []).map(r => {
      const startMs = r.start_date ? new Date(r.start_date).getTime() : null;
      const endMs = r.end_date ? new Date(r.end_date).getTime() : null;
      const durationMs = startMs
        ? (endMs ? endMs - startMs : (r.state === 'running' ? now - startMs : null))
        : null;
      const isStuck =
        r.state === 'running' &&
        durationMs !== null &&
        durationMs > STUCK_THRESHOLD_MS;

      return {
        dagId: r.dag_id,
        runId: r.dag_run_id,
        state: r.state,            // queued | running | success | failed
        startDate: r.start_date,
        endDate: r.end_date,
        executionDate: r.execution_date || r.logical_date,
        conf: r.conf || {},
        note: r.note || null,
        durationMs,
        isStuck,
      };
    });

    return NextResponse.json({ configured: true, runs });
  } catch (error) {
    console.error('AI Dev Mac tab error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to fetch Airflow runs';
    return NextResponse.json({ configured: false, runs: [], error: msg }, { status: 502 });
  }
}

// POST: trigger a new DAG run or clear/mark-failed a stuck run
export async function POST(req: NextRequest) {
  try {
    const {
      action,
      dagId,
      runId,
    } = await req.json() as { action: 'trigger' | 'clear' | 'mark-failed'; dagId: string; runId?: string };

    if (!dagId || !action) {
      return NextResponse.json({ error: 'dagId and action required' }, { status: 400 });
    }

    const config = await getAirflowConfig();
    if (!config) {
      return NextResponse.json({ error: 'Airflow not configured' }, { status: 500 });
    }

    if (action === 'trigger') {
      const res = await airflowFetch(`/dags/${encodeURIComponent(dagId)}/dagRuns`, {
        method: 'POST',
        body: JSON.stringify({ dag_run_id: `manual_${Date.now()}`, conf: {} }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return NextResponse.json({ error: `Airflow ${res.status}: ${text}` }, { status: res.status });
      }
      return NextResponse.json({ ok: true, message: `DAG ${dagId} triggered` });
    }

    if (action === 'mark-failed') {
      if (!runId) return NextResponse.json({ error: 'runId required for mark-failed' }, { status: 400 });
      const res = await airflowFetch(
        `/dags/${encodeURIComponent(dagId)}/dagRuns/${encodeURIComponent(runId)}`,
        { method: 'PATCH', body: JSON.stringify({ state: 'failed' }) }
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return NextResponse.json({ error: `Airflow ${res.status}: ${text}` }, { status: res.status });
      }
      return NextResponse.json({ ok: true, message: `Run ${runId} marked as failed` });
    }

    if (action === 'clear') {
      // Clear all task instances in the run so they can re-run
      if (!runId) return NextResponse.json({ error: 'runId required for clear' }, { status: 400 });
      const res = await airflowFetch(
        `/dags/${encodeURIComponent(dagId)}/dagRuns/${encodeURIComponent(runId)}/clear`,
        { method: 'POST', body: JSON.stringify({ dry_run: false }) }
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return NextResponse.json({ error: `Airflow ${res.status}: ${text}` }, { status: res.status });
      }
      return NextResponse.json({ ok: true, message: `Run ${runId} cleared — tasks will re-run` });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error('AI Dev Mac action error:', error);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
