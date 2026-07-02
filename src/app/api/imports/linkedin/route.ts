import { NextRequest, NextResponse } from "next/server";
import { importLinkedInArchive } from "@/lib/linkedin-import";
import { requireSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const { session, error: authErr } = await requireSession();
    if (authErr) return authErr;

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "LinkedIn export zip is required" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".zip")) {
      return NextResponse.json({ error: "Upload the .zip file from LinkedIn's data export" }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "LinkedIn export zip must be 50 MB or smaller" }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importLinkedInArchive({
      userId: session.user.id,
      sourceLabel: file.name,
      data: buffer,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import LinkedIn archive";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
