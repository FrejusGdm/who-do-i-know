import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  aiPersonSummaries,
  aiProcessingTasks,
  checkIns,
  confirmedFacts,
  interactionParticipants,
  interactions,
  interviewCorrections,
  interviewPeople,
  interviews,
  interviewTurns,
  keepInTouchPlans,
  memoryProposals,
  notes,
  openLoops,
  outreachTasks,
  people,
  personalUpdates,
} from "@/db/schema";
import { lockInterview } from "./interviews";
import { lockMemoryOwner } from "./legacy-ai-jobs";
import { invalidateCommitmentContext } from "./open-loops";
import { proposalPeople } from "./interview-grounding";
import { NetworkError, type NetworkTx } from "./store";

const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const base = {
  requestKey: z.string().uuid(),
  impactKey: z.string().regex(/^[a-f0-9]{64}$/),
  // Structural choices can outlive a source. Retaining them must be explicit.
  retainConfirmedChoices: z.literal(true),
};
export const correctionInput = z.discriminatedUnion("action", [
  z
    .object({
      ...base,
      action: z.literal("correct"),
      content: z.string().trim().min(1).max(12000),
    })
    .strict(),
  z.object({ ...base, action: z.literal("remove") }).strict(),
]);
export type CorrectionInput = z.infer<typeof correctionInput>;
export type CorrectionImpact = {
  impactKey: string;
  turn: { id: string; content: string; revision: number };
  counts: {
    assistantTurns: number;
    proposals: number;
    notes: number;
    facts: number;
    interactions: number;
    openLoops: number;
    updates: number;
    summaries: number;
    outreach: number;
  };
  people: { id: string; name: string }[];
  plansToReview: {
    id: string;
    personId: string;
    name: string;
    lastContactOn: string | null;
  }[];
  retained: { people: number; memberships: number; plans: number };
};

