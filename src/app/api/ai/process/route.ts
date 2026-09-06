import { z } from "zod";
import { processQueuedAITasks } from "@/lib/ai-task-processor";
import { networkResponse } from "@/lib/network/api";
import { readJsonLimited } from "@/lib/request-security";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const input = z
  .object({
    providerMode: z.enum(["local", "byok", "cloud"]).default("local"),
    byokApiKey: z.string().min(1).max(4096).optional(),
    ollamaModel: z.string().trim().min(1).max(160).optional(),
    byokProvider: z.enum(["openai", "gemini", "openrouter"]).optional(),
    maxTasks: z.number().int().min(1).max(6).default(6),
  })
  .strict()
  .refine(
    (value) => value.providerMode !== "byok" || !!value.byokApiKey,
    "Provide the selected provider key",
  );

export async function POST(request: Request) {
  return networkResponse(request, async (owner) => {
    const body = input.parse(await readJsonLimited(request));
    return processQueuedAITasks({
      userId: owner,
      mode: body.providerMode,
      apiKey: body.byokApiKey,
      model: body.ollamaModel,
      byokProvider: body.byokProvider,
      maxTasks: body.maxTasks,
    });
  });
}
