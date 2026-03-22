import { put, del } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { fetchMutualThreads, type SenderRecord } from "./gmail";
import { extractContacts } from "./openrouter";
import { buildCsv } from "./csv";
import { sendDownloadEmail } from "./resend";
import type { FilterConfig, LLMProviderMode, BYOKProvider } from "@/types";

function hasBlobToken(): boolean {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  return !!token && !token.startsWith("PASTE_");
}

function hasResendKey(): boolean {
  const key = process.env.RESEND_API_KEY;
  return !!key && !key.startsWith("PASTE_");
}

export interface ProgressEvent {
  stage: string;
  stageIndex: number;
  copy: string;
  contactCount?: number;
}

export const STAGES = [
  {
    id: "connect",
    label: "Connecting to Gmail",
    copy: "Shaking hands with Google...",
  },
  {
    id: "fetch",
    label: "Fetching threads",
    copy: "Digging through years of emails...",
  },
  {
    id: "filter",
    label: "Filtering the noise",
    copy: "Removing newsletters, dining halls, spam...",
  },
  {
    id: "analyze",
    label: "Analyzing your contacts",
    copy: "AI is reading the vibes...",
  },
  {
    id: "build",
    label: "Building your spreadsheet",
    copy: "Almost there, formatting nicely...",
  },
  {
    id: "ready",
    label: "Your network is ready",
    copy: "That's everyone you know.",
  },
] as const;

// Use globalThis so the Map is shared across all module instances in the same process
// (Next.js 15 after() callbacks and SSE routes may get different module copies)
const progressStore: Map<string, ProgressEvent[]> =
  (globalThis as Record<string, unknown>).__progressStore as Map<string, ProgressEvent[]>
  ?? ((globalThis as Record<string, unknown>).__progressStore = new Map<string, ProgressEvent[]>());

export function getProgress(jobId: string): ProgressEvent[] {
  return progressStore.get(jobId) ?? [];
}

function emitProgress(jobId: string, event: ProgressEvent) {
  const events = progressStore.get(jobId) ?? [];
  events.push(event);
  progressStore.set(jobId, events);
}

export async function runCloudPipeline(
  jobId: string,
  accessToken: string,
  filterConfig: FilterConfig,
  userEmail: string,
  providerMode: LLMProviderMode,
  byokApiKey?: string,
  ollamaModel?: string,
  byokProvider?: BYOKProvider
): Promise<void> {
  try {
    await db
      .update(jobs)
      .set({ status: "processing" })
      .where(eq(jobs.id, jobId));

    emitProgress(jobId, {
      stage: "connect",
      stageIndex: 0,
      copy: STAGES[0].copy,
    });

    const senders: SenderRecord[] = await fetchMutualThreads(
      accessToken,
      filterConfig,
      (stage, count) => {
        if (stage === "fetch") {
          emitProgress(jobId, {
            stage: "fetch",
            stageIndex: 1,
            copy: `Found ${count} threads, scanning...`,
          });
        } else if (stage === "filter") {
          emitProgress(jobId, {
            stage: "filter",
            stageIndex: 2,
            copy: `${count} mutual contacts so far...`,
            contactCount: count,
          });
        } else if (stage === "enrich") {
          emitProgress(jobId, {
            stage: "filter",
            stageIndex: 2,
            copy: `Reading ${count} conversations for context...`,
            contactCount: count,
          });
        }
      }
    );

    emitProgress(jobId, {
      stage: "filter",
      stageIndex: 2,
      copy: `Found ${senders.length} unique contacts to analyze...`,
      contactCount: senders.length,
    });

    emitProgress(jobId, {
      stage: "analyze",
      stageIndex: 3,
      copy: STAGES[3].copy,
      contactCount: senders.length,
    });

    const mode = providerMode === "local" ? "local" : providerMode === "byok" ? "byok" : "cloud";
    const model = mode === "local" && ollamaModel ? ollamaModel : undefined;
    const { contacts, skippedBatches } = await extractContacts(
      senders,
      mode,
      byokApiKey,
      model,
      (processed, total) => {
        emitProgress(jobId, {
          stage: "analyze",
          stageIndex: 3,
          copy: `Analyzing contacts... ${processed}/${total}`,
          contactCount: processed,
        });
      },
      byokProvider
    );

    emitProgress(jobId, {
      stage: "build",
      stageIndex: 4,
      copy: STAGES[4].copy,
      contactCount: contacts.length,
    });

    const csvContent = buildCsv(contacts, skippedBatches);
    const date = new Date().toISOString().split("T")[0];
    const filename = `whodoyouknow-${date}.csv`;

    let downloadUrl: string;

    if (hasBlobToken()) {
      const blob = await put(filename, csvContent, {
        access: "public",
        contentType: "text/csv",
      });
      downloadUrl = blob.url;
    } else {
      // Local fallback — save CSV to temp directory
      const localPath = join(tmpdir(), filename);
      writeFileSync(localPath, csvContent, "utf-8");
      downloadUrl = localPath;
      console.log(`[Pipeline] CSV saved locally: ${localPath}`);
    }

    await db
      .update(jobs)
      .set({
        status: "complete",
        contactCount: contacts.length,
        blobUrl: downloadUrl,
        completedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    emitProgress(jobId, {
      stage: "ready",
      stageIndex: 5,
      copy: `${contacts.length} people. That's your network.`,
      contactCount: contacts.length,
    });

    if (hasResendKey()) {
      try {
        await sendDownloadEmail(userEmail, downloadUrl);
      } catch (e) {
        console.error("Failed to send download email:", e);
      }
    } else {
      console.log("[Pipeline] Skipping email — no Resend API key configured");
    }

    setTimeout(() => {
      progressStore.delete(jobId);
    }, 60000);
  } catch (error) {
    console.error("[Pipeline] FAILED:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    await db
      .update(jobs)
      .set({ status: "failed", errorMessage: message })
      .where(eq(jobs.id, jobId));

    emitProgress(jobId, {
      stage: "error",
      stageIndex: -1,
      copy: `Processing failed: ${message}`,
    });
  }
}

export async function cleanupBlob(blobUrl: string): Promise<void> {
  if (!blobUrl.startsWith("http")) return; // Skip local file paths
  try {
    await del(blobUrl);
  } catch (e) {
    console.error("Failed to delete blob:", e);
  }
}