/** Call only while holding the owner lock, then the interview lock. */
async function collectImpact(
  tx: NetworkTx,
  owner: string,
  interviewId: string,
  turnId: string,
) {
  z.string().uuid().parse(turnId);
  const interview = await lockInterview(tx, owner, interviewId);
  const turns = await tx
    .select()
    .from(interviewTurns)
    .where(
      and(
        eq(interviewTurns.userId, owner),
        eq(interviewTurns.interviewId, interviewId),
      ),
    )
    .orderBy(asc(interviewTurns.ordinal));
  const turn = turns.find(
    (row) => row.id === turnId && row.role === "user" && !row.deletedAt,
  );
  if (!turn) throw new NetworkError(404, "Recollection not found");
  // Later assistants may repeat this source even when their displayed quotes cite another turn.
  const assistants = turns.filter(
    (row) =>
      row.role === "assistant" && row.ordinal > turn.ordinal && !row.deletedAt,
  );
  const generations = new Set(assistants.map((row) => row.requestKey));
  const proposals = (
    await tx
      .select()
      .from(memoryProposals)
      .where(
        and(
          eq(memoryProposals.userId, owner),
          eq(memoryProposals.interviewId, interviewId),
        ),
      )
      .orderBy(asc(memoryProposals.id))
  ).filter(
    (row) =>
      generations.has(row.generationKey) ||
      row.sources.some((source) => source.turnId === turnId),
  );
  const ids = proposals.map((row) => row.id);
  const accepted = proposals.filter((row) => row.status === "accepted");
  const refs = (type: string) =>
    accepted
      .filter((row) => row.acceptedRef?.type === type)
      .map((row) => row.acceptedRef!.id);
  const linked = await tx
    .select({ personId: interviewPeople.personId })
    .from(interviewPeople)
    .where(
      and(
        eq(interviewPeople.userId, owner),
        eq(interviewPeople.interviewId, interviewId),
      ),
    );
  const personIds = [
    ...new Set([
      ...linked.map((row) => row.personId),
      ...proposals.flatMap((row) => proposalPeople(row.payload)),
      ...refs("person"),
    ]),
  ].sort();
  // Include archived records: removing private source material must still work after archive.
  const personRows = personIds.length
    ? await tx
        .select()
        .from(people)
        .where(and(eq(people.userId, owner), inArray(people.id, personIds)))
        .orderBy(asc(people.id))
        .for("update")
    : [];
  const ownedIds = personRows.map((row) => row.id);
  const noteIds = refs("note"),
    eventIds = refs("interaction");
  const noteRows = noteIds.length
    ? await tx
        .select()
        .from(notes)
        .where(and(eq(notes.userId, owner), inArray(notes.id, noteIds)))
        .orderBy(asc(notes.id))
        .for("update")
    : [];
  const factRows = ids.length
    ? await tx
        .select()
        .from(confirmedFacts)
        .where(
          and(
            eq(confirmedFacts.userId, owner),
            inArray(confirmedFacts.proposalId, ids),
          ),
        )
        .orderBy(asc(confirmedFacts.id))
        .for("update")
    : [];
  const loopRows =
    ids.length || eventIds.length
      ? await tx
          .select()
          .from(openLoops)
          .where(
            and(
              eq(openLoops.userId, owner),
              or(
                ids.length ? inArray(openLoops.proposalId, ids) : undefined,
                eventIds.length
                  ? inArray(openLoops.interactionId, eventIds)
                  : undefined,
              ),
            ),
          )
          .orderBy(asc(openLoops.id))
          .for("update")
      : [];
  const updateRows = ids.length
    ? await tx
        .select()
        .from(personalUpdates)
        .where(
          and(
            eq(personalUpdates.userId, owner),
            inArray(personalUpdates.proposalId, ids),
          ),
        )
        .orderBy(asc(personalUpdates.id))
        .for("update")
    : [];
  const eventRows = eventIds.length
    ? await tx
        .select()
        .from(interactions)
        .where(
          and(
            eq(interactions.userId, owner),
            inArray(interactions.id, eventIds),
          ),
        )
        .orderBy(asc(interactions.id))
        .for("update")
    : [];
  const summaryRows = ownedIds.length
    ? await tx
        .select()
        .from(aiPersonSummaries)
        .where(inArray(aiPersonSummaries.personId, ownedIds))
        .orderBy(asc(aiPersonSummaries.id))
        .for("update")
    : [];
  const outreachRows = ownedIds.length
    ? await tx
        .select()
        .from(outreachTasks)
        .where(
          and(
            eq(outreachTasks.userId, owner),
            inArray(outreachTasks.personId, ownedIds),
          ),
        )
        .orderBy(asc(outreachTasks.id))
        .for("update")
    : [];
  const planRows = ownedIds.length
    ? await tx
        .select()
        .from(keepInTouchPlans)
        .where(
          and(
            eq(keepInTouchPlans.userId, owner),
            inArray(keepInTouchPlans.personId, ownedIds),
          ),
        )
        .orderBy(asc(keepInTouchPlans.id))
        .for("update")
    : [];
  const remaining = ownedIds.length
    ? await tx
        .select({
          personId: interactionParticipants.personId,
          occurredOn: interactions.occurredOn,
        })
        .from(interactions)
        .innerJoin(
          interactionParticipants,
          and(
            eq(interactionParticipants.interactionId, interactions.id),
            eq(interactionParticipants.userId, owner),
          ),
        )
        .where(
          and(
            eq(interactions.userId, owner),
            inArray(interactionParticipants.personId, ownedIds),
            eq(interactions.datePrecision, "day"),
            eq(interactions.qualifiesForCadence, true),
            eventIds.length
              ? sql`${interactions.id} not in (${sql.join(
                  eventIds.map((id) => sql`${id}::uuid`),
                  sql`, `,
                )})`
              : undefined,
          ),
        )
        .orderBy(
          desc(interactions.occurredOn),
          asc(interactionParticipants.personId),
          asc(interactions.id),
        )
    : [];
  const reviewedPlans = planRows.flatMap((plan) => {
    const lastContactOn =
      remaining.find((row) => row.personId === plan.personId)?.occurredOn ??
      null;
    return lastContactOn !== plan.lastContactOn ||
      refs("plan").includes(plan.id)
      ? [
          {
            id: plan.id,
            personId: plan.personId,
            name: personRows.find((row) => row.id === plan.personId)!.name,
            lastContactOn,
          },
        ]
      : [];
  });
  const impact: CorrectionImpact = {
    impactKey: fingerprint({
      revision: interview.revision,
      turn,
      assistants,
      proposals,
      personRows,
      noteRows,
      factRows,
      loopRows,
      updateRows,
      eventRows,
      summaryRows,
      outreachRows,
      planRows,
      remaining,
    }),
    turn: { id: turn.id, content: turn.content, revision: turn.revision },
    counts: {
      assistantTurns: assistants.length,
      proposals: proposals.length,
      notes: noteRows.length,
      facts: factRows.length,
      interactions: eventRows.length,
      openLoops: loopRows.length,
      updates: updateRows.length,
      summaries: summaryRows.length,
      outreach: outreachRows.length,
    },
    people: personRows.map(({ id, name }) => ({ id, name })),
    plansToReview: reviewedPlans,
    retained: {
      people: refs("person").length,
      memberships: refs("circle_membership").length,
      plans: refs("plan").length,
    },
  };
  return {
    interview,
    turn,
    assistants,
    proposals,
    personRows,
    noteRows,
    factRows,
    loopRows,
    updateRows,
    eventRows,
    summaryRows,
    outreachRows,
    planRows,
    impact,
  };
}

