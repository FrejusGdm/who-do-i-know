import { createHash } from "node:crypto";
import { and, asc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  aiProcessingTasks,
  interactionParticipants,
  interactions,
  interviewPeople,
  interviews,
  memoryProposals,
  openLoopRequests,
  openLoops,
  people,
} from "@/db/schema";
import { calendarDate } from "./input";
import { lockMemoryOwner } from "./legacy-ai-jobs";
import { lockPeople, NetworkError, type NetworkTx } from "./store";

const fields = {
  body: z.string().trim().min(1).max(4000),
  dueOn: calendarDate.nullable().default(null),
  interactionId: z.string().uuid().nullable().default(null),
};
export const createOpenLoopInput = z
  .object({ requestKey: z.string().uuid(), ...fields })
  .strict();
const revision = {
  requestKey: z.string().uuid(),
  revision: z.number().int().positive(),
};
export const updateOpenLoopInput = z.discriminatedUnion("action", [
  z.object({ ...revision, action: z.literal("edit"), ...fields }).strict(),
  z
    .object({
      ...revision,
      action: z.literal("status"),
      status: z.enum(["open", "done", "dismissed"]),
    })
    .strict(),
]);
export type OpenLoopView = Pick<
  typeof openLoops.$inferSelect,
  "id" | "personId" | "body" | "dueOn" | "status" | "revision" | "interactionId"
