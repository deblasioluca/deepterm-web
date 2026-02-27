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

interface AirflowTaskInstance {
  task_id: string;
  state: string | null;
}

/**
 * Compute effective state: if Airflow says "success" but tasks failed, override.
 * Airflow can mark a run as "success" when some tasks fail if they have
 * trigger_rule=all_done or other non-default rules.
 */
async function computeEffectiveState(run: AirflowDagRun): Promise<string> {
  if (run.state !== 'success') return run.state;
  
  try {
    const data = await airflowJSON<{ task_instances: AirflowTaskInstance[] }>(
      `/dags/${encodeURIComponent(run.dag_id)}/dagRuns/${encodeURIComponent(run.dag_run_id)}/taskInstances?limit=200`
    );
    const tasks = data.task_instances || [];
    if (tasks.some(t => t.state === 'failed')) return 'failed';
    if (tasks.some(t => t.state === 'upstream_failed')) return 'upstream_failed';
  } catch {
    // If we can't fetch tasks, trust the run state
  }
  return run.state;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10), 100);

    const data = await airflowJSON<{ dag_runs: AirflowDagRun[] }>(
      `/dags/~/dagRuns?limit=${limit}&order_by=-start_date`
    );

    const dagRuns = data.dag_runs || [];

    // Compute effective states for "success" runs (parallel)
    const effectiveStates = await Promise.all(
      dagRuns.map(r => computeEffectiveState(r))
    );

    const runs = dagRuns.map((r, i) => ({
      dagId: r.dag_id,
      runId: r.dag_run_id,
      state: effectiveStates[i],
      airflowState: r.state,
      stateOverridden: effectiveStates[i] !== r.state,
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
