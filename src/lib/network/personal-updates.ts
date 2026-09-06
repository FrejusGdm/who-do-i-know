import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  circles,
  memoryProposals,
  people,
  personalUpdates,
  personalUpdateRequests,
} from "@/db/schema";
import { calendarDate } from "./input";
import { lockMemoryOwner } from "./legacy-ai-jobs";
import { invalidateInterviewContexts } from "./interview-invalidation";
import { NetworkError, type NetworkTx } from "./store";

const audience = (max: number) =>
  z
    .array(z.string().uuid())
    .max(max)
    .default([])
    .transform((ids) => [...new Set(ids)].sort());
const fields = {
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(4000),
  happenedOn: calendarDate.nullable().default(null),
  allowedPersonIds: audience(100),
  allowedCircleIds: audience(30),
};
export const createPersonalUpdateInput = z
  .object({ requestKey: z.string().uuid(), ...fields })
  .strict();
export const editPersonalUpdateInput = z.discriminatedUnion("action", [
  z
    .object({
      requestKey: z.string().uuid(),
      revision: z.number().int().positive(),
      action: z.literal("edit"),
      ...fields,
    })
    .strict(),
  z
    .object({
      requestKey: z.string().uuid(),
      revision: z.number().int().positive(),
      action: z.literal("remove"),
    })
    .strict(),
]);
export type PersonalUpdateView = Pick<
  typeof personalUpdates.$inferSelect,
  | "id"
  | "title"
  | "body"
  | "happenedOn"
  | "allowedPersonIds"
  | "allowedCircleIds"
  | "revision"
> & { sourceInterviewId: string | null };
const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function checkAudience(
  tx: NetworkTx,
  owner: string,
  personIds: string[],
  circleIds: string[],
) {
  if (personIds.length) {
    const matches = await tx
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.userId, owner), inArray(people.id, personIds)))
      .orderBy(asc(people.id))
      .for("update");
    if (matches.length !== personIds.length)
      throw new NetworkError(404, "Audience person not found");
  }
  if (circleIds.length) {
    const matches = await tx
      .select({ id: circles.id })
      .from(circles)
      .where(and(eq(circles.userId, owner), inArray(circles.id, circleIds)))
      .orderBy(asc(circles.id))
      .for("update");
    if (matches.length !== circleIds.length)
      throw new NetworkError(404, "Audience circle not found");
  }
}
async function replay(
  tx: NetworkTx,
  owner: string,
  requestKey: string,
  hash: string,
) {
  const [receipt] = await tx
    .select()
    .from(personalUpdateRequests)
    .where(
      and(
        eq(personalUpdateRequests.userId, owner),
        eq(personalUpdateRequests.requestKey, requestKey),
      ),
    );
  if (!receipt) return null;
  if (receipt.requestHash !== hash)
    throw new NetworkError(
      409,
      "This request key was used for a different update change",
    );
  const [row] = await tx
    .select()
    .from(personalUpdates)
    .where(
      and(
        eq(personalUpdates.userId, owner),
        eq(personalUpdates.id, receipt.updateId),
      ),
    );
  if (!row)
    throw new NetworkError(
      409,
      "This update was removed with its source. Review the current story before creating another",
    );
  return row;
}
async function invalidateOrigin(
  tx: NetworkTx,
  owner: string,
  proposalId: string | null,
) {
  if (!proposalId) return;
  const [source] = await tx
    .select({ id: memoryProposals.interviewId })
    .from(memoryProposals)
    .where(
      and(
        eq(memoryProposals.userId, owner),
        eq(memoryProposals.id, proposalId),
      ),
    );
  if (source) await invalidateInterviewContexts(tx, owner, [source.id]);
}

