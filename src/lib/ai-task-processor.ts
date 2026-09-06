import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import type OpenAI from "openai";
import { db } from "@/db";
import {
  aiPersonSummaries,
  aiProcessingTasks,
  aiThreadSummaries,
  emailMessages,
  emailThreads,
  notes,
  outreachTasks,
  people,
  personThreadLinks,
} from "@/db/schema";
import { createAIClient, getDefaultAIModel } from "@/lib/openrouter";
import type { BYOKProvider } from "@/types";
import type { NetworkTx } from "@/lib/network/store";
import {
  claimLegacyJob,
  publishLegacyJob,
  failLegacyJob,
  LEGACY_TASK_TYPES,
  type LegacyJob,
} from "@/lib/network/legacy-ai-jobs";

type AIMode = "cloud" | "byok" | "local";
type AITaskType =
  "thread_summarizer" | "person_summarizer" | "mentor_signal_reviewer";

interface ProcessorOptions {
  userId: string;
  mode: AIMode;
  apiKey?: string;
  model?: string;
  byokProvider?: BYOKProvider;
  maxTasks?: number;
  onProgress?: (completed: number, total: number) => void;
}

interface ThreadSummaryResult {
  summary: string;
  topics: string[];
  decisions: string;
  personal_details: string;
  follow_up_signals: string;
  relationship_evidence: string[];
  confidence: "high" | "medium" | "low";
}

interface PersonSummaryResult {
  summary: string;
  how_you_know_them: string;
  why_they_matter: string;
  notable_advice: string;
  personal_details: string;
  open_loops: string;
  classification: string;
  mentor_signal_score: number;
  mentor_signal_evidence: string[];
  needs_review: boolean;
}

interface MentorSignalResult {
  score: number;
  reason: string;
  evidence: string[];
  status: "queued" | "needs_review" | "not_mentor";
}

function compactText(value: string | null | undefined, limit = 6000): string {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

function safeJson<T>(text: string, fallback: T): T {
  try {
    const jsonText = text.match(/\{[\s\S]*\}/)?.[0] ?? text;
    return JSON.parse(jsonText) as T;
  } catch {
    return fallback;
  }
}

async function chatJson<T>({
  client,
  model,
  system,
  payload,
  fallback,
}: {
  client: OpenAI;
  model: string;
  system: string;
  payload: unknown;
  fallback: T;
}): Promise<T> {
  const response = await client.chat.completions.create(
    {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(payload) },
      ],
      temperature: 0.15,
      max_tokens: 4096,
    },
    { timeout: 45000, maxRetries: 0 },
  );
  return safeJson(response.choices[0]?.message?.content ?? "", fallback);
}

export async function enqueueAITask(
  {
    userId,
    taskType,
    targetType,
    targetId,
    priority = 50,
    metadata = {},
  }: {
    userId: string;
    taskType: AITaskType;
    targetType: "thread" | "person";
    targetId: string;
    priority?: number;
    metadata?: Record<string, unknown>;
  },
  executor: typeof db | NetworkTx = db,
) {
  const generationKey = randomUUID();
  await executor
    .insert(aiProcessingTasks)
    .values({
      userId,
      taskType,
      targetType,
      targetId,
      priority,
      metadata,
      generationKey,
      availableAt: new Date(),
      status: "queued",
      attempts: 0,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
    })
    .onConflictDoUpdate({
      target: [
        aiProcessingTasks.userId,
        aiProcessingTasks.taskType,
        aiProcessingTasks.targetId,
      ],
      set: {
        status: "queued",
        priority,
        metadata,
        generationKey,
        availableAt: new Date(),
        errorCategory: null,
        attempts: 0,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
        updatedAt: new Date(),
      },
    });
}

export async function enqueueThreadSummaryTasks(
  userId: string,
  threadIds: string[],
) {
  for (const threadId of Array.from(new Set(threadIds))) {
    await enqueueAITask({
      userId,
      taskType: "thread_summarizer",
      targetType: "thread",
      targetId: threadId,
      priority: 80,
    });
  }
}

