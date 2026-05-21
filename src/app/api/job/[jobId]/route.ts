import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireJobOwnership } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    const { session, error: authErr } = await requireSession();
    if (authErr) return authErr;

    const { job, error: jobErr } = await requireJobOwnership(jobId, session.user.email);
    if (jobErr) return jobErr;

    return NextResponse.json({
      id: job.id,
      status: job.status,
      contactCount: job.contactCount,
      errorMessage: job.errorMessage,
      providerMode: job.providerMode,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    });
  } catch (error) {
    console.error("Job status error:", error);
    return NextResponse.json(
      { error: "Failed to get job status" },
      { status: 500 }
    );
  }
}
