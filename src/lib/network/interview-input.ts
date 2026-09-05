import { z } from "zod";
import {
  calendarDate,
  interactionInput,
  personInput,
  planInput,
} from "./input";

export const interviewMode = z.enum([
  "keep_close",
  "just_met",
  "debrief",
  "weekly",
]);
export const createInterviewInput = z
  .object({
    requestKey: z.string().uuid(),
    title: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .default("A conversation to remember"),
    mode: interviewMode.default("debrief"),
    personIds: z
      .array(z.string().uuid())
      .max(30)
      .default([])
      .transform((ids) => [...new Set(ids)].sort()),
  })
  .strict();
export const appendTurnInput = z
  .object({
    requestKey: z.string().uuid(),
    revision: z.number().int().positive(),
    content: z.string().trim().min(1).max(12000),
  })
  .strict();
export const interviewStatusInput = z
  .object({
    revision: z.number().int().positive(),
    status: z.enum(["active", "paused", "reviewing", "completed", "discarded"]),
  })
  .strict();
export const sourceQuoteInput = z
  .object({
    turnId: z.string().uuid(),
    revision: z.number().int().positive(),
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
    quote: z.string().min(1).max(4000),
  })
  .strict();
export type SourceQuote = z.infer<typeof sourceQuoteInput>;

const personId = z.string().uuid().nullable().default(null);
const interactionProposalValues = interactionInput.safeExtend({
  personIds: z
    .array(z.string().uuid())
    .max(30)
    .transform((ids) => [...new Set(ids)].sort()),
});
// Values are proposals, never instructions to the application or confirmed facts.
export const proposalPayload = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("new_person"), values: personInput }).strict(),
  z
    .object({
      kind: z.literal("note"),
      personId,
      body: z.string().trim().min(1).max(12000),
      shareInDrafts: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      kind: z.literal("profile_fact"),
      personId,
      label: z.string().trim().min(1).max(120),
      body: z.string().trim().min(1).max(4000),
      shareInDrafts: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      kind: z.literal("interaction"),
      values: interactionProposalValues,
    })
    .strict(),
  z.object({ kind: z.literal("plan"), personId, values: planInput }).strict(),
  z
    .object({
      kind: z.literal("circle_membership"),
      personId,
      circleId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("open_loop"),
      personId,
      body: z.string().trim().min(1).max(4000),
      dueOn: calendarDate.nullable().default(null),
    })
    .strict(),
  z
    .object({
      kind: z.literal("personal_update"),
      title: z.string().trim().min(1).max(160),
      body: z.string().trim().min(1).max(4000),
      happenedOn: calendarDate.nullable().default(null),
      allowedPersonIds: z.array(z.string().uuid()).max(100).default([]),
      allowedCircleIds: z.array(z.string().uuid()).max(30).default([]),
    })
    .strict(),
]);
export type ProposalPayload = z.infer<typeof proposalPayload>;
export const proposalInput = z
  .object({
    payload: proposalPayload,
    sources: z.array(sourceQuoteInput).min(1).max(8),
    confidence: z.enum(["high", "medium", "low"]).default("low"),
    uncertainty: z.string().trim().max(1000).default(""),
    sensitive: z.boolean().default(true),
    // An ambiguous model identity must be explicitly resolved in the review request.
    unresolvedIdentity: z.boolean().default(false),
    identityHints: z
      .array(z.string().trim().min(1).max(200))
      .max(30)
      .default([]),
  })
  .strict();
export const reviewProposalInput = z
  .object({
    revision: z.number().int().positive(),
    action: z.enum(["accept", "reject"]),
    payload: proposalPayload.optional(),
    identityConfirmed: z.boolean().default(false),
    sensitive: z.boolean().optional(),
  })
  .strict();
