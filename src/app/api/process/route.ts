import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { jobs, account, user } from "@/db/schema";
import { runCloudPipeline } from "@/lib/pipeline";
import type { FilterConfig, LLMProviderMode } from "@/types";

export const dynamic = "force-dynamic";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { jobId, byokApiKey, ollamaModel } = await req.json();

    // Look up the job — no session needed since /api/job already authenticated
    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

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
      accessToken,
      job.filterConfig as FilterConfig,
      job.userEmail,
      job.providerMode as LLMProviderMode,
      byokApiKey,
      ollamaModel
    ).catch((e) => console.error("Pipeline error:", e));

    return NextResponse.json({ status: "processing", jobId });
  } catch (error) {
    console.error("Process trigger error:", error);
    return NextResponse.json(
      { error: "Failed to start processing" },
      { status: 500 }
    );
  }
}
