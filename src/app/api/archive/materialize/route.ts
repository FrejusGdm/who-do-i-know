import { NextResponse } from "next/server";
import { materializeArchiveMemory } from "@/lib/archive-materialize";
import { requireSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Rebuilds the people / relationship tables from the already-downloaded Google archive.
// Runs synchronously so the UI can show the resulting counts.
export async function POST() {
  try {
    const { session, error: authErr } = await requireSession();
    if (authErr) return authErr;

    const stats = await materializeArchiveMemory(session.user.id);
    return NextResponse.json({ stats });
  } catch {
    console.error("Archive materialize error:");
    return NextResponse.json(
      { error: "Failed to build people from archive" },
      { status: 500 },
    );
  }
}
