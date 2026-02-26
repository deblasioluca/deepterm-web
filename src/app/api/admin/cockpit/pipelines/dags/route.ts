import { NextResponse } from 'next/server';
import { airflowJSON } from '@/lib/airflow';

export const dynamic = 'force-dynamic';

interface AirflowDag {
  dag_id: string;
  description: string | null;
  schedule_interval: { value?: string } | string | null;
  is_paused: boolean;
  tags: Array<{ name: string }>;
  next_dagrun: string | null;
  timetable_description?: string;
}

export async function GET() {
  try {
    const data = await airflowJSON<{ dags: AirflowDag[] }>('/dags?only_active=true');

    const dags = (data.dags || []).map(d => ({
      dagId: d.dag_id,
      description: d.description || '',
      schedule: typeof d.schedule_interval === 'string'
        ? d.schedule_interval
        : d.schedule_interval?.value || d.timetable_description || null,
      isPaused: d.is_paused,
      tags: (d.tags || []).map(t => t.name),
      nextRun: d.next_dagrun || null,
    }));

    return NextResponse.json({ dags });
  } catch (error) {
    console.error('Pipeline dags error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to fetch DAGs';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
