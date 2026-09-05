import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { people } from "@/db/schema";
import { requireSession } from "@/lib/auth-guard";
import { enqueueAITask } from "@/lib/ai-task-processor";

export const dynamic = "force-dynamic";

const relationshipTypes = new Set([
  "mentor",
  "friend",
  "advisor",
  "classmate",
  "professor",
  "teaching_assistant",
  "student",
  "colleague",
  "professional",
  "recruiter",
  "weak_tie",
  "family",
  "other",
  "unknown",
]);

const reviewStatuses = new Set(["new", "needs_review", "confirmed", "not_mentor", "archived"]);

const personPatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  primaryEmail: z.union([z.string().trim().email().max(320), z.literal(""), z.null()]).optional(),
  phone: z.string().trim().max(80).nullable().optional(),
  instagramUrl: z.string().trim().max(500).nullable().optional(),
  linkedInUrl: z.string().trim().max(500).nullable().optional(),
  websiteUrl: z.string().trim().max(500).nullable().optional(),
  organization: z.string().trim().max(200).nullable().optional(),
  role: z.string().trim().max(200).nullable().optional(),
  relationshipType: z.string().trim().max(80).optional(),
  reviewStatus: z.string().trim().max(80).optional(),
  manualNotes: z.string().trim().max(10000).nullable().optional(),
  archivedReason: z.string().trim().max(500).nullable().optional(),
  action: z.enum(["mentor", "friend", "not_mentor", "needs_review", "archive"]).optional(),
});

function emptyToNull(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ personId: string }> },
) {
  try {
    const { session, error: authErr } = await requireSession();
    if (authErr) return authErr;

    const { personId } = await params;
    const body = personPatchSchema.parse(await req.json());

    const [existing] = await db
      .select()
      .from(people)
      .where(and(eq(people.id, personId), eq(people.userId, session.user.id)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updates: Partial<typeof people.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (body.name !== undefined) updates.name = body.name;
    if (body.primaryEmail !== undefined) updates.primaryEmail = body.primaryEmail?.toLowerCase() || null;
    if (body.phone !== undefined) updates.phone = emptyToNull(body.phone);
    if (body.instagramUrl !== undefined) updates.instagramUrl = emptyToNull(body.instagramUrl);
    if (body.linkedInUrl !== undefined) updates.linkedInUrl = emptyToNull(body.linkedInUrl);
    if (body.websiteUrl !== undefined) updates.websiteUrl = emptyToNull(body.websiteUrl);
    if (body.organization !== undefined) updates.organization = emptyToNull(body.organization);
    if (body.role !== undefined) updates.role = emptyToNull(body.role);
    if (body.manualNotes !== undefined) updates.manualNotes = emptyToNull(body.manualNotes);
    if (body.archivedReason !== undefined) updates.archivedReason = emptyToNull(body.archivedReason);

    if (body.relationshipType !== undefined) {
      if (!relationshipTypes.has(body.relationshipType)) {
        return NextResponse.json({ error: "Invalid relationship type" }, { status: 400 });
      }
      updates.relationshipType = body.relationshipType;
    }

    if (body.reviewStatus !== undefined) {
      if (!reviewStatuses.has(body.reviewStatus)) {
        return NextResponse.json({ error: "Invalid review status" }, { status: 400 });
      }
      updates.reviewStatus = body.reviewStatus;
      updates.archivedAt = body.reviewStatus === "archived" ? new Date() : null;
      if (body.reviewStatus !== "archived" && body.archivedReason === undefined) {
        updates.archivedReason = null;
      }
    }

    if (body.action === "mentor") {
      updates.relationshipType = "mentor";
      updates.reviewStatus = "confirmed";
      updates.archivedAt = null;
      updates.archivedReason = null;
    } else if (body.action === "friend") {
      updates.relationshipType = "friend";
      updates.reviewStatus = "confirmed";
      updates.archivedAt = null;
      updates.archivedReason = null;
    } else if (body.action === "not_mentor") {
      updates.reviewStatus = "not_mentor";
      updates.archivedAt = null;
      updates.archivedReason = null;
    } else if (body.action === "needs_review") {
      updates.reviewStatus = "needs_review";
      updates.archivedAt = null;
      updates.archivedReason = null;
    } else if (body.action === "archive") {
      updates.reviewStatus = "archived";
      updates.archivedAt = new Date();
      updates.archivedReason = body.archivedReason ?? "Archived from relationship review";
    }

    const [person] = await db
      .update(people)
      .set(updates)
      .where(and(eq(people.id, personId), eq(people.userId, session.user.id)))
      .returning();

    if (body.manualNotes !== undefined || body.relationshipType !== undefined || body.reviewStatus !== undefined || body.action) {
      await enqueueAITask({
        userId: session.user.id,
        taskType: "person_summarizer",
        targetType: "person",
        targetId: personId,
        priority: body.action === "mentor" ? 95 : 80,
        metadata: { reason: "person_profile_updated" },
      });
    }

    return NextResponse.json({ person });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid person update", issues: error.issues }, { status: 400 });
    }
    console.error("Update person error:", error);
    return NextResponse.json({ error: "Failed to update person" }, { status: 500 });
  }
}
