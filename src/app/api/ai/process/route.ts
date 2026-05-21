import { NextRequest, NextResponse } from "next/server";
import { processQueuedAITasks } from "@/lib/ai-task-processor";
import { requireSession } from "@/lib/auth-guard";
import type { BYOKProvider, LLMProviderMode } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { session, error: authErr } = await requireSession();
    if (authErr) return authErr;

    const body = await req.json().catch(() => ({}));
    const providerMode = (body.providerMode ?? "local") as LLMProviderMode;
    const mode = providerMode === "byok" ? "byok" : providerMode === "cloud" ? "cloud" : "local";

    const result = await processQueuedAITasks({
      userId: session.user.id,
      mode,
      apiKey: body.byokApiKey,
      model: body.ollamaModel,
      byokProvider: body.byokProvider as BYOKProvider | undefined,
      maxTasks: typeof body.maxTasks === "number" ? body.maxTasks : 80,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("AI task processing error:", error);
    return NextResponse.json({ error: "Failed to process AI tasks" }, { status: 500 });
  }
}
