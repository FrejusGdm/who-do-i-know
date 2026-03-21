import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { runCloudPipeline } from "@/lib/pipeline";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import type { FilterConfig, LLMProviderMode } from "@/types";

export const dynamic = "force-dynamic";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { jobId, byokApiKey } = await req.json();

    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const session = await auth.api.getSession({ headers: headers() });
    const accessToken = session?.session?.token;

    if (!accessToken) {
      return NextResponse.json(
        { error: "No access token available" },
        { status: 401 }
      );
    }

    runCloudPipeline(
      jobId,
      accessToken,
      job.filterConfig as FilterConfig,
      job.userEmail,
      job.providerMode as LLMProviderMode,
      byokApiKey
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
