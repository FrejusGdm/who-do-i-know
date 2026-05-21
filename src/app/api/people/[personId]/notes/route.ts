import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { notes, people } from "@/db/schema";
import { requireSession } from "@/lib/auth-guard";
import { enqueueAITask } from "@/lib/ai-task-processor";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ personId: string }> },
) {
  try {
    const { session, error: authErr } = await requireSession();
    if (authErr) return authErr;

    const { personId } = await params;
    const { body, tags = [], followUpReason } = await req.json();

    if (!body || typeof body !== "string") {
      return NextResponse.json({ error: "Note body is required" }, { status: 400 });
    }

    const [person] = await db
      .select()
      .from(people)
      .where(and(eq(people.id, personId), eq(people.userId, session.user.id)))
      .limit(1);

    if (!person) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [note] = await db
      .insert(notes)
      .values({
        personId,
        userId: session.user.id,
        body: body.trim(),
        tags: Array.isArray(tags) ? tags : [],
        followUpReason: typeof followUpReason === "string" ? followUpReason : null,
      })
      .returning();

    await enqueueAITask({
      userId: session.user.id,
      taskType: "person_summarizer",
      targetType: "person",
      targetId: personId,
      priority: 90,
      metadata: { reason: "manual_note_added", noteId: note.id },
    });

    return NextResponse.json({ note }, { status: 201 });
  } catch (error) {
    console.error("Create note error:", error);
    return NextResponse.json({ error: "Failed to create note" }, { status: 500 });
  }
}
