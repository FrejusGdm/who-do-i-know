import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { cleanupBlob } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, params.jobId))
      .limit(1);

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.status !== "complete" || !job.blobUrl) {
      return NextResponse.json(
        { error: "Download not available" },
        { status: 400 }
      );
    }

    await db
      .update(jobs)
      .set({ downloadedAt: new Date() })
      .where(eq(jobs.id, params.jobId));

    cleanupBlob(job.blobUrl).catch((e) =>
      console.error("Blob cleanup error:", e)
    );

    return NextResponse.json({
      downloadUrl: job.blobUrl,
      contactCount: job.contactCount,
    });
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json(
      { error: "Failed to get download" },
      { status: 500 }
    );
  }
}
