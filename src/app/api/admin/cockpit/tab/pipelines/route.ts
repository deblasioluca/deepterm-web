import { NextResponse } from 'next/server';
import { airflowJSON, getAirflowConfig } from '@/lib/airflow';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const config = await getAirflowConfig();
    if (!config) return NextResponse.json({ connected: false, dags: [], activeRuns: [], recentRuns: [] });

    const [dagsRes, runsRes] = await Promise.all([
      airflowJSON<{ dags: Array<{ dag_id: string; description: string | null; schedule_interval: { value?: string } | string | null; is_paused: boolean; tags: Array<{ name: string }>; next_dagrun: string | null; timetable_description?: string }> }>('/dags?only_active=true'),
      airflowJSON<{ dag_runs: Array<{ dag_id: string; dag_run_id: string; state: string; start_date: string | null; end_date: string | null; conf: Record<string, unknown> }> }>('/dags/~/dagRuns?limit=30&order_by=-start_date'),
    ]);

    const dags = (dagsRes.dags || []).map(d => ({
      dagId: d.dag_id, description: d.description || '',
      schedule: typeof d.schedule_interval === 'string' ? d.schedule_interval : d.schedule_interval?.value || d.timetable_description || null,
      isPaused: d.is_paused, tags: (d.tags || []).map(t => t.name), nextRun: d.next_dagrun || null,
    }));

    const allRuns = (runsRes.dag_runs || []).map(r => ({
      dagId: r.dag_id, runId: r.dag_run_id, state: r.state,
      startDate: r.start_date || null, endDate: r.end_date || null, conf: r.conf || {},
    }));

    return NextResponse.json({
      connected: true, dags,
      activeRuns: allRuns.filter(r => ['running', 'queued'].includes(r.state)),
      recentRuns: allRuns.filter(r => !['running', 'queued'].includes(r.state)).slice(0, 15),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ connected: false, dags: [], activeRuns: [], recentRuns: [], errorMessage: msg });
  }
}