export async function createPersonalUpdate(
  owner: string,
  raw: z.input<typeof createPersonalUpdateInput>,
  options?: { tx: NetworkTx; proposalId: string },
) {
  const input = createPersonalUpdateInput.parse(raw);
  const hash = fingerprint({
    action: "create",
    ...input,
    proposalId: options?.proposalId ?? null,
  });
  const save = async (tx: NetworkTx) => {
    if (!(await lockMemoryOwner(tx, owner)))
      throw new NetworkError(404, "Update not found");
    const existing = await replay(tx, owner, input.requestKey, hash);
    if (existing) return existing;
    await checkAudience(
      tx,
      owner,
      input.allowedPersonIds,
      input.allowedCircleIds,
    );
    const { requestKey, ...values } = input;
    const [created] = await tx
      .insert(personalUpdates)
      .values({
        userId: owner,
        ...values,
        proposalId: options?.proposalId ?? null,
      })
      .returning();
    await tx
      .insert(personalUpdateRequests)
      .values({
        userId: owner,
        updateId: created.id,
        requestKey,
        requestHash: hash,
      });
    await invalidateOrigin(tx, owner, created.proposalId);
    return created;
  };
  return options ? save(options.tx) : db.transaction(save);
}
export async function changePersonalUpdate(
  owner: string,
  updateId: string,
  raw: z.input<typeof editPersonalUpdateInput>,
) {
  z.string().uuid().parse(updateId);
  const input = editPersonalUpdateInput.parse(raw),
    hash = fingerprint({ updateId, ...input });
  return db.transaction(async (tx) => {
    if (!(await lockMemoryOwner(tx, owner)))
      throw new NetworkError(404, "Update not found");
    const existing = await replay(tx, owner, input.requestKey, hash);
    if (existing) return existing;
    const [current] = await tx
      .select()
      .from(personalUpdates)
      .where(
        and(
          eq(personalUpdates.userId, owner),
          eq(personalUpdates.id, updateId),
        ),
      );
    if (!current || current.deletedAt)
      throw new NetworkError(404, "Update not found");
    if (current.revision !== input.revision)
      throw new NetworkError(
        409,
        "This update changed. Reload it before saving",
      );
    // Invalidate the source interview before acquiring audience-person locks.
    await invalidateOrigin(tx, owner, current.proposalId);
    const values =
      input.action === "edit"
        ? {
            title: input.title,
            body: input.body,
            happenedOn: input.happenedOn,
            allowedPersonIds: input.allowedPersonIds,
            allowedCircleIds: input.allowedCircleIds,
          }
        : {
            title: "",
            body: "",
            happenedOn: null,
            allowedPersonIds: [],
            allowedCircleIds: [],
            deletedAt: new Date(),
          };
    if (input.action === "edit")
      await checkAudience(
        tx,
        owner,
        values.allowedPersonIds,
        values.allowedCircleIds,
      );
    const [saved] = await tx
      .update(personalUpdates)
      .set({ ...values, revision: current.revision + 1, updatedAt: new Date() })
      .where(
        and(
          eq(personalUpdates.userId, owner),
          eq(personalUpdates.id, updateId),
        ),
      )
      .returning();
    await tx
      .insert(personalUpdateRequests)
      .values({
        userId: owner,
        updateId,
        requestKey: input.requestKey,
        requestHash: hash,
      });
    return saved;
  });
}

export async function listPersonalUpdates(owner: string, page = 1) {
  z.number().int().min(1).max(10000).parse(page);
  const rows = await db
    .select({
      id: personalUpdates.id,
      title: personalUpdates.title,
      body: personalUpdates.body,
      happenedOn: personalUpdates.happenedOn,
      allowedPersonIds: personalUpdates.allowedPersonIds,
      allowedCircleIds: personalUpdates.allowedCircleIds,
      revision: personalUpdates.revision,
      sourceInterviewId: memoryProposals.interviewId,
    })
    .from(personalUpdates)
    .leftJoin(
      memoryProposals,
      and(
        eq(memoryProposals.userId, owner),
        eq(memoryProposals.id, personalUpdates.proposalId),
      ),
    )
    .where(
      and(eq(personalUpdates.userId, owner), isNull(personalUpdates.deletedAt)),
    )
    .orderBy(desc(personalUpdates.updatedAt), asc(personalUpdates.id))
    .limit(21)
    .offset((page - 1) * 20);
  const updates: PersonalUpdateView[] = rows.slice(0, 20);
  const personIds = [
    ...new Set(updates.flatMap((row) => row.allowedPersonIds)),
  ];
  const persons = personIds.length
    ? await db
        .select({ id: people.id, name: people.name })
        .from(people)
        .where(and(eq(people.userId, owner), inArray(people.id, personIds)))
    : [];
  const groups = await db
    .select({ id: circles.id, name: circles.name })
    .from(circles)
    .where(eq(circles.userId, owner))
    .orderBy(asc(circles.name));
  return {
    updates,
    people: persons,
    circles: groups,
    page,
    hasMore: rows.length > 20,
  };
}
