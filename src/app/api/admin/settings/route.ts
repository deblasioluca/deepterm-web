import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - Get all system settings
export async function GET() {
  try {
    const settings = await prisma.systemSettings.findMany();
    
    const settingsMap: Record<string, string> = {};
    settings.forEach((s) => {
      settingsMap[s.key] = s.value;
    });

    return NextResponse.json({
      siteName: settingsMap.siteName || 'DeepTerm',
      siteUrl: settingsMap.siteUrl || process.env.NEXTAUTH_URL || 'https://deepterm.net',
      supportEmail: settingsMap.supportEmail || 'support@deepterm.net',
      helpPageContent: settingsMap.helpPageContent || '',
      maintenanceMode: settingsMap.maintenanceMode === 'true',
      allowRegistration: settingsMap.allowRegistration !== 'false',
      requireEmailVerification: settingsMap.requireEmailVerification !== 'false',
      notifyUsersOnNewVersion: settingsMap.notifyUsersOnNewVersion === 'true',
      maxTeamSize: parseInt(settingsMap.maxTeamSize || '100'),
      trialDays: parseInt(settingsMap.trialDays || '14'),
    });
  } catch (error) {
    console.error('Failed to fetch settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

// POST - Update system settings
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const settingsToUpdate = [
      { key: 'siteName', value: body.siteName },
      { key: 'siteUrl', value: body.siteUrl },
      { key: 'supportEmail', value: body.supportEmail },
      { key: 'helpPageContent', value: body.helpPageContent },
      { key: 'maintenanceMode', value: String(body.maintenanceMode) },
      { key: 'allowRegistration', value: String(body.allowRegistration) },
      { key: 'requireEmailVerification', value: String(body.requireEmailVerification) },
      { key: 'notifyUsersOnNewVersion', value: String(body.notifyUsersOnNewVersion) },
      { key: 'maxTeamSize', value: String(body.maxTeamSize) },
      { key: 'trialDays', value: String(body.trialDays) },
    ];

    for (const setting of settingsToUpdate) {
      if (setting.value !== undefined) {
        await prisma.systemSettings.upsert({
          where: { key: setting.key },
          update: { value: setting.value },
          create: { key: setting.key, value: setting.value },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
