import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  conversationPreferences,
  conversationPreferenceRequests,
  people,
} from "@/db/schema";
import { lockMemoryOwner } from "./legacy-ai-jobs";
import { lockPeople, NetworkError } from "./store";

export const preferenceFormats = [
  "short_text",
  "email",
  "photo",
  "question",
  "article",
  "call",
  "in_person",
] as const;
export const preferenceInput = z
  .object({
    requestKey: z.string().uuid(),
    revision: z.number().int().nonnegative(),
    intention: z.string().trim().max(1000),
    topics: z.string().trim().max(2000),
    preferredFormats: z
      .array(z.enum(preferenceFormats))
      .max(preferenceFormats.length)
      .transform((values) => [...new Set(values)].sort()),
    language: z.string().trim().max(80),
    draftExclusions: z.string().trim().max(2000),
  })
  .strict();
export type PreferenceView = Pick<
  typeof conversationPreferences.$inferSelect,
  | "intention"
  | "topics"
  | "preferredFormats"
  | "language"
  | "draftExclusions"
  | "revision"
>;
const selection = {
  intention: conversationPreferences.intention,
  topics: conversationPreferences.topics,
  preferredFormats: conversationPreferences.preferredFormats,
  language: conversationPreferences.language,
  draftExclusions: conversationPreferences.draftExclusions,
  revision: conversationPreferences.revision,
};

export async function personPreferences(
  owner: string,
  personId: string,
): Promise<PreferenceView | null> {
  z.string().uuid().parse(personId);
  const [person] = await db
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.userId, owner), eq(people.id, personId)));
  if (!person) throw new NetworkError(404, "Person not found");
  const [row] = await db
    .select(selection)
    .from(conversationPreferences)
    .where(
      and(
        eq(conversationPreferences.userId, owner),
        eq(conversationPreferences.personId, personId),
      ),
    );
  return row ?? null;
}

/** Explicit owner choices; no inferred defaults or contact/cadence side effects. */
export async function savePersonPreferences(
  owner: string,
  personId: string,
  raw: z.input<typeof preferenceInput>,
) {
  z.string().uuid().parse(personId);
  const input = preferenceInput.parse(raw);
  const hash = createHash("sha256")
    .update(JSON.stringify({ personId, ...input }))
    .digest("hex");
  return db.transaction(async (tx) => {
    await lockMemoryOwner(tx, owner);
    await lockPeople(tx, owner, [personId]);
    const [current] = await tx
      .select(selection)
      .from(conversationPreferences)
      .where(
        and(
          eq(conversationPreferences.userId, owner),
          eq(conversationPreferences.personId, personId),
        ),
      );
    const [receipt] = await tx
      .select()
      .from(conversationPreferenceRequests)
      .where(
        and(
          eq(conversationPreferenceRequests.userId, owner),
          eq(conversationPreferenceRequests.requestKey, input.requestKey),
        ),
      );
    if (receipt) {
      if (receipt.requestHash !== hash || !current)
        throw new NetworkError(
          409,
          "This request key was used for a different preference change",
        );
      return current;
    }
    if ((current?.revision ?? 0) !== input.revision)
      throw new NetworkError(
        409,
        "These preferences changed. Refresh to review the latest version before saving",
      );
    const { requestKey, revision, ...fields } = input;
    const [saved] = await tx
      .insert(conversationPreferences)
      .values({ userId: owner, personId, ...fields, revision: revision + 1 })
      .onConflictDoUpdate({
        target: [
          conversationPreferences.userId,
          conversationPreferences.personId,
        ],
        set: { ...fields, revision: revision + 1, updatedAt: new Date() },
      })
      .returning(selection);
    await tx
      .insert(conversationPreferenceRequests)
      .values({ userId: owner, personId, requestKey, requestHash: hash });
    return saved;
  });
}
