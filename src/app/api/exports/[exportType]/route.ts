import { NextResponse } from "next/server";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  aiPersonSummaries,
  aiThreadSummaries,
  emailMessages,
  emailThreads,
  notes,
  outreachTasks,
  people,
} from "@/db/schema";
import { requireSession } from "@/lib/auth-guard";
import { toCsv } from "@/lib/csv-export";

export const dynamic = "force-dynamic";

const EXPORTS = new Set([
  "contacts",
  "emails",
  "threads",
  "thread_summaries",
  "person_summaries",
  "mentor_candidates",
  "outreach_queue",
  "manual_notes",
]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ exportType: string }> },
) {
  try {
    const { session, error: authErr } = await requireSession();
    if (authErr) return authErr;

    const { exportType } = await params;
    if (!EXPORTS.has(exportType)) {
      return NextResponse.json({ error: "Unknown export type" }, { status: 404 });
    }

    const csv = await buildExport(exportType, session.user.id);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${exportType}.csv"`,
      },
    });
  } catch (error) {
    console.error("CSV export error:", error);
    return NextResponse.json({ error: "Failed to export CSV" }, { status: 500 });
  }
}

async function buildExport(exportType: string, userId: string): Promise<string> {
  if (exportType === "contacts") {
    const rows = await db
      .select()
      .from(people)
      .where(and(eq(people.userId, userId), ne(people.reviewStatus, "archived")));
    return toCsv(
      [
        "name",
        "email",
        "phone",
        "instagram_url",
        "linkedin_url",
        "website_url",
        "organization",
        "role",
        "relationship_type",
        "review_status",
        "importance_score",
        "last_contacted_at",
        "next_follow_up_at",
        "source",
        "manual_notes",
      ],
      rows.map((person) => ({
        name: person.name,
        email: person.primaryEmail,
        phone: person.phone,
        instagram_url: person.instagramUrl,
        linkedin_url: person.linkedInUrl,
        website_url: person.websiteUrl,
        organization: person.organization,
        role: person.role,
        relationship_type: person.relationshipType,
        review_status: person.reviewStatus,
        importance_score: person.importanceScore,
        last_contacted_at: person.lastContactedAt,
        next_follow_up_at: person.nextFollowUpAt,
        source: person.source,
        manual_notes: person.manualNotes,
      })),
    );
  }

  if (exportType === "emails") {
    const rows = await db.select().from(emailMessages).where(eq(emailMessages.userId, userId));
    return toCsv(
      ["gmail_message_id", "sender_email", "sender_name", "recipients", "subject", "sent_at", "snippet"],
      rows.map((message) => ({
        gmail_message_id: message.gmailMessageId,
        sender_email: message.senderEmail,
        sender_name: message.senderName,
        recipients: message.recipients,
        subject: message.subject,
        sent_at: message.sentAt,
        snippet: message.snippet,
      })),
    );
  }

  if (exportType === "threads") {
    const rows = await db.select().from(emailThreads).where(eq(emailThreads.userId, userId));
    return toCsv(
      ["gmail_thread_id", "subject", "participants", "message_count", "user_replied", "last_message_at", "snippet"],
      rows.map((thread) => ({
        gmail_thread_id: thread.gmailThreadId,
        subject: thread.subject,
        participants: thread.participants,
        message_count: thread.messageCount,
        user_replied: thread.userReplied,
        last_message_at: thread.lastMessageAt,
        snippet: thread.snippet,
      })),
    );
  }

  if (exportType === "thread_summaries") {
    const threads = await db.select().from(emailThreads).where(eq(emailThreads.userId, userId));
    const rows = [];
    for (const thread of threads) {
      const [summary] = await db
        .select()
        .from(aiThreadSummaries)
        .where(eq(aiThreadSummaries.threadId, thread.id))
        .orderBy(desc(aiThreadSummaries.createdAt))
        .limit(1);
      rows.push({
        gmail_thread_id: thread.gmailThreadId,
        subject: thread.subject,
        summary: summary?.summary,
        topics: summary?.topics,
        decisions: summary?.decisions,
        personal_details: summary?.personalDetails,
        follow_up_signals: summary?.followUpSignals,
        relationship_evidence: summary?.relationshipEvidence,
        confidence: summary?.confidence,
      });
    }
    return toCsv(
      [
        "gmail_thread_id",
        "subject",
        "summary",
        "topics",
        "decisions",
        "personal_details",
        "follow_up_signals",
        "relationship_evidence",
        "confidence",
      ],
      rows,
    );
  }

  if (exportType === "person_summaries") {
    const persons = await db
      .select()
      .from(people)
      .where(and(eq(people.userId, userId), ne(people.reviewStatus, "archived")));
    const rows = [];
    for (const person of persons) {
      const [summary] = await db
        .select()
        .from(aiPersonSummaries)
        .where(eq(aiPersonSummaries.personId, person.id))
        .orderBy(desc(aiPersonSummaries.createdAt))
        .limit(1);
      rows.push({
        name: person.name,
        email: person.primaryEmail,
        relationship_type: person.relationshipType,
        review_status: person.reviewStatus,
        summary: summary?.summary,
        how_you_know_them: summary?.howYouKnowThem,
        why_they_matter: summary?.whyTheyMatter,
        notable_advice: summary?.notableAdvice,
        personal_details: summary?.personalDetails,
        open_loops: summary?.openLoops,
        mentor_signal_score: summary?.mentorSignalScore,
        mentor_signal_evidence: summary?.mentorSignalEvidence,
        needs_review: summary?.needsReview,
        classification: summary?.classification,
      });
    }
    return toCsv(
      [
        "name",
        "email",
        "relationship_type",
        "review_status",
        "summary",
        "how_you_know_them",
        "why_they_matter",
        "notable_advice",
        "personal_details",
        "open_loops",
        "mentor_signal_score",
        "mentor_signal_evidence",
        "needs_review",
        "classification",
      ],
      rows,
    );
  }

  if (exportType === "mentor_candidates" || exportType === "outreach_queue") {
    const tasks = await db
      .select()
      .from(outreachTasks)
      .where(eq(outreachTasks.userId, userId))
      .orderBy(desc(outreachTasks.priority));
    const persons = await db
      .select()
      .from(people)
      .where(and(eq(people.userId, userId), ne(people.reviewStatus, "archived")));
    const byId = new Map(persons.map((person) => [person.id, person]));
    const rows = [];
    for (const task of tasks) {
      const person = byId.get(task.personId);
      if (!person) continue;
      if (task.status !== "confirmed" && !(person.relationshipType === "mentor" && person.reviewStatus === "confirmed")) continue;
      const [summary] = await db
        .select()
        .from(aiPersonSummaries)
        .where(eq(aiPersonSummaries.personId, person.id))
        .orderBy(desc(aiPersonSummaries.createdAt))
        .limit(1);
      rows.push({
        name: person.name,
        email: person.primaryEmail,
        phone: person.phone,
        linkedin_url: person.linkedInUrl,
        instagram_url: person.instagramUrl,
        relationship_type: person.relationshipType,
        review_status: person.reviewStatus,
        mentor_signal_score: task.priority,
        summary: summary?.summary,
        why_they_matter: summary?.whyTheyMatter,
        evidence: summary?.mentorSignalEvidence?.length ? summary.mentorSignalEvidence : task.reason,
        manual_notes: person.manualNotes,
      });
    }
    return toCsv(
      [
        "name",
        "email",
        "phone",
        "linkedin_url",
        "instagram_url",
        "relationship_type",
        "review_status",
        "mentor_signal_score",
        "summary",
        "why_they_matter",
        "evidence",
        "manual_notes",
      ],
      rows,
    );
  }

  const rows = await db.select().from(notes).where(eq(notes.userId, userId));
  const persons = await db
    .select()
    .from(people)
    .where(and(eq(people.userId, userId), ne(people.reviewStatus, "archived")));
  const byId = new Map(persons.map((person) => [person.id, person]));
  return toCsv(
    ["name", "email", "note", "tags", "follow_up_reason", "created_at"],
    rows.map((note) => {
      const person = byId.get(note.personId);
      if (!person) return null;
      return {
        name: person.name,
        email: person.primaryEmail,
        note: note.body,
        tags: note.tags,
        follow_up_reason: note.followUpReason,
        created_at: note.createdAt,
      };
    }).filter((row): row is NonNullable<typeof row> => row !== null),
  );
}