export async function previewInterviewCorrection(
  owner: string,
  interviewId: string,
  turnId: string,
) {
  return db.transaction(async (tx) => {
    if (!(await lockMemoryOwner(tx, owner)))
      throw new NetworkError(404, "Interview not found");
    return (await collectImpact(tx, owner, interviewId, turnId)).impact;
  });
}

export async function correctInterviewTurn(
  owner: string,
  interviewId: string,
  turnId: string,
  raw: CorrectionInput,
) {
  const input = correctionInput.parse(raw);
  z.string().uuid().parse(interviewId);
  z.string().uuid().parse(turnId);
  const hash = fingerprint({ interviewId, turnId, ...input });
  return db.transaction(async (tx) => {
    if (!(await lockMemoryOwner(tx, owner)))
      throw new NetworkError(404, "Interview not found");
    const [receipt] = await tx
      .select()
      .from(interviewCorrections)
      .where(
        and(
          eq(interviewCorrections.userId, owner),
          eq(interviewCorrections.requestKey, input.requestKey),
        ),
      );
    if (receipt) {
      if (receipt.requestHash !== hash)
        throw new NetworkError(
          409,
          "This correction key was used for a different change",
        );
      return { applied: true as const };
    }
    const data = await collectImpact(tx, owner, interviewId, turnId);
    if (data.impact.impactKey !== input.impactKey)
      throw new NetworkError(
        409,
        "This recollection or its memories changed. Preview the effects again before confirming",
      );
    if (input.action === "correct" && input.content === data.turn.content)
      throw new NetworkError(
        400,
        "Change the words before saving a correction",
      );
    if (input.action === "correct") {
      const [size] = await tx
        .select({
          total: sql<number>`coalesce(sum(length(${interviewTurns.content})), 0)::int`,
        })
        .from(interviewTurns)
        .where(
          and(
            eq(interviewTurns.userId, owner),
            eq(interviewTurns.interviewId, interviewId),
            isNull(interviewTurns.deletedAt),
          ),
        );
      if (size.total - data.turn.content.length + input.content.length > 300000)
        throw new NetworkError(400, "This interview is full");
    }
    const now = new Date();
    const personIds = data.personRows.map((row) => row.id);
    // Conservatively invalidate related interviews under the publication lock.
    if (data.loopRows.length) {
      const linked = await tx
        .select({ id: interviewPeople.interviewId })
        .from(interviewPeople)
        .where(
          and(
            eq(interviewPeople.userId, owner),
            inArray(interviewPeople.personId, [
              ...new Set(data.loopRows.map((row) => row.personId)),
            ]),
          ),
        );
      const loopProposalIds = data.loopRows.flatMap((row) =>
        row.proposalId ? [row.proposalId] : [],
      );
      const sourceInterviews = loopProposalIds.length
        ? await tx
            .select({ id: memoryProposals.interviewId })
            .from(memoryProposals)
            .where(
              and(
                eq(memoryProposals.userId, owner),
                inArray(memoryProposals.id, loopProposalIds),
              ),
            )
        : [];
      await invalidateCommitmentContext(
        tx,
        owner,
        [...new Set([...linked, ...sourceInterviews].map((row) => row.id))]
          .filter((id) => id !== interviewId)
          .sort(),
      );
    }
    // Retain in-flight lease tokens until callers finish, preventing an overlapping replacement call.
    await tx
      .update(aiProcessingTasks)
      .set({
        status: "canceled",
        errorCategory: "source_changed",
        errorMessage: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(aiProcessingTasks.userId, owner),
          inArray(aiProcessingTasks.status, ["queued", "processing"]),
          or(
            and(
              eq(aiProcessingTasks.targetType, "interview"),
              eq(aiProcessingTasks.targetId, interviewId),
            ),
            personIds.length
              ? and(
                  eq(aiProcessingTasks.targetType, "person"),
                  inArray(aiProcessingTasks.targetId, personIds),
                )
              : undefined,
          ),
        ),
      );
    if (personIds.length) {
      await tx
        .delete(aiPersonSummaries)
        .where(inArray(aiPersonSummaries.personId, personIds));
      await tx
        .update(outreachTasks)
        .set({
          reason:
            "Source recollection changed; review current context before outreach.",
          suggestedTone: null,
          draftMessage: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(outreachTasks.userId, owner),
            inArray(outreachTasks.personId, personIds),
          ),
        );
    }
    if (data.noteRows.length)
      await tx.delete(notes).where(
        and(
          eq(notes.userId, owner),
          inArray(
            notes.id,
            data.noteRows.map((row) => row.id),
          ),
        ),
      );
    const proposalIds = data.proposals.map((row) => row.id);
    if (proposalIds.length) {
      await tx
        .delete(confirmedFacts)
        .where(
          and(
            eq(confirmedFacts.userId, owner),
            inArray(confirmedFacts.proposalId, proposalIds),
          ),
        );
      await tx
        .delete(personalUpdates)
        .where(
          and(
            eq(personalUpdates.userId, owner),
            inArray(personalUpdates.proposalId, proposalIds),
          ),
        );
    }
    if (data.loopRows.length)
      await tx.delete(openLoops).where(
        and(
          eq(openLoops.userId, owner),
          inArray(
            openLoops.id,
            data.loopRows.map((row) => row.id),
          ),
        ),
      );
    const eventIds = data.eventRows.map((row) => row.id);
    if (eventIds.length) {
      await tx
        .update(checkIns)
        .set({
          interactionId: null,
          status: "canceled",
          decision: "Source recollection changed; contact evidence removed",
          completedAt: null,
        })
        .where(
          and(
            eq(checkIns.userId, owner),
            inArray(checkIns.interactionId, eventIds),
          ),
        );
      await tx
        .delete(interactions)
        .where(
          and(
            eq(interactions.userId, owner),
            inArray(interactions.id, eventIds),
          ),
        );
    }
    for (const review of data.impact.plansToReview) {
      await tx
        .update(keepInTouchPlans)
        .set({
          lastContactOn: review.lastContactOn,
          needsReview: true,
          status: "paused",
          snoozedUntil: null,
          revision: sql`${keepInTouchPlans.revision} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(keepInTouchPlans.userId, owner),
            eq(keepInTouchPlans.id, review.id),
          ),
        );
    }
    // Purge quoted text and generated payloads, including accepted/rejected suggestions.
    if (proposalIds.length)
      await tx
        .delete(memoryProposals)
        .where(
          and(
            eq(memoryProposals.userId, owner),
            inArray(memoryProposals.id, proposalIds),
          ),
        );
    if (data.assistants.length)
      await tx
        .update(interviewTurns)
        .set({
          content: "",
          requestHash: fingerprint({ removed: true }),
          deletedAt: now,
          revision: sql`${interviewTurns.revision} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(interviewTurns.userId, owner),
            inArray(
              interviewTurns.id,
              data.assistants.map((row) => row.id),
            ),
          ),
        );
    const content = input.action === "correct" ? input.content : "";
    await tx
      .update(interviewTurns)
      .set({
        content,
        requestHash: fingerprint({ content }),
        deletedAt: input.action === "remove" ? now : null,
        revision: data.turn.revision + 1,
        updatedAt: now,
      })
      .where(
        and(eq(interviewTurns.id, turnId), eq(interviewTurns.userId, owner)),
      );
    await tx
      .update(interviews)
      .set({ revision: data.interview.revision + 1, updatedAt: now })
      .where(and(eq(interviews.id, interviewId), eq(interviews.userId, owner)));
    await tx.insert(interviewCorrections).values({
      userId: owner,
      interviewId,
      turnId,
      requestKey: input.requestKey,
      requestHash: hash,
      action: input.action,
    });
    return { applied: true as const };
  });
}
