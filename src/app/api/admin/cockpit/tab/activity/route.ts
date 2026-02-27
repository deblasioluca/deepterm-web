import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const events = await prisma.githubEvent.findMany({ orderBy: { createdAt: "desc" }, take: 15 });
    return NextResponse.json({ events });
  } catch { return NextResponse.json({ events: [] }); }
}