> & { sourceInterviewId: string | null };
const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Owner lock comes first; conservatively invalidate selected-person and source interviews. */
async function lockContext(
  tx: NetworkTx,
  owner: string,
  personId: string,
  proposalId?: string | null,
) {
  const linked = await tx
    .select({ id: interviewPeople.interviewId })
    .from(interviewPeople)
    .where(
      and(
        eq(interviewPeople.userId, owner),
        eq(interviewPeople.personId, personId),
      ),
    );
  const proposal = proposalId
    ? await tx
        .select({ id: memoryProposals.interviewId })
        .from(memoryProposals)
        .where(
          and(
            eq(memoryProposals.userId, owner),
            eq(memoryProposals.id, proposalId),
          ),
        )
    : [];
  const ids = [
    ...new Set([...linked, ...proposal].map((row) => row.id)),
  ].sort();
  if (ids.length)
    await tx
      .select({ id: interviews.id })
      .from(interviews)
      .where(and(eq(interviews.userId, owner), inArray(interviews.id, ids)))
      .orderBy(asc(interviews.id))
      .for("update");
  await lockPeople(tx, owner, [personId]);
  return ids;
}
export async function invalidateCommitmentContext(
  tx: NetworkTx,
  owner: string,
  ids: string[],
) {
  if (!ids.length) return;
  await tx
    .update(interviews)
    .set({ revision: sql`${interviews.revision} + 1`, updatedAt: new Date() })
    .where(and(eq(interviews.userId, owner), inArray(interviews.id, ids)));
  await tx
    .update(aiProcessingTasks)
    .set({
      status: "canceled",
      errorCategory: "source_changed",
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(aiProcessingTasks.userId, owner),
        eq(aiProcessingTasks.targetType, "interview"),
        inArray(aiProcessingTasks.targetId, ids),
        inArray(aiProcessingTasks.status, ["queued", "processing"]),
      ),
    );
}
async function validateInteraction(
  tx: NetworkTx,
  owner: string,
  personId: string,
  interactionId: string | null,
) {
  if (!interactionId) return;
  const [found] = await tx
    .select({ id: interactions.id })
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
        eq(interactions.id, interactionId),
        eq(interactionParticipants.personId, personId),
      ),
    );
  if (!found)
    throw new NetworkError(404, "Interaction not found for this person");
}
async function existingReceipt(
  tx: NetworkTx,
  owner: string,
  personId: string,
  key: string,
  hash: string,
) {
  const [receipt] = await tx
    .select()
    .from(openLoopRequests)
    .where(
      and(
        eq(openLoopRequests.userId, owner),
        eq(openLoopRequests.requestKey, key),
      ),
    );
  if (!receipt) return null;
  if (receipt.requestHash !== hash)
    throw new NetworkError(
      409,
      "This request key was used for a different commitment change",
    );
  const [row] = await tx
    .select()
    .from(openLoops)
    .where(
      and(
        eq(openLoops.userId, owner),
        eq(openLoops.personId, personId),
        eq(openLoops.id, receipt.loopId),
      ),
    );
  if (!row)
    throw new NetworkError(
      409,
      "This commitment was removed with its source. Review the current story before creating another",
    );
  return row;
}
export async function createOpenLoop(
  owner: string,
  personId: string,
  raw: z.input<typeof createOpenLoopInput>,
  options?: { tx: NetworkTx; proposalId: string },
) {
  z.string().uuid().parse(personId);
  const input = createOpenLoopInput.parse(raw);
  const hash = fingerprint({
    action: "create",
    personId,
    ...input,
    proposalId: options?.proposalId ?? null,
  });
  const save = async (tx: NetworkTx) => {
    if (!(await lockMemoryOwner(tx, owner)))
      throw new NetworkError(404, "Person not found");
    const replay = await existingReceipt(
      tx,
      owner,
      personId,
      input.requestKey,
      hash,
    );
    if (replay) return replay;
    const contextIds = await lockContext(
      tx,
      owner,
      personId,
      options?.proposalId,
    );
    await validateInteraction(tx, owner, personId, input.interactionId);
    const [created] = await tx
      .insert(openLoops)
      .values({
        userId: owner,
        personId,
        proposalId: options?.proposalId ?? null,
        body: input.body,
        dueOn: input.dueOn,
        interactionId: input.interactionId,
      })
      .returning();
    await tx.insert(openLoopRequests).values({
      userId: owner,
      personId,
      loopId: created.id,
      requestKey: input.requestKey,
      requestHash: hash,
    });
    await invalidateCommitmentContext(tx, owner, contextIds);
    return created;
  };
  return options ? save(options.tx) : db.transaction(save);
}
export async function updateOpenLoop(
  owner: string,
  personId: string,
  loopId: string,
  raw: z.input<typeof updateOpenLoopInput>,
) {
  z.string().uuid().parse(personId);
  z.string().uuid().parse(loopId);
  const input = updateOpenLoopInput.parse(raw);
  const hash = fingerprint({ personId, loopId, ...input });
  return db.transaction(async (tx) => {
    if (!(await lockMemoryOwner(tx, owner)))
      throw new NetworkError(404, "Commitment not found");
    const replay = await existingReceipt(
      tx,
      owner,
      personId,
      input.requestKey,
      hash,
    );
    if (replay) return replay;
    const [current] = await tx
      .select()
      .from(openLoops)
      .where(
        and(
          eq(openLoops.userId, owner),
          eq(openLoops.personId, personId),
          eq(openLoops.id, loopId),
        ),
      );
    if (!current) throw new NetworkError(404, "Commitment not found");
    const contextIds = await lockContext(
      tx,
      owner,
      personId,
      current.proposalId,
    );
    if (current.revision !== input.revision)
      throw new NetworkError(
        409,
        "This commitment changed. Refresh and review it before saving",
      );
    if (input.action === "edit")
      await validateInteraction(tx, owner, personId, input.interactionId);
    const change =
      input.action === "edit"
        ? {
            body: input.body,
            dueOn: input.dueOn,
            interactionId: input.interactionId,
          }
        : { status: input.status };
    const [saved] = await tx
      .update(openLoops)
      .set({ ...change, revision: current.revision + 1, updatedAt: new Date() })
      .where(and(eq(openLoops.userId, owner), eq(openLoops.id, loopId)))
      .returning();
    await tx.insert(openLoopRequests).values({
      userId: owner,
      personId,
      loopId,
      requestKey: input.requestKey,
      requestHash: hash,
    });
    await invalidateCommitmentContext(tx, owner, contextIds);
    return saved;
  });
}
export async function personOpenLoops(
  owner: string,
  personId: string,
): Promise<OpenLoopView[]> {
  z.string().uuid().parse(personId);
  const [person] = await db
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.userId, owner), eq(people.id, personId)));
  if (!person) throw new NetworkError(404, "Person not found");
  return db
    .select({
      id: openLoops.id,
      personId: openLoops.personId,
      body: openLoops.body,
      dueOn: openLoops.dueOn,
      status: openLoops.status,
      revision: openLoops.revision,
      interactionId: openLoops.interactionId,
      sourceInterviewId: memoryProposals.interviewId,
    })
    .from(openLoops)
    .leftJoin(
      memoryProposals,
      and(
        eq(memoryProposals.userId, owner),
        eq(memoryProposals.id, openLoops.proposalId),
      ),
    )
    .where(and(eq(openLoops.userId, owner), eq(openLoops.personId, personId)))
    .orderBy(
      sql`${openLoops.dueOn} asc nulls last`,
      asc(openLoops.createdAt),
      asc(openLoops.id),
    );
}
export async function openLoopReminders(owner: string) {
  return db
    .select({
      loop: {
        id: openLoops.id,
        personId: openLoops.personId,
        body: openLoops.body,
        dueOn: openLoops.dueOn,
        status: openLoops.status,
        revision: openLoops.revision,
        interactionId: openLoops.interactionId,
      },
      person: {
        id: people.id,
        name: people.name,
        relationshipType: people.relationshipType,
      },
      lastContactOn: sql<string | null>`(${db
        .select({
          date: sql<string | null>`max(${interactions.occurredOn})::text`,
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
            eq(interactionParticipants.personId, people.id),
            eq(interactions.qualifiesForCadence, true),
            eq(interactions.datePrecision, "day"),
          ),
        )})`,
    })
    .from(openLoops)
    .innerJoin(
      people,
      and(eq(people.userId, owner), eq(people.id, openLoops.personId)),
    )
    .where(
      and(
        eq(openLoops.userId, owner),
        eq(openLoops.status, "open"),
        isNotNull(openLoops.dueOn),
        isNull(people.archivedAt),
        ne(people.reviewStatus, "archived"),
      ),
    )
    .orderBy(asc(openLoops.dueOn), asc(openLoops.id));
}
