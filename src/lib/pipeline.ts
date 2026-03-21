import { put, del } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { fetchMutualThreads, type SenderRecord } from "./gmail";
import { extractContacts } from "./openrouter";
import { buildCsv } from "./csv";
import { sendDownloadEmail } from "./resend";
import type { FilterConfig, LLMProviderMode } from "@/types";

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

const progressStore = new Map<string, ProgressEvent[]>();

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
  byokApiKey?: string
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

    emitProgress(jobId, {
      stage: "fetch",
      stageIndex: 1,
      copy: STAGES[1].copy,
    });

    const senders: SenderRecord[] = await fetchMutualThreads(
      accessToken,
      filterConfig,
      (stage, count) => {
        if (stage === "filter") {
          emitProgress(jobId, {
            stage: "filter",
            stageIndex: 2,
            copy: STAGES[2].copy,
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

    const mode = providerMode === "byok" ? "byok" : "cloud";
    const { contacts, skippedBatches } = await extractContacts(
      senders,
      mode,
      byokApiKey,
      undefined,
      (processed, total) => {
        emitProgress(jobId, {
          stage: "analyze",
          stageIndex: 3,
          copy: `Analyzing contacts... ${processed}/${total}`,
          contactCount: processed,
        });
      }
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

    const blob = await put(filename, csvContent, {
      access: "public",
      contentType: "text/csv",
    });

    await db
      .update(jobs)
      .set({
        status: "complete",
        contactCount: contacts.length,
        blobUrl: blob.url,
        completedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    emitProgress(jobId, {
      stage: "ready",
      stageIndex: 5,
      copy: `${contacts.length} people. That's your network.`,
      contactCount: contacts.length,
    });

    try {
      await sendDownloadEmail(userEmail, blob.url);
    } catch (e) {
      console.error("Failed to send download email:", e);
    }

    setTimeout(() => {
      progressStore.delete(jobId);
    }, 60000);
  } catch (error) {
    console.error("Pipeline failed:", error);
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
  try {
    await del(blobUrl);
  } catch (e) {
    console.error("Failed to delete blob:", e);
  }
}
