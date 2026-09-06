import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  aiProcessingTasks as tasks,
  circles,
  interviewPeople,
  interviews,
  interviewTurns,
  keepInTouchPlans,
  memoryProposals,
  networkAiUsage,
  networkSettings,
  openLoops,
  personalUpdates,
  people,
  user,
} from "@/db/schema";
import { isAuthorizedEmail } from "@/lib/private-access";
import { todayInTimezone } from "./calendar";
import {
  getInterview,
  lockInterview,
  publishInterviewGeneration,
} from "./interviews";
import { lockPeople, NetworkError, type NetworkTx } from "./store";
import {
  generateInterview,
  interviewProviderConfig,
  INTERVIEW_LIMITS,
  providerError,
  type InterviewContext,
  type InterviewProviderConfig,
  type InterviewOutput,
} from "./interview-provider";

const TASK_TYPE = "interview";
type Job = typeof tasks.$inferSelect;
type Settings = typeof networkSettings.$inferSelect;
const utcDay = () => new Date().toISOString().slice(0, 10);
const sameJob = (job: Job) =>
  and(
    eq(tasks.id, job.id),
    eq(tasks.userId, job.userId),
    eq(tasks.taskType, TASK_TYPE),
  );
const jobFor = (owner: string, id: string) =>
  and(
    eq(tasks.userId, owner),
    eq(tasks.taskType, TASK_TYPE),
    eq(tasks.targetType, "interview"),
    eq(tasks.targetId, id),
  );
function publicJob(job: Job | undefined) {
  return job
    ? {
        id: job.id,
        status: job.status,
        sourceRevision: job.sourceRevision,
        attempts: job.attempts,
        errorCategory: job.errorCategory,
        availableAt: job.availableAt,
      }
    : null;
}
export type InterviewJobView = NonNullable<ReturnType<typeof publicJob>>;
async function lockSettings(tx: NetworkTx, owner: string) {
  await tx
    .insert(networkSettings)
    .values({ userId: owner })
    .onConflictDoNothing();
  const [settings] = await tx
    .select()
    .from(networkSettings)
    .where(eq(networkSettings.userId, owner))
    .for("update");
  return settings;
}
function consentMatches(
  settings: Settings | undefined,
  config: InterviewProviderConfig | null,
) {
  return (
    !!config &&
    !!settings?.cloudProcessingAllowed &&
    settings.aiConfigurationKey === config.configurationKey
  );
}
async function authorizedWorkerOwner(tx: NetworkTx, owner: string) {
  const [row] = await tx
    .select({ email: user.email, verified: user.emailVerified })
    .from(user)
    .where(eq(user.id, owner));
  return !!row?.verified && isAuthorizedEmail(row.email);
}
export async function interviewAIStatus(owner: string) {
  const config = interviewProviderConfig();
  const [settings] = await db
    .select()
    .from(networkSettings)
    .where(eq(networkSettings.userId, owner));
  const [usage] = await db
    .select()
    .from(networkAiUsage)
    .where(
      and(eq(networkAiUsage.userId, owner), eq(networkAiUsage.day, utcDay())),
    );
  return {
    configured: !!config,
    provider: config?.provider ?? null,
    model: config?.model ?? null,
    configurationKey: config?.configurationKey ?? null,
    allowed: consentMatches(settings, config),
    requestsToday: usage?.requests ?? 0,
    dailyLimit: INTERVIEW_LIMITS.dailyRequests,
  };
}
export type InterviewAIStatus = Awaited<ReturnType<typeof interviewAIStatus>>;
export const aiConsentInput = z
  .object({
    allowed: z.boolean(),
    configurationKey: z.string().length(64).nullable(),
  })
  .strict();
export async function setInterviewAIConsent(
  owner: string,
  raw: z.input<typeof aiConsentInput>,
) {
  const input = aiConsentInput.parse(raw);
  const config = interviewProviderConfig();
  if (
    input.allowed &&
    (!config || config.configurationKey !== input.configurationKey)
  )
    throw new NetworkError(
      409,
      "The AI configuration changed. Review the current provider before enabling it",
    );
  await db.transaction(async (tx) => {
    await lockSettings(tx, owner);
    await tx
      .update(networkSettings)
      .set({
        cloudProcessingAllowed: input.allowed,
        aiConfigurationKey: input.allowed ? config!.configurationKey : null,
        updatedAt: new Date(),
      })
      .where(eq(networkSettings.userId, owner));
    if (!input.allowed) {
      // Keep a running lease until its provider request finishes or times out. Re-enabling
      // consent must not create overlapping calls while an old request is still in flight.
      await tx
        .update(tasks)
        .set({
          status: "canceled",
          errorCategory: "consent_required",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tasks.userId, owner),
            eq(tasks.taskType, TASK_TYPE),
            inArray(tasks.status, ["queued", "processing"]),
          ),
        );
    }
  });
  return interviewAIStatus(owner);
}
export const queueInterviewInput = z
  .object({
    requestKey: z.string().uuid(),
    revision: z.number().int().positive(),
  })
  .strict();
