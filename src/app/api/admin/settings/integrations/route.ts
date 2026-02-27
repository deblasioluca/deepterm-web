import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ghToken = process.env.GITHUB_TOKEN;
    const nodeRedUrl = process.env.NODE_RED_URL;
    const aiDevKey = process.env.AI_DEV_API_KEY || process.env.NODE_RED_API_KEY;

    // GitHub: check last sync time from GithubIssue table
    let lastSync: string | null = null;
    try {
      const latest = await prisma.githubIssue.findFirst({
        orderBy: { syncedAt: 'desc' },
        select: { syncedAt: true },
      });
      if (latest) lastSync = latest.syncedAt.toISOString();
    } catch { /* table may not exist */ }

    // Airflow: check SystemSettings
    let airflowConfigured = false;
    let airflowUrl: string | null = null;
    try {
      const afSettings = await prisma.systemSettings.findMany({
        where: { key: { in: ['airflow_url', 'airflow_username', 'airflow_password'] } },
      });
      const afMap = new Map(afSettings.map(s => [s.key, s.value]));
      airflowUrl = afMap.get('airflow_url') || null;
      airflowConfigured = !!(afMap.get('airflow_url') && afMap.get('airflow_username') && afMap.get('airflow_password'));
    } catch { /* table may not exist */ }

    return NextResponse.json({
      pi: { configured: true, address: 'localhost', detail: 'Running this web app' },
      webApp: { configured: true, address: 'localhost:3000', detail: 'Next.js via PM2' },
      ciMac: { configured: !!ghToken, detail: ghToken ? 'Via GitHub Actions runner' : 'GITHUB_TOKEN not set' },
      github: {
        configured: !!ghToken,
        repo: ghToken ? 'deblasioluca/deepterm' : null,
        lastSync,
      },
      nodeRed: {
        configured: !!nodeRedUrl,
        url: nodeRedUrl || null,
        reachable: null,
      },
      aiDev: {
        configured: !!aiDevKey,
      },
      airflow: {
        configured: airflowConfigured,
        url: airflowUrl,
      },
    });
  } catch (error) {
    console.error('Integration status error:', error);
    return NextResponse.json({ error: 'Failed to get integration status' }, { status: 500 });
  }
}
