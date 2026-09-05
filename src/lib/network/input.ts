import { z } from "zod";
import { isCalendarDate, isTimezone } from "./calendar";

export const calendarDate = z.string().refine(isCalendarDate, "Choose a valid date");
export const timezoneInput = z.string().max(100).refine(isTimezone, "Choose a valid timezone");
export const channelInput = z.enum(["email", "text", "call", "in_person", "video", "other"]);
export const personInput = z.object({
  name: z.string().trim().min(1).max(200),
  primaryEmail: z.string().trim().email().max(320).nullable().default(null),
  relationshipType: z.enum(["mentor", "friend", "classmate", "colleague", "family", "other", "unknown"]).default("unknown"),
  organization: z.string().trim().max(200).nullable().default(null),
  metState: z.enum(["not_met", "met", "needs_context"]).default("needs_context"),
  circleIds: z.array(z.string().uuid()).max(20).default([]),
}).strict();

export const circleInput = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(["circle", "cohort"]).default("circle"),
  cohortLabel: z.string().trim().max(120).nullable().default(null),
  expectedCount: z.number().int().min(1).max(10000).nullable().default(null),
}).strict();

export const interactionInput = z.object({
  requestKey: z.string().uuid(),
  personIds: z.array(z.string().uuid()).min(1).max(30).transform((ids) => [...new Set(ids)].sort()),
  body: z.string().trim().min(1).max(12000),
  channel: channelInput,
  direction: z.enum(["mutual", "outbound", "inbound"]).default("mutual"),
  datePrecision: z.enum(["day", "month", "range", "unknown"]).default("unknown"),
  occurredOn: calendarDate.nullable().default(null),
  occurredUntil: calendarDate.nullable().default(null),
  datePhrase: z.string().trim().max(200).nullable().default(null),
  qualifiesForCadence: z.boolean().default(false),
  // Shared event text is private unless the owner explicitly permits drafting.
  shareInDrafts: z.boolean().default(false),
}).strict().superRefine((input, ctx) => {
  if (input.datePrecision === "day" && !input.occurredOn) {
    ctx.addIssue({ code: "custom", path: ["occurredOn"], message: "An exact interaction needs a date" });
  }
  if (input.datePrecision === "unknown" && (input.occurredOn || input.occurredUntil)) {
    ctx.addIssue({ code: "custom", path: ["occurredOn"], message: "Keep unknown dates unknown" });
  }
  if (input.datePrecision === "range" && (!input.occurredOn || !input.occurredUntil || input.occurredUntil < input.occurredOn)) {
    ctx.addIssue({ code: "custom", path: ["occurredUntil"], message: "Choose a valid date range" });
  }
  if (input.datePrecision === "month" && !input.datePhrase) {
    ctx.addIssue({ code: "custom", path: ["datePhrase"], message: "Preserve the approximate month in your words" });
  }
});

export const planInput = z.object({
  nextDueOn: calendarDate,
  intervalCount: z.number().int().min(1).max(120).default(3),
  intervalUnit: z.enum(["days", "weeks", "months"]).default("months"),
  timezone: timezoneInput.default("Asia/Shanghai"),
  preferredChannel: channelInput.default("email"),
  revision: z.number().int().min(1).nullable().default(null),
}).strict();

export const planActionInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("snooze"), revision: z.number().int().min(1), until: calendarDate }).strict(),
  z.object({ action: z.literal("skip"), revision: z.number().int().min(1) }).strict(),
  z.object({ action: z.literal("pause"), revision: z.number().int().min(1) }).strict(),
  z.object({ action: z.literal("resume"), revision: z.number().int().min(1), nextDueOn: calendarDate }).strict(),
]);
