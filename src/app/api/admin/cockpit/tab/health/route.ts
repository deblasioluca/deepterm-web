import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";

async function checkWithTimeout(fn: () => Promise<any>, timeoutMs = 3000): Promise<any> {
  return Promise.race([
    fn(),
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
  ]).catch(() => null);
}

async function checkNodeRed() {
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(process.env.NODE_RED_URL || "http://192.168.1.30:1880", { signal: ctrl.signal });
    clearTimeout(tid);
    return { status: res.ok ? "online" : "degraded" };
  } catch { return { status: "offline" }; }
}

async function checkCiMac() {
  try {
    const ghToken = process.env.GITHUB_TOKEN;
    if (!ghToken) return { status: "unknown", detail: "No GitHub token" };
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch("https://api.github.com/repos/deblasioluca/deepterm/actions/runners", {
      headers: { Authorization: `Bearer ${ghToken}`, Accept: "application/vnd.github+json" },
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (res.ok) {
      const data = await res.json();
      const runner = data.runners?.[0];
      return { status: runner?.status === "online" ? "online" : "offline", runnerName: runner?.name || "unknown" };
    }
    return { status: "unknown" };
  } catch { return { status: "unknown" }; }
}

async function checkGitHub() {
  try {
    const ghToken = process.env.GITHUB_TOKEN;
    if (!ghToken) return { status: "unknown", detail: "No token" };
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch("https://api.github.com/rate_limit", {
      headers: { Authorization: `Bearer ${ghToken}`, Accept: "application/vnd.github+json" },
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (res.ok) {
      const data = await res.json();
      const core = data.resources?.core;
      return { status: "online", rateLimit: core?.limit, rateRemaining: core?.remaining };
    }
    return { status: "degraded" };
  } catch { return { status: "offline" }; }
}

async function checkAiDevMac() {
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`${process.env.AIRFLOW_URL || "http://192.168.1.249:8080"}/api/v1/health`, {
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (res.ok) return { status: "online", detail: "Airflow healthy" };
    return { status: "degraded", detail: `HTTP ${res.status}` };
  } catch {
    // Airflow might not be running but Mac might be reachable
    try {
      const { stdout } = await execAsync(`ping -c 1 -W 2 ${process.env.AI_DEV_MAC_HOST || "192.168.1.249"} 2>/dev/null`);
      if (stdout.includes("1 packets received") || stdout.includes("1 received")) {
        return { status: "degraded", detail: "Reachable but Airflow not responding" };
      }
    } catch {}
    return { status: "offline" };
  }
}

async function checkAirflow() {
  try {
    const settings = await prisma.systemSettings.findFirst({ where: { key: "airflow_base_url" } });
    const url = settings?.value || process.env.AIRFLOW_URL || "http://192.168.1.249:8080";
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`${url}/api/v1/health`, { signal: ctrl.signal });
    clearTimeout(tid);
    if (res.ok) {
      const data = await res.json();
      const scheduler = data.metadatabase?.status === "healthy" && data.scheduler?.status === "healthy";
      return { status: scheduler ? "online" : "degraded", detail: JSON.stringify(data) };
    }
    return { status: "degraded" };
  } catch { return { status: "offline" }; }
}

async function getPiHardware() {
  try {
    const [uptimeRes, diskRes, tempRes] = await Promise.all([
      execAsync("cat /proc/uptime 2>/dev/null").catch(() => ({ stdout: "" })),
      execAsync("df -h / 2>/dev/null | tail -1").catch(() => ({ stdout: "" })),
      execAsync("cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null").catch(() => ({ stdout: "" })),
    ]);
    const osUptime = Math.floor(parseFloat(uptimeRes.stdout?.split(" ")[0] || "0"));
    const diskParts = diskRes.stdout?.trim().split(/\s+/) || [];
    const tempC = tempRes.stdout?.trim() ? (parseInt(tempRes.stdout.trim()) / 1000).toFixed(1) : null;
    return {
      osUptimeSeconds: osUptime,
      diskTotal: diskParts[1] || "?",
      diskUsed: diskParts[2] || "?",
      diskPercent: diskParts[4] || "?",
      tempC,
    };
  } catch { return {}; }
}

export async function GET() {
  try {
    const [nodeRed, ciMac, github, aiDevMac, airflow, piHw, builds] = await Promise.all([
      checkNodeRed(),
      checkCiMac(),
      checkGitHub(),
      checkAiDevMac(),
      checkAirflow(),
      getPiHardware(),
      prisma.ciBuild.findMany({ orderBy: { createdAt: "desc" }, take: 10 }).catch(() => []),
    ]);

    return NextResponse.json({
      health: {
        addresses: {
          nodeRed: process.env.NODE_RED_URL || "http://192.168.1.30:1880",
          ciMac: process.env.CI_MAC_HOST || "unknown",
          aiDevMac: process.env.AI_DEV_MAC_HOST || "unknown",
          airflow: process.env.AIRFLOW_URL || "http://192.168.1.249:8080",
        },
        pi: {
          status: "online",
          uptimeSeconds: Math.floor(process.uptime()),
          memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
          heapMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          ...piHw,
        },
        webApp: {
          status: "online",
          uptimeSeconds: Math.floor(process.uptime()),
          memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
          heapMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          nodeVersion: process.version,
        },
        ciMac,
        nodeRed,
        github,
        aiDevMac,
        airflow,
      },
      builds,
    });
  } catch (error) {
    console.error("Health tab error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