export async function enqueuePersonSummaryTasks(
  userId: string,
  personIds: string[],
  executor: typeof db | NetworkTx = db,
) {
  for (const personId of Array.from(new Set(personIds))) {
    await enqueueAITask(
      {
        userId,
        taskType: "person_summarizer",
        targetType: "person",
        targetId: personId,
        priority: 60,
      },
      executor,
    );
  }
}

export async function processQueuedAITasks({
  userId,
  mode,
  apiKey,
  model,
  byokProvider,
  maxTasks = 60,
  onProgress,
}: ProcessorOptions): Promise<{
  completed: number;
  failed: number;
  remaining: number;
}> {
  const client = createAIClient(mode, apiKey, byokProvider).withOptions({ logLevel: "off", timeout: 45000, maxRetries: 0 });
  const effectiveModel = getDefaultAIModel(mode, model, byokProvider);
  let completed = 0;
  let failed = 0;

  while (completed + failed < maxTasks) {
    const task = await claimLegacyJob(userId, effectiveModel);
    if (!task) break;
    try {
      const committed =
        task.taskType === "thread_summarizer"
          ? await processThreadTask(
              userId,
              task.targetId,
              client,
              effectiveModel,
              task,
            )
          : task.taskType === "person_summarizer"
            ? await processPersonTask(
                userId,
                task.targetId,
                client,
                effectiveModel,
                task,
              )
            : await processMentorTask(
                userId,
                task.targetId,
                client,
                effectiveModel,
                task,
              );
      if (committed) {
        completed++;
        onProgress?.(completed, maxTasks);
      } else failed++;
    } catch {
      await failLegacyJob(task);
      failed++;
    }
  }

  const remaining = await db
    .select()
    .from(aiProcessingTasks)
    .where(
      and(
        eq(aiProcessingTasks.userId, userId),
        eq(aiProcessingTasks.status, "queued"),
        inArray(aiProcessingTasks.taskType, [...LEGACY_TASK_TYPES]),
      ),
    );

  return { completed, failed, remaining: remaining.length };
}

async function processThreadTask(
  userId: string,
  threadId: string,
  client: OpenAI,
  model: string,
  job: LegacyJob,
) {
  const [thread] = await db
    .select()
    .from(emailThreads)
    .where(and(eq(emailThreads.id, threadId), eq(emailThreads.userId, userId)))
    .limit(1);
  if (!thread) throw new Error("Thread not found");

  const messages = await db
    .select()
    .from(emailMessages)
    .where(
      and(
        eq(emailMessages.threadId, thread.id),
        eq(emailMessages.userId, userId),
      ),
    );

  const result = await chatJson<ThreadSummaryResult>({
    client,
    model,
    system: `You summarize one Gmail thread for a private relationship-memory CRM.
Return JSON only with keys: summary, topics, decisions, personal_details, follow_up_signals, relationship_evidence, confidence.
Be specific. Mention course, TA, professor, student, mentor, advisor, referral, research, career, China, fellowship, or organization context when supported.
Do not write outreach drafts. If context is thin, set confidence to low and say what is actually known.`,
    payload: {
      subject: thread.subject,
      participants: thread.participants,
      last_message_at: thread.lastMessageAt,
      messages: messages.slice(0, 30).map((message) => ({
        from: message.senderEmail,
        sender_name: message.senderName,
        to: message.recipients,
        sent_at: message.sentAt,
        subject: message.subject,
        body: compactText(message.body ?? message.snippet, 8000),
      })),
    },
    fallback: {
      summary:
        thread.snippet ??
        "Needs review: no message body was available for this thread.",
      topics: thread.subject ? [thread.subject] : [],
      decisions: "",
      personal_details: "",
      follow_up_signals: "",
      relationship_evidence: [],
      confidence: "low",
    },
  });

  return publishLegacyJob(job, async (tx) => {
    await tx.insert(aiThreadSummaries).values({
      threadId: thread.id,
      summary: result.summary,
      topics: result.topics ?? [],
      decisions: result.decisions,
      personalDetails: result.personal_details,
      followUpSignals: result.follow_up_signals,
      relationshipEvidence: result.relationship_evidence ?? [],
      confidence: result.confidence ?? "medium",
      model,
    });

    const links = await tx
      .select()
      .from(personThreadLinks)
      .innerJoin(
        people,
        and(
          eq(people.id, personThreadLinks.personId),
          eq(people.userId, userId),
        ),
      )
      .where(eq(personThreadLinks.threadId, thread.id));
    await enqueuePersonSummaryTasks(
      userId,
      links.map((link) => link.person_thread_links.personId),
      tx,
    );
  });
}

