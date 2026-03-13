#!/usr/bin/env node
// Daily cleanup script — called by PM2 cron at 3am
// Hits the internal cron endpoint to clean expired tokens + rate limit entries
const secret = process.env.CRON_SECRET;
const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';

if (!secret) {
  console.error('[cleanup] CRON_SECRET not set, aborting');
  process.exit(1);
}

async function run() {
  try {
    const res = await fetch(`${baseUrl}/api/internal/cron/cleanup`, {
      headers: { 'x-cron-secret': secret },
    });
    const data = await res.json();
    if (res.ok) {
      console.log('[cleanup]', JSON.stringify(data));
    } else {
      console.error('[cleanup] HTTP', res.status, JSON.stringify(data));
      process.exit(1);
    }
  } catch (err) {
    console.error('[cleanup] Error:', err.message);
    process.exit(1);
  }
}

run();
