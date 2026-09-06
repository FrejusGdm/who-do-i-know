import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, lte, or } from "drizzle-orm";
import { db } from "@/db";
import {
  aiProcessingTasks as tasks,
  aiPersonSummaries,
  aiThreadSummaries,
  emailMessages,
  emailThreads,
  networkSettings,
  notes,
  outreachTasks,
  people,
  personThreadLinks,
  user,
} from "@/db/schema";
import { isAuthorizedEmail } from "@/lib/private-access";
import type { NetworkTx } from "./store";

export const LEGACY_TASK_TYPES = [
  "thread_summarizer",
  "person_summarizer",
  "mentor_signal_reviewer",
] as const;
export type LegacyJob = typeof tasks.$inferSelect;
const leaseMs = 120_000;
const owns = (job: LegacyJob) =>
  and(eq(tasks.id, job.id), eq(tasks.userId, job.userId));
const exact = (job: LegacyJob) =>
  and(
    owns(job),
    eq(tasks.status, "processing"),
    eq(tasks.generationKey, job.generationKey!),
    eq(tasks.leaseToken, job.leaseToken!),
  );

/** Source mutation and publication share this owner lock; no provider call holds it. */
export async function lockMemoryOwner(tx: NetworkTx, owner: string) {
  const [exists] = await tx
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, owner));
  if (!exists) return false;
  await tx
    .insert(networkSettings)
    .values({ userId: owner })
    .onConflictDoNothing();
  await tx
    .select()
    .from(networkSettings)
    .where(eq(networkSettings.userId, owner))
    .for("update");
  return true;
}
async function authorized(tx: NetworkTx, owner: string) {
  const [row] = await tx.select().from(user).where(eq(user.id, owner));
  return !!row?.emailVerified && isAuthorizedEmail(row.email);
}

/** Hash source records, not generated output. No source body is stored in task metadata. */
async function sourceHash(tx: NetworkTx, job: LegacyJob) {
  let source: unknown;
  if (job.taskType === "thread_summarizer" && job.targetType === "thread") {
    const [thread] = await tx
      .select()
      .from(emailThreads)
      .where(
        and(
          eq(emailThreads.userId, job.userId),
          eq(emailThreads.id, job.targetId),
        ),
      )
      .for("update");
    if (!thread) return null;
    const messages = await tx
      .select()
      .from(emailMessages)
      .where(
        and(
          eq(emailMessages.userId, job.userId),
          eq(emailMessages.threadId, job.targetId),
        ),
      )
      .orderBy(asc(emailMessages.id));
    const links = await tx
      .select({ personId: people.id })
      .from(personThreadLinks)
      .innerJoin(people, eq(people.id, personThreadLinks.personId))
      .where(
        and(
          eq(people.userId, job.userId),
          eq(personThreadLinks.threadId, job.targetId),
        ),
      )
      .orderBy(asc(people.id));
    source = { thread, messages, links };
  } else if (
    ["person_summarizer", "mentor_signal_reviewer"].includes(job.taskType) &&
    job.targetType === "person"
  ) {
    const [person] = await tx
      .select()
      .from(people)
      .where(and(eq(people.userId, job.userId), eq(people.id, job.targetId)))
      .for("update");
    if (!person || person.archivedAt || person.reviewStatus === "archived")
      return null;
    if (job.taskType === "person_summarizer") {
      const noteRows = await tx
        .select()
        .from(notes)
        .where(and(eq(notes.userId, job.userId), eq(notes.personId, person.id)))
        .orderBy(asc(notes.id));
      const threadSummaries = await tx
        .select({ summary: aiThreadSummaries })
        .from(personThreadLinks)
        .innerJoin(
          emailThreads,
          and(
            eq(emailThreads.id, personThreadLinks.threadId),
            eq(emailThreads.userId, job.userId),
          ),
        )
        .innerJoin(
          aiThreadSummaries,
          eq(aiThreadSummaries.threadId, emailThreads.id),
        )
        .where(eq(personThreadLinks.personId, person.id))
        .orderBy(asc(aiThreadSummaries.id));
      source = { person, noteRows, threadSummaries };
    } else {
      const summaries = await tx
        .select()
        .from(aiPersonSummaries)
        .where(eq(aiPersonSummaries.personId, person.id))
        .orderBy(asc(aiPersonSummaries.id));
      const decisions = await tx
        .select()
        .from(outreachTasks)
        .where(
          and(
            eq(outreachTasks.userId, job.userId),
            eq(outreachTasks.personId, person.id),
          ),
        )
        .orderBy(asc(outreachTasks.id));
      source = { person, summaries, decisions };
    }
  } else return null;
  return createHash("sha256").update(JSON.stringify(source)).digest("hex");
}