async function processPersonTask(
  userId: string,
  personId: string,
  client: OpenAI,
  model: string,
  job: LegacyJob,
) {
  const [person] = await db
    .select()
    .from(people)
    .where(and(eq(people.id, personId), eq(people.userId, userId)))
    .limit(1);
  if (!person) throw new Error("Person not found");

  const links = await db
    .select({ threadId: emailThreads.id })
    .from(personThreadLinks)
    .innerJoin(
      emailThreads,
      and(
        eq(emailThreads.id, personThreadLinks.threadId),
        eq(emailThreads.userId, userId),
      ),
    )
    .where(eq(personThreadLinks.personId, person.id));
  const threadIds = links.map((link) => link.threadId);
  const threadSummaries = threadIds.length
    ? await db
        .select()
        .from(aiThreadSummaries)
        .where(inArray(aiThreadSummaries.threadId, threadIds))
    : [];
  const manualNotes = await db
    .select()
    .from(notes)
    .where(and(eq(notes.personId, person.id), eq(notes.userId, userId)))
    .orderBy(desc(notes.createdAt));

  const result = await chatJson<PersonSummaryResult>({
    client,
    model,
    system: `You write a private relationship dossier for one person.
Use only the provided thread summaries and the user's manual notes. Return JSON only with keys:
summary, how_you_know_them, why_they_matter, notable_advice, personal_details, open_loops, classification, mentor_signal_score, mentor_signal_evidence, needs_review.
Focus on what the user and this person discussed, how they know each other, and whether this is a mentor/advisor/professor/TA/student/high-value relationship.
Never draft a message. Never say "Hi..." or suggest exact wording.
If evidence is thin or mostly administrative/list traffic, set needs_review true and classify as unknown or other.`,
    payload: {
      person: {
        name: person.name,
        email: person.primaryEmail,
        current_relationship_type: person.relationshipType,
        last_contacted_at: person.lastContactedAt,
      },
      manual_notes: manualNotes
        .map((note) => ({
          body: note.body,
          tags: note.tags,
          created_at: note.createdAt,
        }))
        .concat(
          person.manualNotes
            ? [
                {
                  body: person.manualNotes,
                  tags: ["profile"],
                  created_at: person.updatedAt,
                },
              ]
            : [],
        ),
      thread_summaries: threadSummaries.slice(0, 80).map((summary) => ({
        summary: summary.summary,
        topics: summary.topics,
        advice_or_decisions: summary.decisions,
        personal_details: summary.personalDetails,
        follow_up_signals: summary.followUpSignals,
        evidence: summary.relationshipEvidence,
        confidence: summary.confidence,
      })),
    },
    fallback: {
      summary:
        "Needs review: there is not enough processed context yet to summarize this relationship.",
      how_you_know_them: "",
      why_they_matter: "",
      notable_advice: "",
      personal_details: "",
      open_loops: "",
      classification: "unknown",
      mentor_signal_score: 0,
      mentor_signal_evidence: [],
      needs_review: true,
    },
  });

  return publishLegacyJob(job, async (tx) => {
    await tx.insert(aiPersonSummaries).values({
      personId: person.id,
      summary: result.summary,
      howYouKnowThem: result.how_you_know_them,
      whyTheyMatter: result.why_they_matter,
      naturalNextMessage: null,
      notableAdvice: result.notable_advice,
      personalDetails: result.personal_details,
      openLoops: result.open_loops,
      mentorSignalScore: Math.max(
        0,
        Math.min(100, result.mentor_signal_score ?? 0),
      ),
      mentorSignalEvidence: result.mentor_signal_evidence ?? [],
      needsReview: result.needs_review ?? false,
      classification: result.classification ?? "unknown",
      model,
    });

    await tx
      .update(people)
      .set({
        relationshipType:
          person.reviewStatus === "new" ||
          person.reviewStatus === "needs_review"
            ? (result.classification ?? person.relationshipType)
            : person.relationshipType,
        importanceScore: Math.max(
          person.importanceScore,
          Math.min(100, result.mentor_signal_score ?? 0),
        ),
        updatedAt: new Date(),
      })
      .where(eq(people.id, person.id));

    await enqueueAITask(
      {
        userId,
        taskType: "mentor_signal_reviewer",
        targetType: "person",
        targetId: person.id,
        priority: 40,
      },
      tx,
    );
  });
}

