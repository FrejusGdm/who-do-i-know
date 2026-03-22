import { NextRequest, NextResponse, after } from "next/server";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/db";
import { jobs, account } from "@/db/schema";
import { runCloudPipeline } from "@/lib/pipeline";
import type { FilterConfig, LLMProviderMode, BYOKProvider } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { filterConfig, providerMode, byokApiKey, ollamaModel, byokProvider } = await req.json();

    const [job] = await db
      .insert(jobs)
      .values({
        userEmail: session.user.email,
        status: "pending",
        filterConfig,
        providerMode: providerMode ?? "local",
      })
      .returning();

    // Look up Google access token
    const [googleAccount] = await db
      .select()
      .from(account)
      .where(
        and(
          eq(account.userId, session.user.id),
          eq(account.providerId, "google")
        )
      )
      .limit(1);

    if (googleAccount?.accessToken) {
      // Run pipeline after response is sent — Next.js keeps the function alive
      console.log(`[Job] Starting pipeline for job ${job.id} (mode: ${providerMode ?? "local"})`);
      after(async () => {
        console.log(`[Job] after() callback running for job ${job.id}`);
        try {
          await runCloudPipeline(
            job.id,
            googleAccount.accessToken!,
            filterConfig as FilterConfig,
            session.user.email,
            (providerMode ?? "local") as LLMProviderMode,
            byokApiKey,
            ollamaModel,
            byokProvider as BYOKProvider | undefined
          );
          console.log(`[Job] Pipeline completed for job ${job.id}`);
        } catch (e) {
          console.error(`[Job] Pipeline CRASHED for job ${job.id}:`, e);
        }
      });
    } else {
      console.error("No Google access token found for user:", session.user.email);
    }

    return NextResponse.json({ jobId: job.id });
  } catch (error) {
    console.error("Job creation error:", error);
    return NextResponse.json(
      { error: "Failed to create job" },
      { status: 500 }
    );
  }
}
