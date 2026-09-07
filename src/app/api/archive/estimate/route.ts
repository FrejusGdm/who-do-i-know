import { NextResponse } from "next/server";
import { estimateGoogleArchive } from "@/lib/google-archive";
import { requireSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  try {
    const { session, error: authErr } = await requireSession();
    if (authErr) return authErr;

    const job = await estimateGoogleArchive(session.user.id);
    return NextResponse.json({ job });
  } catch {
    console.error("Google archive estimate error:");
    return NextResponse.json(
      { error: "Failed to estimate Google archive" },
      { status: 500 },
    );
  }
}
