import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json(
      { error: "Missing sessionId" },
      { status: 400 }
    );
  }

  const [job] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.stripeSessionId, sessionId))
    .limit(1);

  if (!job) {
    return NextResponse.json({ jobId: null });
  }

  return NextResponse.json({ jobId: job.id, status: job.status });
}