export async function queueInterview(
  owner: string,
  id: string,
  raw: z.input<typeof queueInterviewInput>,
) {
  const input = queueInterviewInput.parse(raw);
  return db.transaction(async (tx) => {
    const settings = await lockSettings(tx, owner);
    const interview = await lockInterview(tx, owner, id);
    const config = interviewProviderConfig();
    if (!consentMatches(settings, config))
      throw new NetworkError(
        409,
        "Enable the configured AI interviewer before requesting a question",
      );
    if (!["active", "reviewing"].includes(interview.status))
      throw new NetworkError(
        409,
        "Resume the interview before requesting a question",
      );
    const [existing] = await tx
      .select()
      .from(tasks)
      .where(jobFor(owner, id))
      .for("update");
    if (existing?.generationKey === input.requestKey) {
      if (existing.sourceRevision !== input.revision)
        throw new NetworkError(
          409,
          "This request key belongs to different saved words",
        );
      return publicJob(existing);
    }
    if (interview.revision !== input.revision)
      throw new NetworkError(
        409,
        "Newer words were saved. Reload before asking the interviewer",
      );
    if (
      existing?.sourceRevision === input.revision &&
      ["queued", "processing"].includes(existing.status)
    )
      return publicJob(existing);
    if (existing?.leaseExpiresAt && existing.leaseExpiresAt > new Date())
      throw new NetworkError(
        409,
        "The previous question is still finishing. Your words are saved; retry shortly",
      );
    const values = {
      userId: owner,
      taskType: TASK_TYPE,
      targetType: "interview",
      targetId: id,
      status: "queued",
      priority: 100,
      sourceRevision: input.revision,
      generationKey: input.requestKey,
      model: config!.model,
      metadata: { configurationKey: config!.configurationKey },
      attempts: 0,
      availableAt: new Date(),
      leaseToken: null,
      leaseExpiresAt: null,
      errorCategory: null,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      updatedAt: new Date(),
    };
    const [job] = existing
      ? await tx.update(tasks).set(values).where(sameJob(existing)).returning()
      : await tx.insert(tasks).values(values).returning();
    return publicJob(job);
  });
}
export async function interviewJob(owner: string, id: string) {
  await getInterview(owner, id);
  const [job] = await db.select().from(tasks).where(jobFor(owner, id));
  return publicJob(job);
}
async function cancel(tx: NetworkTx, job: Job, category: string) {
  await tx
    .update(tasks)
    .set({
      status: "canceled",
      errorCategory: category,
      leaseToken: null,
      leaseExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(sameJob(job));
}

/** Claim briefly under the owner's settings lock; never hold a DB transaction during inference. */
export async function claimInterviewJob(ownerId?: string) {
  const now = new Date();
  const candidates = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.taskType, TASK_TYPE),
        eq(tasks.targetType, "interview"),
        ownerId ? eq(tasks.userId, ownerId) : undefined,
        or(
          and(eq(tasks.status, "queued"), lte(tasks.availableAt, now)),
          and(eq(tasks.status, "processing"), lte(tasks.leaseExpiresAt, now)),
        ),
      ),
    )
    .orderBy(asc(tasks.availableAt), asc(tasks.createdAt))
    .limit(20);
  for (const candidate of candidates) {
    const claimed = await db.transaction(async (tx) => {
      const [ownerExists] = await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, candidate.userId));
      if (!ownerExists) return null;
      const settings = await lockSettings(tx, candidate.userId);
      const [job] = await tx
        .select()
        .from(tasks)
        .where(sameJob(candidate))
        .for("update");
      if (
        !job ||
        !["queued", "processing"].includes(job.status) ||
        job.availableAt > now ||
        (job.leaseExpiresAt && job.leaseExpiresAt > now)
      )
        return null;
      const config = interviewProviderConfig();
      if (
        !consentMatches(settings, config) ||
        job.metadata.configurationKey !== config?.configurationKey ||
        !(await authorizedWorkerOwner(tx, job.userId))
      ) {
        await cancel(tx, job, "consent_required");
        return null;
      }
      const [parent] = await tx
        .select()
        .from(interviews)
        .where(
          and(
            eq(interviews.id, job.targetId),
            eq(interviews.userId, job.userId),
          ),
        );
      if (
        !parent ||
        !["active", "reviewing"].includes(parent.status) ||
        parent.revision !== job.sourceRevision
      ) {
        await cancel(tx, job, "source_changed");
        return null;
      }
      const [busy] = await tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, job.userId),
            eq(tasks.taskType, TASK_TYPE),
            gt(tasks.leaseExpiresAt, now),
          ),
        )
        .limit(1);
      if (busy) return null;
      if (job.attempts >= INTERVIEW_LIMITS.attempts) {
        await tx
          .update(tasks)
          .set({
            status: "failed",
            errorCategory: "attempt_limit",
            leaseToken: null,
            leaseExpiresAt: null,
            updatedAt: now,
          })
          .where(sameJob(job));
        return null;
      }
      const day = utcDay();
      const [usage] = await tx
        .select()
        .from(networkAiUsage)
        .where(
          and(
            eq(networkAiUsage.userId, job.userId),
            eq(networkAiUsage.day, day),
          ),
        );
      if ((usage?.requests ?? 0) >= INTERVIEW_LIMITS.dailyRequests) {
        await tx
          .update(tasks)
          .set({
            status: "failed",
            errorCategory: "daily_limit",
            leaseToken: null,
            leaseExpiresAt: null,
            updatedAt: now,
          })
          .where(sameJob(job));
        return null;
      }
      await tx
        .insert(networkAiUsage)
        .values({ userId: job.userId, day, requests: 1 })
        .onConflictDoUpdate({
          target: [networkAiUsage.userId, networkAiUsage.day],
          set: { requests: sql`${networkAiUsage.requests} + 1` },
        });
      const [updated] = await tx
        .update(tasks)
        .set({
          status: "processing",
          attempts: job.attempts + 1,
          leaseToken: randomUUID(),
          leaseExpiresAt: new Date(Date.now() + INTERVIEW_LIMITS.leaseMs),
          startedAt: now,
          errorCategory: null,
          metadata: { ...job.metadata, usageDay: day },
          updatedAt: now,
        })
        .where(sameJob(job))
        .returning();
      return updated;
    });
    if (claimed) return claimed;
  }
  return null;
}

