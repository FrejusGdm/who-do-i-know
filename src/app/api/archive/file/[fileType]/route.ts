import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { NextResponse } from "next/server";
import { getLatestArchiveJob } from "@/lib/google-archive";
import { requireSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FILES: Record<string, { path: string; filename: string; contentType: string }> = {
  mbox: {
    path: "gmail/messages.mbox",
    filename: "gmail-messages.mbox",
    contentType: "application/mbox",
  },
  messages: {
    path: "gmail/messages.jsonl",
    filename: "gmail-messages.jsonl",
    contentType: "application/x-ndjson",
  },
  attachments: {
    path: "gmail/attachments.jsonl",
    filename: "gmail-attachments.jsonl",
    contentType: "application/x-ndjson",
  },
  connections: {
    path: "people/connections.jsonl",
    filename: "google-people-connections.jsonl",
    contentType: "application/x-ndjson",
  },
  other_contacts: {
    path: "people/other-contacts.jsonl",
    filename: "google-other-contacts.jsonl",
    contentType: "application/x-ndjson",
  },
  manifest: {
    path: "manifest.json",
    filename: "google-archive-manifest.json",
    contentType: "application/json",
  },
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ fileType: string }> },
) {
  try {
    const { session, error: authErr } = await requireSession();
    if (authErr) return authErr;

    const { fileType } = await params;
    const file = FILES[fileType];
    if (!file) return NextResponse.json({ error: "Unknown archive file" }, { status: 404 });

    const job = await getLatestArchiveJob(session.user.id);
    if (!job?.localFolderPath || job.status !== "complete") {
      return NextResponse.json({ error: "No completed archive found" }, { status: 404 });
    }

    const fullPath = path.join(job.localFolderPath, file.path);
    const size = await stat(fullPath);
    const stream = Readable.toWeb(createReadStream(fullPath)) as ReadableStream;

    return new Response(stream, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(size.size),
        "Content-Disposition": `attachment; filename="${file.filename}"`,
      },
    });
  } catch (error) {
    console.error("Google archive file download error:", error);
    return NextResponse.json({ error: "Failed to download archive file" }, { status: 500 });
  }
}
