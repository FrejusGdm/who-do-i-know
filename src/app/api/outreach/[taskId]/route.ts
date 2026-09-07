import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { outreachTasks, people } from "@/db/schema";
import { requireSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const { session, error: authErr } = await requireSession();
    if (authErr) return authErr;

    const { taskId } = await params;
    const { status, action } = await req.json();
    const requested = action ?? status;
    const allowed = new Set(["queued", "mentor", "confirmed", "friend", "not_mentor", "needs_review", "archived"]);

    if (!allowed.has(requested)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const [existingTask] = await db
      .select()
      .from(outreachTasks)
      .where(and(eq(outreachTasks.id, taskId), eq(outreachTasks.userId, session.user.id)))
      .limit(1);

    if (!existingTask) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const normalizedStatus = requested === "mentor" ? "confirmed" : requested;
    const completedStatuses = new Set(["confirmed", "friend", "not_mentor", "archived"]);

    const [task] = await db
      .update(outreachTasks)
      .set({
        status: normalizedStatus,
        completedAt: completedStatuses.has(normalizedStatus) ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(and(eq(outreachTasks.id, taskId), eq(outreachTasks.userId, session.user.id)))
      .returning();

    if (normalizedStatus === "confirmed") {
      await db
        .update(people)
        .set({
          relationshipType: "mentor",
          reviewStatus: "confirmed",
          archivedAt: null,
          archivedReason: null,
          updatedAt: new Date(),
        })
        .where(and(eq(people.id, existingTask.personId), eq(people.userId, session.user.id)));
    } else if (normalizedStatus === "friend") {
      await db
        .update(people)
        .set({
          relationshipType: "friend",
          reviewStatus: "confirmed",
          archivedAt: null,
          archivedReason: null,
          updatedAt: new Date(),
        })
        .where(and(eq(people.id, existingTask.personId), eq(people.userId, session.user.id)));
    } else if (normalizedStatus === "not_mentor") {
      await db
        .update(people)
        .set({
          reviewStatus: "not_mentor",
          archivedAt: null,
          archivedReason: null,
          updatedAt: new Date(),
        })
        .where(and(eq(people.id, existingTask.personId), eq(people.userId, session.user.id)));
    } else if (normalizedStatus === "needs_review") {
      await db
        .update(people)
        .set({
          reviewStatus: "needs_review",
          archivedAt: null,
          archivedReason: null,
          updatedAt: new Date(),
        })
        .where(and(eq(people.id, existingTask.personId), eq(people.userId, session.user.id)));
    } else if (normalizedStatus === "archived") {
      await db
        .update(people)
        .set({
          reviewStatus: "archived",
          archivedAt: new Date(),
          archivedReason: "Archived from Mentor Finder",
          updatedAt: new Date(),
        })
        .where(and(eq(people.id, existingTask.personId), eq(people.userId, session.user.id)));
    }

    return NextResponse.json({ task });
  } catch {
    console.error("Update outreach task error:");
    return NextResponse.json({ error: "Failed to update outreach task" }, { status: 500 });
  }
}
