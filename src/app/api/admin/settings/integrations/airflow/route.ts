import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encryptApiKey, decryptApiKey, maskApiKey } from '@/lib/ai-encryption';

export const dynamic = 'force-dynamic';

// GET: Return current Airflow config (password masked)
export async function GET() {
  try {
    const settings = await prisma.systemSettings.findMany({
      where: { key: { in: ['airflow_url', 'airflow_username', 'airflow_password'] } },
    });
    const map = new Map(settings.map(s => [s.key, s.value]));

    const url = map.get('airflow_url') || '';
    const username = map.get('airflow_username') || '';
    const encryptedPassword = map.get('airflow_password') || '';

    return NextResponse.json({
      url,
      username,
      passwordMasked: encryptedPassword ? maskApiKey(decryptApiKey(encryptedPassword)) : '',
      hasPassword: !!encryptedPassword,
    });
  } catch (error) {
    console.error('Airflow config GET error:', error);
    return NextResponse.json({ error: 'Failed to read Airflow config' }, { status: 500 });
  }
}

// POST: Save Airflow credentials
export async function POST(req: NextRequest) {
  try {
    const { url, username, password } = await req.json();

    if (!url || !username || !password) {
      return NextResponse.json(
        { error: 'url, username, and password are required' },
        { status: 400 }
      );
    }

    // Upsert all 3 keys
    await Promise.all([
      prisma.systemSettings.upsert({
        where: { key: 'airflow_url' },
        update: { value: url.replace(/\/+$/, '') },
        create: { key: 'airflow_url', value: url.replace(/\/+$/, '') },
      }),
      prisma.systemSettings.upsert({
        where: { key: 'airflow_username' },
        update: { value: username },
        create: { key: 'airflow_username', value: username },
      }),
      prisma.systemSettings.upsert({
        where: { key: 'airflow_password' },
        update: { value: encryptApiKey(password) },
        create: { key: 'airflow_password', value: encryptApiKey(password) },
      }),
    ]);

    return NextResponse.json({ ok: true, message: 'Airflow credentials saved' });
  } catch (error) {
    console.error('Airflow config POST error:', error);
    return NextResponse.json({ error: 'Failed to save Airflow config' }, { status: 500 });
  }
}
