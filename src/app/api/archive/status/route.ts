import { NextResponse } from "next/server";
import { getLatestArchiveJob } from "@/lib/google-archive";
import { requireSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { session, error: authErr } = await requireSession();
    if (authErr) return authErr;

    const job = await getLatestArchiveJob(session.user.id);
    return NextResponse.json({ job });
  } catch (error) {
    console.error("Google archive status error:", error);
    return NextResponse.json({ error: "Failed to load archive status" }, { status: 500 });
  }
}
