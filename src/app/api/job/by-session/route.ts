import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { requireSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { session, error: authErr } = await requireSession();
  if (authErr) return authErr;

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

  if (!job || job.userEmail !== session.user.email) {
    return NextResponse.json({ jobId: null });
  }

  return NextResponse.json({ jobId: job.id, status: job.status });
}