export async function claimLegacyJob(owner: string, model: string) {
  return db.transaction(async (tx) => {
    if (!(await lockMemoryOwner(tx, owner)) || !(await authorized(tx, owner)))
      return null;
    const now = new Date();
    const [busy] = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, owner),
          inArray(tasks.taskType, [...LEGACY_TASK_TYPES]),
          gt(tasks.leaseExpiresAt, now),
        ),
      )
      .limit(1);
    if (busy) return null;
    const candidates = await tx
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, owner),
          inArray(tasks.taskType, [...LEGACY_TASK_TYPES]),
          lte(tasks.availableAt, now),
          or(
            eq(tasks.status, "queued"),
            and(eq(tasks.status, "processing"), lte(tasks.leaseExpiresAt, now)),
          ),
        ),
      )
      .orderBy(desc(tasks.priority), asc(tasks.createdAt))
      .limit(20)
      .for("update");
    for (const job of candidates) {
      if (job.leaseExpiresAt && job.leaseExpiresAt > now) continue;
      const hash = await sourceHash(tx, job);
      if (!hash || job.attempts >= 3) {
        await tx
          .update(tasks)
          .set({
            status: hash ? "failed" : "canceled",
            errorCategory: hash ? "attempt_limit" : "source_changed",
            errorMessage: null,
            leaseToken: null,
            leaseExpiresAt: null,
            updatedAt: now,
          })
          .where(owns(job));
        continue;
      }
      const [claimed] = await tx
        .update(tasks)
        .set({
          status: "processing",
          generationKey: job.generationKey ?? randomUUID(),
          leaseToken: randomUUID(),
          leaseExpiresAt: new Date(now.getTime() + leaseMs),
          attempts: job.attempts + 1,
          startedAt: now,
          model,
          errorMessage: null,
          errorCategory: null,
          metadata: { ...job.metadata, sourceHash: hash },
          updatedAt: now,
        })
        .where(owns(job))
        .returning();
      return claimed;
    }
    return null;
  });
}

/** Save all result records, downstream jobs and task completion in one transaction. */
export async function publishLegacyJob(
  job: LegacyJob,
  write: (tx: NetworkTx) => Promise<void>,
) {
  return db.transaction(async (tx) => {
    if (!(await lockMemoryOwner(tx, job.userId))) return false;
    const [current] = await tx
      .select()
      .from(tasks)
      .where(exact(job))
      .for("update");
    if (!current) {
      await releaseSupersededLease(tx, job);
      return false;
    }
    if (
      !current.leaseExpiresAt ||
      current.leaseExpiresAt <= new Date() ||
      !(await authorized(tx, job.userId)) ||
      (await sourceHash(tx, current)) !== current.metadata.sourceHash
    ) {
      await tx
        .update(tasks)
        .set({
          status: "canceled",
          errorCategory: "source_changed",
          errorMessage: null,
          leaseToken: null,
          leaseExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(exact(job));
      return false;
    }
    await write(tx);
    await tx
      .update(tasks)
      .set({
        status: "complete",
        completedAt: new Date(),
        errorCategory: null,
        errorMessage: null,
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(exact(job));
    return true;
  });
}

export async function failLegacyJob(job: LegacyJob) {
  await db
    .update(tasks)
    .set({
      status: job.attempts >= 3 ? "failed" : "queued",
      errorCategory: "provider_failure",
      errorMessage: null,
      availableAt: new Date(Date.now() + 5000 * 2 ** (job.attempts - 1)),
      leaseToken: null,
      leaseExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(exact(job));
  await releaseSupersededLease(db, job);
}

async function releaseSupersededLease(
  executor: typeof db | NetworkTx,
  job: LegacyJob,
) {
  await executor
    .update(tasks)
    .set({ leaseToken: null, leaseExpiresAt: null })
    .where(
      and(
        owns(job),
        eq(tasks.leaseToken, job.leaseToken!),
        inArray(tasks.status, ["queued", "canceled"]),
      ),
    );
}
