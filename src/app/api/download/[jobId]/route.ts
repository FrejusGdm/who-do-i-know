import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { tmpdir } from "os";
import { cleanupBlob } from "@/lib/pipeline";
import { requireSession, requireJobOwnership } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    const { session, error: authErr } = await requireSession();
    if (authErr) return authErr;

    const { job, error: jobErr } = await requireJobOwnership(jobId, session.user.email);
    if (jobErr) return jobErr;

    if (job.status !== "complete" || !job.blobUrl) {
      return NextResponse.json(
        { error: "Download not available" },
        { status: 400 }
      );
    }

    const isLocalFile = !job.blobUrl.startsWith("http");
    const wantsFile = req.nextUrl.searchParams.get("file") === "true";

    // Serve local CSV files directly as a download
    if (isLocalFile && wantsFile) {
      // Path confinement: ensure blobUrl is within the temp directory
      const resolvedPath = resolve(job.blobUrl);
      const allowedDir = resolve(tmpdir());
      if (!resolvedPath.startsWith(allowedDir + "/")) {
        return NextResponse.json(
          { error: "Invalid file path" },
          { status: 403 }
        );
      }

      if (!existsSync(resolvedPath)) {
        return NextResponse.json(
          { error: "File no longer available" },
          { status: 410 }
        );
      }
      const csvContent = readFileSync(resolvedPath, "utf-8");
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
