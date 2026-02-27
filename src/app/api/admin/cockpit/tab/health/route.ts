import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    let nodeRedStatus = "offline";
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch("http://192.168.1.30:1880", { signal: ctrl.signal });
      clearTimeout(tid);
      nodeRedStatus = res.ok ? "online" : "degraded";
    } catch { nodeRedStatus = "offline"; }

    let ciMacStatus = "unknown";
    try {
      const ghToken = process.env.GITHUB_TOKEN;
      if (ghToken) {
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
          ciMacStatus = runner?.status === "online" ? "online" : "offline";
        }
      }
    } catch { ciMacStatus = "unknown"; }

    const builds = await prisma.ciBuild.findMany({ orderBy: { createdAt: "desc" }, take: 10 }).catch(() => []);

    return NextResponse.json({
      health: {
        pi: { status: "online", uptimeSeconds: Math.floor(process.uptime()), memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024), heapMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) },
        nodeRed: { status: nodeRedStatus },
        ciMac: { status: ciMacStatus },
      },
      builds,
    });
  } catch (error) {
    console.error("Health tab error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