export async function interviewJobContext(job: Job): Promise<InterviewContext> {
  const config = interviewProviderConfig();
  return db.transaction(async (tx) => {
    const settings = await lockSettings(tx, job.userId);
    const interview = await lockInterview(tx, job.userId, job.targetId);
    const [current] = await tx.select().from(tasks).where(sameJob(job));
    if (
      !current ||
      current.status !== "processing" ||
      current.leaseToken !== job.leaseToken ||
      !current.leaseExpiresAt ||
      current.leaseExpiresAt <= new Date() ||
      !consentMatches(settings, config) ||
      current.metadata.configurationKey !== config?.configurationKey ||
      interview.revision !== job.sourceRevision ||
      !["active", "reviewing"].includes(interview.status) ||
      !(await authorizedWorkerOwner(tx, job.userId))
    )
      throw new NetworkError(
        409,
        "This interview request is no longer current",
      );
    const selected = await tx
      .select({ person: people })
      .from(interviewPeople)
      .innerJoin(
        people,
        and(
          eq(people.id, interviewPeople.personId),
          eq(people.userId, job.userId),
        ),
      )
      .where(
        and(
          eq(interviewPeople.interviewId, interview.id),
          eq(interviewPeople.userId, job.userId),
        ),
      );
    if (
      selected.some(
        ({ person }) => person.archivedAt || person.reviewStatus === "archived",
      )
    )
      throw new NetworkError(409, "A person in this interview was archived");
    const allTurns = await tx
      .select({
        id: interviewTurns.id,
        role: interviewTurns.role,
        content: interviewTurns.content,
        revision: interviewTurns.revision,
      })
      .from(interviewTurns)
      .where(
        and(
          eq(interviewTurns.userId, job.userId),
          eq(interviewTurns.interviewId, interview.id),
          isNull(interviewTurns.deletedAt),
        ),
      )
      .orderBy(desc(interviewTurns.ordinal));
    const directory = await tx
      .select({
        id: people.id,
        name: people.name,
        organization: people.organization,
      })
      .from(people)
      .where(
        and(
          eq(people.userId, job.userId),
          isNull(people.archivedAt),
          sql`${people.reviewStatus} <> 'archived'`,
        ),
      )
      .orderBy(asc(people.name))
      .limit(500);
    const words = allTurns
      .filter((turn) => turn.role === "user")
      .slice(0, 8)
      .map((turn) => turn.content.toLowerCase())
      .join(" ");
    const selectedIds = new Set(selected.map(({ person }) => person.id));
    const candidates = directory
      .filter((person) => {
        const first = person.name.split(/\s+/)[0].toLowerCase();
        return first.length >= 3 && words.includes(first);
      })
      .slice(0, 20);
    const peopleContext = [
      ...new Map(
        [...candidates, ...selected.map(({ person }) => person)].map(
          (person) => [
            person.id,
            {
              id: person.id,
              name: person.name,
              organization: person.organization,
              selected: selectedIds.has(person.id),
            },
          ],
        ),
      ).values(),
    ];
    const circleRows = await tx
      .select({ id: circles.id, name: circles.name })
      .from(circles)
      .where(eq(circles.userId, job.userId))
      .orderBy(asc(circles.name))
      .limit(50);
    const plans = selectedIds.size
      ? await tx
          .select({
            personId: keepInTouchPlans.personId,
            revision: keepInTouchPlans.revision,
            nextDueOn: keepInTouchPlans.nextDueOn,
            intervalCount: keepInTouchPlans.intervalCount,
            intervalUnit: keepInTouchPlans.intervalUnit,
          })
          .from(keepInTouchPlans)
          .where(
            and(
              eq(keepInTouchPlans.userId, job.userId),
              inArray(keepInTouchPlans.personId, [...selectedIds]),
            ),
          )
      : [];
    const reviewed = await tx
      .select({
        id: memoryProposals.id,
        payload: memoryProposals.payload,
        status: memoryProposals.status,
      })
      .from(memoryProposals)
      .where(
        and(
          eq(memoryProposals.userId, job.userId),
          eq(memoryProposals.interviewId, interview.id),
          inArray(memoryProposals.status, ["accepted", "rejected", "pending"]),
        ),
      )
      .orderBy(desc(memoryProposals.createdAt))
      .limit(30);
    const loopMemory = reviewed.length
      ? await tx
          .select()
          .from(openLoops)
          .where(
            and(
              eq(openLoops.userId, job.userId),
              inArray(
                openLoops.proposalId,
                reviewed.map((row) => row.id),
              ),
            ),
          )
      : [];
    const updateMemory = reviewed.length
      ? await tx
          .select()
          .from(personalUpdates)
          .where(
            and(
              eq(personalUpdates.userId, job.userId),
              inArray(
                personalUpdates.proposalId,
                reviewed.map((row) => row.id),
              ),
            ),
          )
      : [];
    const context: InterviewContext = {
      mode: interview.mode,
      today: todayInTimezone(settings.timezone),
      timezone: settings.timezone,
      turns: [],
      omittedTurnCount: allTurns.length,
      people: peopleContext,
      circles: circleRows,
      existingPlans: plans,
      reviewed: reviewed.map((row) => {
        const loop = loopMemory.find((loop) => loop.proposalId === row.id);
        const update = updateMemory.find(
          (update) => update.proposalId === row.id,
        );
        return {
          kind: row.payload.kind,
          status: row.status,
          summary:
            row.payload.kind === "open_loop" && row.status === "accepted"
              ? JSON.stringify(
                  loop
                    ? {
                        body: loop.body.slice(0, 300),
                        dueOn: loop.dueOn,
                        status: loop.status,
                      }
                    : { status: "removed" },
                )
              : row.payload.kind === "personal_update" &&
                  row.status === "accepted"
                ? JSON.stringify(
                    update && !update.deletedAt
                      ? {
                          title: update.title,
                          body: update.body.slice(0, 300),
                          happenedOn: update.happenedOn,
                        }
                      : { status: "removed" },
                  )
                : JSON.stringify(row.payload).slice(0, 300),
        };
      }),
    };
    // Keep complete, current turns; never create a quote against a silently truncated turn.
    for (const turn of allTurns) {
      const next = {
        ...context,
        turns: [turn, ...context.turns],
        omittedTurnCount: context.omittedTurnCount - 1,
      };
      if (JSON.stringify(next).length > INTERVIEW_LIMITS.contextCharacters)
        break;
      context.turns = next.turns;
      context.omittedTurnCount = next.omittedTurnCount;
    }
    if (allTurns.length && !context.turns.length)
      throw new NetworkError(400, "This interview context is too large");
    await tx
      .update(tasks)
      .set({
        metadata: {
          ...current.metadata,
          contextPersonIds: context.people.map((person) => person.id),
        },
      })
      .where(and(sameJob(job), eq(tasks.leaseToken, job.leaseToken!)));
    return context;
  });
}

