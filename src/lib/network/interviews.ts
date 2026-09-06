import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  circles,
  confirmedFacts,
  interviewPeople,
  interviews,
  interviewTurns,
  memoryProposals,
  notes,
  openLoops,
  personalUpdates,
  interactions,
  people,
} from "@/db/schema";
import {
  appendTurnInput,
  createInterviewInput,
  interviewStatusInput,
  proposalInput,
  reviewProposalInput,
  type ProposalPayload,
} from "./interview-input";
import {
  createPerson,
  lockPeople,
  NetworkError,
  recordInteraction,
  savePlan,
  setCircleMembership,
  type NetworkTx,
} from "./store";
import {
  privateProposal,
  proposalPeople,
  validateSourceQuotes,
} from "./interview-grounding";

const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function lockInterview(tx: NetworkTx, userId: string, id: string) {
  z.string().uuid().parse(id);
  const [row] = await tx
    .select()
    .from(interviews)
    .where(and(eq(interviews.id, id), eq(interviews.userId, userId)))
    .for("update");
  if (!row) throw new NetworkError(404, "Interview not found");
  return row;
}

export async function createInterview(
  userId: string,
  raw: z.input<typeof createInterviewInput>,
) {
  const input = createInterviewInput.parse(raw);
  const hash = fingerprint(input);
  return db.transaction(async (tx) => {
    const { personIds, ...fields } = input;
    const [created] = await tx
      .insert(interviews)
      .values({ ...fields, userId, requestHash: hash })
      .onConflictDoNothing({
        target: [interviews.userId, interviews.requestKey],
      })
      .returning();
    if (!created) {
      const [existing] = await tx
        .select()
        .from(interviews)
        .where(
          and(
            eq(interviews.userId, userId),
            eq(interviews.requestKey, input.requestKey),
          ),
        );
      if (
        !existing ||
        existing.requestHash !== hash ||
        existing.status === "discarded"
      )
        throw new NetworkError(
          409,
          "This request key was already used for another interview",
        );
      return existing;
    }
    if (personIds.length) await lockPeople(tx, userId, personIds);
    if (personIds.length)
      await tx
        .insert(interviewPeople)
        .values(
          personIds.map((personId) => ({
            userId,
            interviewId: created.id,
            personId,
          })),
        );
    return created;
  });
}

export async function listInterviews(userId: string) {
  return db
    .select()
    .from(interviews)
    .where(eq(interviews.userId, userId))
    .orderBy(desc(interviews.updatedAt))
    .limit(100);
}
export async function getInterview(userId: string, id: string) {
  if (!z.string().uuid().safeParse(id).success)
    throw new NetworkError(404, "Interview not found");
  const [interview] = await db
    .select()
    .from(interviews)
    .where(and(eq(interviews.id, id), eq(interviews.userId, userId)));
  if (!interview) throw new NetworkError(404, "Interview not found");
  const [turns, proposals, participants] = await Promise.all([
    db
      .select()
      .from(interviewTurns)
      .where(
        and(
          eq(interviewTurns.interviewId, id),
          eq(interviewTurns.userId, userId),
        ),
      )
      .orderBy(asc(interviewTurns.ordinal)),
    db
      .select()
      .from(memoryProposals)
      .where(
        and(
          eq(memoryProposals.interviewId, id),
          eq(memoryProposals.userId, userId),
        ),
      )
      .orderBy(asc(memoryProposals.createdAt), asc(memoryProposals.ordinal)),
    db
      .select({
        id: people.id,
        name: people.name,
        archivedAt: people.archivedAt,
      })
      .from(interviewPeople)
      .innerJoin(
        people,
        and(eq(people.id, interviewPeople.personId), eq(people.userId, userId)),
      )
      .where(
        and(
          eq(interviewPeople.interviewId, id),
          eq(interviewPeople.userId, userId),
        ),
      ),
  ]);
  return { interview, turns, proposals, participants };
}

