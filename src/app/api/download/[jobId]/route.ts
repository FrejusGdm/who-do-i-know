import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { cleanupBlob } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId))
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
      .where(eq(jobs.id, jobId));

    const isLocalFile = !job.blobUrl.startsWith("http");
    const wantsFile = req.nextUrl.searchParams.get("file") === "true";

    // Serve local CSV files directly as a download
    if (isLocalFile && wantsFile) {
      if (!existsSync(job.blobUrl)) {
        return NextResponse.json(
          { error: "File no longer available" },
          { status: 410 }
        );
      }
      const csvContent = readFileSync(job.blobUrl, "utf-8");
      const date = new Date().toISOString().split("T")[0];
      return new Response(csvContent, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="whodoyouknow-${date}.csv"`,
        },
      });
    }

    // Clean up Vercel Blob files (skip local paths)
    if (!isLocalFile) {
      cleanupBlob(job.blobUrl).catch((e) =>
        console.error("Blob cleanup error:", e)
      );
    }

    return NextResponse.json({
      downloadUrl: isLocalFile
        ? `/api/download/${jobId}?file=true`
        : job.blobUrl,
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
