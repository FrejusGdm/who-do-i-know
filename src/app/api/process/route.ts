import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { account, user } from "@/db/schema";
import { runCloudPipeline } from "@/lib/pipeline";
import { requireSession, requireJobOwnership } from "@/lib/auth-guard";
import type { FilterConfig, LLMProviderMode } from "@/types";

export const dynamic = "force-dynamic";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { session, error: authErr } = await requireSession();
    if (authErr) return authErr;

    const { jobId, byokApiKey, ollamaModel } = await req.json();

    const { job, error: jobErr } = await requireJobOwnership(jobId, session.user.email);
    if (jobErr) return jobErr;

    // Find the Google access token via the job's userEmail
    const [owner] = await db
      .select()
      .from(user)
      .where(eq(user.email, job.userEmail))
      .limit(1);

    if (!owner) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const [googleAccount] = await db
      .select()
      .from(account)
      .where(
        and(
          eq(account.userId, owner.id),
          eq(account.providerId, "google")
        )
      )
      .limit(1);

    const accessToken = googleAccount?.accessToken;
    if (!accessToken) {
      return NextResponse.json(
        { error: "No Google access token found" },
        { status: 401 }
      );
    }

    runCloudPipeline(
      jobId,
      owner.id,
      accessToken,
      job.filterConfig as FilterConfig,
      job.userEmail,
      job.providerMode as LLMProviderMode,
      byokApiKey,
      ollamaModel
    ).catch((e) => console.error("Pipeline error:"));

    return NextResponse.json({ status: "processing", jobId });
  } catch {
    console.error("Process trigger error:");
    return NextResponse.json(
      { error: "Failed to start processing" },
      { status: 500 }
    );
  }
}