export async function appendInterviewTurn(
  userId: string,
  interviewId: string,
  raw: z.input<typeof appendTurnInput>,
) {
  const input = appendTurnInput.parse(raw);
  // Revision is a concurrency guard, not part of the identity of the saved words.
  const hash = fingerprint({ content: input.content });
  return db.transaction(async (tx) => {
    const interview = await lockInterview(tx, userId, interviewId);
    const [existing] = await tx
      .select()
      .from(interviewTurns)
      .where(
        and(
          eq(interviewTurns.interviewId, interviewId),
          eq(interviewTurns.requestKey, input.requestKey),
          eq(interviewTurns.userId, userId),
        ),
      );
    if (existing) {
      if (
        existing.role !== "user" ||
        existing.requestHash !== hash ||
        existing.deletedAt ||
        interview.status === "discarded"
      )
        throw new NetworkError(
          409,
          "This turn key was already used for different words",
        );
      return { turn: existing, interview };
    }
    if (!["active", "reviewing"].includes(interview.status))
      throw new NetworkError(409, "Resume this interview before adding more");
    if (interview.revision !== input.revision)
      throw new NetworkError(
        409,
        "The interview changed. Reload its saved turns before retrying",
      );
    const [size] = await tx
      .select({
        count: sql<number>`count(*)::int`,
        characters: sql<number>`coalesce(sum(length(${interviewTurns.content})), 0)::int`,
        ordinal: sql<number>`coalesce(max(${interviewTurns.ordinal}), 0)::int`,
      })
      .from(interviewTurns)
      .where(eq(interviewTurns.interviewId, interviewId));
    if (size.count >= 500 || size.characters + input.content.length > 300000)
      throw new NetworkError(
        400,
        "This interview is full. Start another to continue",
      );
    const [turn] = await tx
      .insert(interviewTurns)
      .values({
        userId,
        interviewId,
        requestKey: input.requestKey,
        requestHash: hash,
        ordinal: size.ordinal + 1,
        role: "user",
        content: input.content,
      })
      .returning();
    const [updated] = await tx
      .update(interviews)
      .set({
        revision: interview.revision + 1,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(interviews.id, interviewId))
      .returning();
    return { turn, interview: updated };
  });
}

export async function changeInterviewStatus(
  userId: string,
  interviewId: string,
  raw: z.input<typeof interviewStatusInput>,
) {
  const input = interviewStatusInput.parse(raw);
  return db.transaction(async (tx) => {
    const interview = await lockInterview(tx, userId, interviewId);
    if (interview.status === input.status) return interview;
    if (interview.status === "discarded")
      throw new NetworkError(409, "A discarded interview cannot be resumed");
    if (interview.revision !== input.revision)
      throw new NetworkError(
        409,
        "The interview changed. Reload before changing its status",
      );
    if (input.status === "completed") {
      const [pending] = await tx
        .select({ id: memoryProposals.id })
        .from(memoryProposals)
        .where(
          and(
            eq(memoryProposals.interviewId, interviewId),
            eq(memoryProposals.status, "pending"),
          ),
        )
        .limit(1);
      if (pending)
        throw new NetworkError(
          409,
          "Review or reject the remaining suggestions before finishing",
        );
    }
    if (input.status === "discarded")
      await tx
        .update(memoryProposals)
        .set({ status: "stale" })
        .where(
          and(
            eq(memoryProposals.interviewId, interviewId),
            eq(memoryProposals.status, "pending"),
          ),
        );
    const [updated] = await tx
      .update(interviews)
      .set({
        status: input.status,
        revision: interview.revision + 1,
        updatedAt: new Date(),
      })
      .where(eq(interviews.id, interviewId))
      .returning();
    return updated;
  });
}

const publishInput = z
  .object({
    generationKey: z.string().uuid(),
    sourceRevision: z.number().int().positive(),
    assistant: z.string().trim().min(1).max(4000),
    proposals: z.array(proposalInput).max(20),
  })
  .strict();
/** Internal model-result boundary. There is deliberately no public route accepting model proposals. */
export async function publishInterviewGeneration(
  userId: string,
  interviewId: string,
  raw: z.input<typeof publishInput>,
  transaction?: NetworkTx,
) {
  const input = publishInput.parse(raw);
  const proposals = input.proposals.map((proposal) => ({
    ...proposal,
    payload: privateProposal(proposal.payload),
  }));
  const hash = fingerprint({ ...input, proposals });
  const publish = async (tx: NetworkTx) => {
    const interview = await lockInterview(tx, userId, interviewId);
    if (!["active", "reviewing"].includes(interview.status))
      throw new NetworkError(
        409,
        "The interview is no longer accepting model results",
      );
    const [existing] = await tx
      .select()
      .from(interviewTurns)
      .where(
        and(
          eq(interviewTurns.interviewId, interviewId),
          eq(interviewTurns.requestKey, input.generationKey),
          eq(interviewTurns.userId, userId),
        ),
      );
    if (existing) {
      if (existing.role !== "assistant" || existing.requestHash !== hash)
        throw new NetworkError(
          409,
          "The generation key was already used for a different result",
        );
      return getGeneration(
        tx,
        userId,
        interviewId,
        input.generationKey,
        existing,
      );
    }
    if (interview.revision !== input.sourceRevision)
      throw new NetworkError(
        409,
        "Newer input arrived. The older model result was not saved",
      );
    const turns = await tx
      .select()
      .from(interviewTurns)
      .where(
        and(
          eq(interviewTurns.interviewId, interviewId),
          eq(interviewTurns.userId, userId),
        ),
      );
    if (
      turns.length >= 500 ||
      turns.reduce((total, turn) => total + turn.content.length, 0) +
        input.assistant.length >
        300000
    )
      throw new NetworkError(400, "This interview is full");
    const participants = await tx
      .select({ personId: interviewPeople.personId })
      .from(interviewPeople)
      .where(
        and(
          eq(interviewPeople.interviewId, interviewId),
          eq(interviewPeople.userId, userId),
        ),
      );
    const knownIds = new Set(participants.map((row) => row.personId));
    const allIds = [
      ...new Set(
        proposals.flatMap((proposal) => proposalPeople(proposal.payload)),
      ),
    ].sort();
    if (allIds.length) await lockPeople(tx, userId, allIds);
    for (const proposal of proposals) {
      validateSourceQuotes(proposal.sources, turns);
      const ids = proposalPeople(proposal.payload);
      if (
        ids.some((id) => !knownIds.has(id)) ||
        ("personId" in proposal.payload && !proposal.payload.personId) ||
        (proposal.payload.kind === "interaction" && !ids.length)
      )
        proposal.unresolvedIdentity = true;
    }
    const [assistant] = await tx
      .insert(interviewTurns)
      .values({
        userId,
        interviewId,
        requestKey: input.generationKey,
        requestHash: hash,
        ordinal: Math.max(0, ...turns.map((turn) => turn.ordinal)) + 1,
        role: "assistant",
        content: input.assistant,
      })
      .returning();
    if (proposals.length)
      await tx
        .insert(memoryProposals)
        .values(
          proposals.map((proposal, ordinal) => ({
            ...proposal,
            userId,
            interviewId,
            generationKey: input.generationKey,
            sourceRevision: input.sourceRevision,
            ordinal,
          })),
        );
    await tx
      .update(interviews)
      .set({ revision: interview.revision + 1, updatedAt: new Date() })
      .where(eq(interviews.id, interviewId));
    return getGeneration(
      tx,
      userId,
      interviewId,
      input.generationKey,
      assistant,
    );
  };
  return transaction ? publish(transaction) : db.transaction(publish);
}
async function getGeneration(
  tx: NetworkTx,
  userId: string,
  interviewId: string,
  key: string,
  assistant: typeof interviewTurns.$inferSelect,
) {
  const proposals = await tx
    .select()
    .from(memoryProposals)
    .where(
      and(
        eq(memoryProposals.interviewId, interviewId),
        eq(memoryProposals.userId, userId),
        eq(memoryProposals.generationKey, key),
      ),
    )
    .orderBy(asc(memoryProposals.ordinal));
  return { assistant, proposals };
}

function requiredPerson(id: string | null): string {
  if (!id)
    throw new NetworkError(
      409,
      "Choose who this memory belongs to before accepting",
    );
  return id;
}

async function materialize(
  tx: NetworkTx,
  userId: string,
  proposal: typeof memoryProposals.$inferSelect,
  payload: ProposalPayload,
) {
  const ids = [...new Set(proposalPeople(payload))].sort();
  if (ids.length) await lockPeople(tx, userId, ids);
  let ref: { type: string; id: string };
  switch (payload.kind) {
    case "new_person": {
      const person = await createPerson(userId, payload.values, tx);
      ids.push(person.id);
      ref = { type: "person", id: person.id };
      break;
    }
    case "note": {
      const [note] = await tx
        .insert(notes)
        .values({
          userId,
          personId: requiredPerson(payload.personId),
          body: payload.body,
        })
        .returning();
      ref = { type: "note", id: note.id };
      break;
    }
    case "profile_fact": {
      const [fact] = await tx
        .insert(confirmedFacts)
        .values({
          userId,
          personId: requiredPerson(payload.personId),
          proposalId: proposal.id,
          label: payload.label,
          body: payload.body,
          shareInDrafts: payload.shareInDrafts,
        })
        .returning();
      ref = { type: "profile_fact", id: fact.id };
      break;
    }
    case "interaction": {
      if (!payload.values.personIds.length)
        throw new NetworkError(
          409,
          "Choose the people in this interaction before accepting",
        );
      // The proposal's stable ID, not a model-controlled key, identifies its materialization.
      const event = await recordInteraction(
        userId,
        { ...payload.values, requestKey: proposal.id },
        tx,
      );
      await tx
        .update(interactions)
        .set({ source: "reviewed_interview" })
        .where(
          and(eq(interactions.id, event.id), eq(interactions.userId, userId)),
        );
      ref = { type: "interaction", id: event.id };
      break;
    }
    case "plan": {
      const plan = await savePlan(
        userId,
        requiredPerson(payload.personId),
        payload.values,
        tx,
      );
      ref = { type: "plan", id: plan.id };
      break;
    }
    case "circle_membership": {
      await setCircleMembership(
        userId,
        payload.circleId,
        requiredPerson(payload.personId),
        true,
        tx,
      );
      ref = { type: "circle_membership", id: payload.circleId };
      break;
    }
    case "open_loop": {
      const [loop] = await tx
        .insert(openLoops)
        .values({
          userId,
          personId: requiredPerson(payload.personId),
          proposalId: proposal.id,
          body: payload.body,
          dueOn: payload.dueOn,
        })
        .returning();
      ref = { type: "open_loop", id: loop.id };
      break;
    }
    case "personal_update": {
      if (payload.allowedCircleIds.length) {
        const matches = await tx
          .select({ id: circles.id })
          .from(circles)
          .where(
            and(
              eq(circles.userId, userId),
              inArray(circles.id, payload.allowedCircleIds),
            ),
          );
        if (matches.length !== new Set(payload.allowedCircleIds).size)
          throw new NetworkError(404, "Circle not found");
      }
      const [update] = await tx
        .insert(personalUpdates)
        .values({
          title: payload.title,
          body: payload.body,
          happenedOn: payload.happenedOn,
          allowedPersonIds: payload.allowedPersonIds,
          allowedCircleIds: payload.allowedCircleIds,
          userId,
          proposalId: proposal.id,
        })
        .returning();
      ref = { type: "personal_update", id: update.id };
      break;
    }
  }
  if (ids.length)
    await tx
      .insert(interviewPeople)
      .values(
        ids.map((personId) => ({
          userId,
          interviewId: proposal.interviewId,
          personId,
        })),
      )
      .onConflictDoNothing();
  return ref;
}

export async function reviewMemoryProposal(
  userId: string,
  interviewId: string,
  proposalId: string,
  raw: z.input<typeof reviewProposalInput>,
) {
  z.string().uuid().parse(proposalId);
  const input = reviewProposalInput.parse(raw);
  const hash = fingerprint(input);
  return db.transaction(async (tx) => {
    const interview = await lockInterview(tx, userId, interviewId);
    if (interview.status === "discarded")
      throw new NetworkError(409, "This interview was discarded");
    const [proposal] = await tx
      .select()
      .from(memoryProposals)
      .where(
        and(
          eq(memoryProposals.id, proposalId),
          eq(memoryProposals.userId, userId),
          eq(memoryProposals.interviewId, interviewId),
        ),
      )
      .for("update");
    if (!proposal) throw new NetworkError(404, "Suggestion not found");
    if (proposal.status === "accepted" || proposal.status === "rejected") {
      if (proposal.reviewHash !== hash)
        throw new NetworkError(
          409,
          "This suggestion has already been reviewed differently",
        );
      return proposal;
    }
    if (proposal.status !== "pending" || proposal.revision !== input.revision)
      throw new NetworkError(
        409,
        "This suggestion changed. Review the latest version",
      );
    if (input.action === "reject") {
      const [rejected] = await tx
        .update(memoryProposals)
        .set({
          status: "rejected",
          revision: proposal.revision + 1,
          reviewHash: hash,
          reviewedAt: new Date(),
        })
        .where(eq(memoryProposals.id, proposalId))
        .returning();
      return rejected;
    }
    if (proposal.unresolvedIdentity && !input.identityConfirmed)
      throw new NetworkError(
        409,
        "Choose who this memory belongs to before accepting",
      );
    const payload = input.payload ?? proposal.payload;
    if (payload.kind !== proposal.payload.kind)
      throw new NetworkError(400, "Keep the suggestion type when reviewing it");
    const sensitive = input.sensitive ?? proposal.sensitive;
    const shares =
      ("shareInDrafts" in payload && payload.shareInDrafts) ||
      (payload.kind === "interaction" && payload.values.shareInDrafts) ||
      (payload.kind === "personal_update" &&
        (payload.allowedPersonIds.length || payload.allowedCircleIds.length));
    if (sensitive && shares)
      throw new NetworkError(400, "Sensitive context must stay private");
    const turns = await tx
      .select()
      .from(interviewTurns)
      .where(
        and(
          eq(interviewTurns.interviewId, interviewId),
          eq(interviewTurns.userId, userId),
        ),
      );
    validateSourceQuotes(proposal.sources, turns);
    const acceptedRef = await materialize(tx, userId, proposal, payload);
    const [accepted] = await tx
      .update(memoryProposals)
      .set({
        payload,
        sensitive,
        unresolvedIdentity: false,
        status: "accepted",
        acceptedRef,
        reviewHash: hash,
        revision: proposal.revision + 1,
        reviewedAt: new Date(),
      })
      .where(eq(memoryProposals.id, proposalId))
      .returning();
    return accepted;
  });
}
