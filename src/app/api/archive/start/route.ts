import { NextResponse, after } from "next/server";
import { runGoogleArchive, startGoogleArchive } from "@/lib/google-archive";
import { requireSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const { session, error: authErr } = await requireSession();
    if (authErr) return authErr;

    const body = await request.json().catch(() => ({}));
    const mode = body?.mode === "light" ? "light" : "archive";

    const job = await startGoogleArchive(session.user.id, mode);
    after(async () => {
      try {
        await runGoogleArchive(job.id, session.user.id);
      } catch (error) {
        console.error(`[GoogleArchive] Job ${job.id} failed:`, error);
      }
    });

    return NextResponse.json({ job });
  } catch (error) {
    console.error("Google archive start error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start Google archive" },
      { status: 500 },
    );
  }
}