type GenerationResult = {
  output: InterviewOutput;
  inputTokens: number;
  outputTokens: number;
};
export async function finishInterviewJob(job: Job, result: GenerationResult) {
  return db.transaction(async (tx) => {
    const [exists] = await tx
      .select()
      .from(networkSettings)
      .where(eq(networkSettings.userId, job.userId))
      .for("update");
    if (!exists) return false;
    const [interview] = await tx
      .select()
      .from(interviews)
      .where(
        and(eq(interviews.id, job.targetId), eq(interviews.userId, job.userId)),
      )
      .for("update");
    const [current] = await tx
      .select()
      .from(tasks)
      .where(sameJob(job))
      .for("update");
    if (
      !current ||
      current.leaseToken !== job.leaseToken ||
      current.generationKey !== job.generationKey
    )
      return false;
    const config = interviewProviderConfig();
    if (
      !interview ||
      current.status !== "processing" ||
      !current.leaseExpiresAt ||
      current.leaseExpiresAt <= new Date() ||
      !consentMatches(exists, config) ||
      job.metadata.configurationKey !== config?.configurationKey ||
      interview.revision !== job.sourceRevision ||
      !["active", "reviewing"].includes(interview.status) ||
      !(await authorizedWorkerOwner(tx, job.userId))
    ) {
      await cancel(tx, current, "source_changed");
      return false;
    }
    // Even a question with no proposals must not revive an archived person's interview.
    const participants = await tx
      .select({ id: interviewPeople.personId })
      .from(interviewPeople)
      .where(
        and(
          eq(interviewPeople.userId, job.userId),
          eq(interviewPeople.interviewId, job.targetId),
        ),
      );
    const contextIds = z
      .array(z.string().uuid())
      .max(50)
      .parse(current.metadata.contextPersonIds ?? []);
    const relevantIds = [
      ...new Set([...participants.map((row) => row.id), ...contextIds]),
    ];
    if (relevantIds.length) await lockPeople(tx, job.userId, relevantIds);
    await publishInterviewGeneration(
      job.userId,
      job.targetId,
      {
        generationKey: job.generationKey!,
        sourceRevision: job.sourceRevision!,
        ...result.output,
      },
      tx,
    );
    const safeCount = (value: number) =>
      Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 1000000) : 0;
    await tx
      .update(networkAiUsage)
      .set({
        inputTokens: sql`${networkAiUsage.inputTokens} + ${safeCount(result.inputTokens)}`,
        outputTokens: sql`${networkAiUsage.outputTokens} + ${safeCount(result.outputTokens)}`,
      })
      .where(
        and(
          eq(networkAiUsage.userId, job.userId),
          eq(networkAiUsage.day, String(job.metadata.usageDay)),
        ),
      );
    await tx
      .update(tasks)
      .set({
        status: "complete",
        completedAt: new Date(),
        errorCategory: null,
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(sameJob(job));
    return true;
  });
}

async function failJob(job: Job, error: unknown) {
  const category =
    error instanceof NetworkError
      ? error.status === 400
        ? "invalid_output"
        : "source_changed"
      : providerError(error).category;
  const retry =
    ["timeout", "unavailable", "rate_limit", "invalid_output"].includes(
      category,
    ) && job.attempts < INTERVIEW_LIMITS.attempts;
  await db
    .update(tasks)
    .set({
      status:
        category === "source_changed"
          ? "canceled"
          : retry
            ? "queued"
            : "failed",
      errorCategory: category,
      errorMessage: null,
      availableAt: new Date(Date.now() + 5000 * 2 ** (job.attempts - 1)),
      leaseToken: null,
      leaseExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        sameJob(job),
        eq(tasks.status, "processing"),
        eq(tasks.leaseToken, job.leaseToken!),
      ),
    );
  // A consent revocation retains an in-flight lease; this request is now finished.
  await db
    .update(tasks)
    .set({ leaseToken: null, leaseExpiresAt: null, updatedAt: new Date() })
    .where(
      and(
        sameJob(job),
        eq(tasks.status, "canceled"),
        eq(tasks.leaseToken, job.leaseToken!),
      ),
    );
}
/** Provider injection is internal and used by deterministic tests; no HTTP request can replace it. */
export async function runInterviewWorkerOnce(
  options: { ownerId?: string; generate?: typeof generateInterview } = {},
) {
  const job = await claimInterviewJob(options.ownerId);
  if (!job) return false;
  try {
    const context = await interviewJobContext(job);
    const config = interviewProviderConfig();
    if (!config) throw new NetworkError(409, "AI configuration changed");
    const result = await (options.generate ?? generateInterview)(
      context,
      config,
    );
    await finishInterviewJob(job, result);
  } catch (error) {
    await failJob(job, error);
  }
  return true;
}