async function processMentorTask(
  userId: string,
  personId: string,
  client: OpenAI,
  model: string,
  job: LegacyJob,
) {
  const [person] = await db
    .select()
    .from(people)
    .where(and(eq(people.id, personId), eq(people.userId, userId)))
    .limit(1);
  if (!person) throw new Error("Person not found");

  const [summary] = await db
    .select()
    .from(aiPersonSummaries)
    .where(eq(aiPersonSummaries.personId, person.id))
    .orderBy(desc(aiPersonSummaries.createdAt))
    .limit(1);

  const [existing] = await db
    .select()
    .from(outreachTasks)
    .where(
      and(
        eq(outreachTasks.personId, person.id),
        eq(outreachTasks.userId, userId),
      ),
    )
    .orderBy(desc(outreachTasks.createdAt))
    .limit(1);

  const userDecisionStatus =
    person.reviewStatus === "archived"
      ? "archived"
      : person.reviewStatus === "not_mentor"
        ? "not_mentor"
        : person.relationshipType === "friend"
          ? "friend"
          : person.reviewStatus === "confirmed" &&
              person.relationshipType === "mentor"
            ? "confirmed"
            : null;

  if (userDecisionStatus)
    return publishLegacyJob(job, async (tx) => {
      if (existing) {
        await tx
          .update(outreachTasks)
          .set({
            status: userDecisionStatus,
            completedAt:
              userDecisionStatus === "confirmed" ||
              userDecisionStatus === "friend" ||
              userDecisionStatus === "not_mentor" ||
              userDecisionStatus === "archived"
                ? new Date()
                : null,
            updatedAt: new Date(),
          })
          .where(eq(outreachTasks.id, existing.id));
      }
    });

  const result = await chatJson<MentorSignalResult>({
    client,
    model,
    system: `You rank whether one person belongs in a Mentor Finder.
Return JSON only with keys: score, reason, evidence, status.
	score is 0-100. status is queued for likely mentor/high-value, needs_review for ambiguous, not_mentor for a real person who does not belong in mentor review.
	Do not draft messages or tell the user what to say. Focus on mentor/advisor/professor/referral/career/TA/course evidence.`,
    payload: {
      person: {
        name: person.name,
        email: person.primaryEmail,
        relationship_type: person.relationshipType,
      },
      summary,
    },
    fallback: {
      score: summary?.mentorSignalScore ?? 0,
      reason:
        summary?.whyTheyMatter ??
        "Needs review: no mentor evidence has been generated yet.",
      evidence: summary?.mentorSignalEvidence ?? [],
      status:
        (summary?.mentorSignalScore ?? 0) >= 50 ? "queued" : "needs_review",
    },
  });

  const status =
    result.status === "queued" ||
    result.status === "needs_review" ||
    result.status === "not_mentor"
      ? result.status
      : "needs_review";

  const values = {
    userId,
    personId: person.id,
    priority: Math.max(0, Math.min(100, result.score ?? 0)),
    status,
    reason: [
      result.reason,
      ...(result.evidence ?? []).map((item) => `Evidence: ${item}`),
    ]
      .filter(Boolean)
      .join("\n"),
    suggestedTone: "mentor-signal evidence",
    draftMessage: null,
    dueAt: null,
    updatedAt: new Date(),
  };

  return publishLegacyJob(job, async (tx) => {
    if (existing) {
      await tx
        .update(outreachTasks)
        .set(values)
        .where(eq(outreachTasks.id, existing.id));
    } else {
      await tx.insert(outreachTasks).values(values);
    }
  });
}
