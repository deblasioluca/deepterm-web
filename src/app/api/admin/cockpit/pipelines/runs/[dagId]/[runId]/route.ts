import { NextRequest, NextResponse } from 'next/server';
import { airflowJSON } from '@/lib/airflow';

export const dynamic = 'force-dynamic';

interface AirflowTaskInstance {
  task_id: string;
  state: string | null;
  start_date: string | null;
  end_date: string | null;
  duration: number | null;
  try_number: number;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { dagId: string; runId: string } }
) {
  try {
    const { dagId, runId } = params;

    const data = await airflowJSON<{ task_instances: AirflowTaskInstance[] }>(
      `/dags/${encodeURIComponent(dagId)}/dagRuns/${encodeURIComponent(runId)}/taskInstances`
    );

    const tasks = (data.task_instances || []).map(t => ({
      taskId: t.task_id,
      state: t.state || 'no_status',
      startDate: t.start_date || null,
      endDate: t.end_date || null,
      duration: t.duration != null ? Math.round(t.duration) : null,
      tryNumber: t.try_number,
    }));

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error('Pipeline task instances error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to fetch task instances';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
