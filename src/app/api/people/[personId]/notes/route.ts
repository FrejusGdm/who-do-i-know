import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readJsonLimited, RequestError } from "@/lib/request-security";
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
    z.string().uuid().parse(personId);
    const { body, tags, followUpReason } = z
      .object({
        body: z.string().trim().min(1).max(12000),
        tags: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
        followUpReason: z.string().trim().max(500).optional(),
      })
      .strict()
      .parse(await readJsonLimited(req));

    if (!body || typeof body !== "string") {
      return NextResponse.json(
        { error: "Note body is required" },
        { status: 400 },
      );
    }

    const [person] = await db
      .select()
      .from(people)
      .where(and(eq(people.id, personId), eq(people.userId, session.user.id)))
      .limit(1);

    if (!person || person.archivedAt || person.reviewStatus === "archived") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [note] = await db
      .insert(notes)
      .values({
        personId,
        userId: session.user.id,
        body: body.trim(),
        tags: Array.isArray(tags) ? tags : [],
        followUpReason:
          typeof followUpReason === "string" ? followUpReason : null,
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
    if (error instanceof RequestError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: "Check the note and tags" },
        { status: 400 },
      );
    console.error("Create note failed");
    return NextResponse.json(
      { error: "Failed to create note" },
      { status: 500 },
    );
  }
}
