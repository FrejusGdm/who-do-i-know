import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { checkIns, circleMembers, circles, interactionParticipants, interactions, keepInTouchPlans, networkSettings, people } from "@/db/schema";
import { addCalendarInterval, contactAdvancesPlan, nextOccurrenceAfter, todayInTimezone } from "./calendar";
import { circleInput, interactionInput, personInput, planActionInput, planInput } from "./input";

export class NetworkError extends Error {
  constructor(public status: 400 | 404 | 409, message: string) { super(message); }
}
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockPeople(tx: Tx, userId: string, ids: string[]) {
  // Consistent ordering prevents deadlocks when group conversations overlap.
  const rows = await tx.select().from(people)
    .where(and(eq(people.userId, userId), inArray(people.id, ids), isNull(people.archivedAt), ne(people.reviewStatus, "archived")))
    .orderBy(people.id).for("update");
  if (rows.length !== new Set(ids).size) throw new NetworkError(404, "Person not found");
  return rows;
}

export async function createPerson(userId: string, raw: z.input<typeof personInput>) {
  const input = personInput.parse(raw);
  return db.transaction(async (tx) => {
    if (input.circleIds.length) {
      const matches = await tx.select({ id: circles.id }).from(circles)
        .where(and(eq(circles.userId, userId), inArray(circles.id, input.circleIds)));
      if (matches.length !== new Set(input.circleIds).size) throw new NetworkError(404, "Circle not found");
    }
    const { circleIds, ...fields } = input;
    const [person] = await tx.insert(people).values({
      ...fields, userId, primaryEmail: fields.primaryEmail?.toLowerCase() ?? null,
      source: "manual", reviewStatus: "confirmed",
    }).returning();
    if (circleIds.length) await tx.insert(circleMembers).values([...new Set(circleIds)].map((circleId) => ({ userId, circleId, personId: person.id })));
    return person;
  });
}

export async function createCircle(userId: string, raw: z.input<typeof circleInput>) {
  const input = circleInput.parse(raw);
  const [circle] = await db.insert(circles).values({ ...input, userId }).returning();
  return circle;
}

export async function setCircleMembership(userId: string, circleId: string, personId: string, member: boolean) {
  z.string().uuid().parse(circleId); z.string().uuid().parse(personId);
  await db.transaction(async (tx) => {
    await lockPeople(tx, userId, [personId]);
    const [circle] = await tx.select().from(circles).where(and(eq(circles.id, circleId), eq(circles.userId, userId)));
    if (!circle) throw new NetworkError(404, "Circle not found");
    if (member) await tx.insert(circleMembers).values({ userId, circleId, personId }).onConflictDoNothing();
    else await tx.delete(circleMembers).where(and(eq(circleMembers.userId, userId), eq(circleMembers.circleId, circleId), eq(circleMembers.personId, personId)));
  });
}

async function cycleDecision(tx: Tx, plan: typeof keepInTouchPlans.$inferSelect, status: "completed" | "skipped" | "canceled", interactionId: string | null, decision: string) {
  const cycleKey = String(plan.cycleNumber);
  await tx.insert(checkIns).values({
    userId: plan.userId, planId: plan.id, cycleKey, dueOn: plan.nextDueOn,
    status, interactionId, decision, completedAt: new Date(),
  }).onConflictDoUpdate({
    target: [checkIns.planId, checkIns.cycleKey],
    set: { status, interactionId, decision, completedAt: new Date() },
  });
}

export async function recordInteraction(userId: string, raw: z.input<typeof interactionInput>) {
  const input = interactionInput.parse(raw);
  const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return db.transaction(async (tx) => {
    await lockPeople(tx, userId, input.personIds);
    const [settings] = await tx.select().from(networkSettings).where(eq(networkSettings.userId, userId));
    const today = todayInTimezone(settings?.timezone ?? "Asia/Shanghai");
    if ((input.occurredOn && input.occurredOn > today) || (input.occurredUntil && input.occurredUntil > today)) throw new NetworkError(400, "An interaction cannot happen in the future");
    const { personIds, requestKey, ...fields } = input;
    const [created] = await tx.insert(interactions).values({ ...fields, userId, requestKey, requestHash })
      .onConflictDoNothing({ target: [interactions.userId, interactions.requestKey] }).returning();
    if (!created) {
      const [existing] = await tx.select().from(interactions).where(and(eq(interactions.userId, userId), eq(interactions.requestKey, requestKey)));
      if (!existing || existing.requestHash !== requestHash) throw new NetworkError(409, "This request key was already used for a different interaction");
      return existing;
    }
    await tx.insert(interactionParticipants).values(personIds.map((personId) => ({ userId, personId, interactionId: created.id })));
    if (input.direction === "mutual") await tx.update(people).set({ metState: "met", updatedAt: new Date() })
      .where(and(eq(people.userId, userId), inArray(people.id, personIds)));
    if (input.datePrecision === "day" && input.occurredOn && input.qualifiesForCadence) {
      const plans = await tx.select().from(keepInTouchPlans)
        .where(and(eq(keepInTouchPlans.userId, userId), inArray(keepInTouchPlans.personId, personIds))).for("update");
      for (const plan of plans) {
        if (!contactAdvancesPlan(plan.lastContactOn, input.occurredOn, true)) continue;
        await cycleDecision(tx, plan, "completed", created.id, "Contact recorded by owner");
        const nextDueOn = addCalendarInterval(input.occurredOn, { count: plan.intervalCount, unit: plan.intervalUnit });
        await tx.update(keepInTouchPlans).set({
          lastContactOn: input.occurredOn, anchorOn: input.occurredOn, nextDueOn,
          snoozedUntil: null, cycleNumber: plan.cycleNumber + 1, revision: plan.revision + 1, updatedAt: new Date(),
        }).where(and(eq(keepInTouchPlans.id, plan.id), eq(keepInTouchPlans.userId, userId)));
      }
    }
    return created;
  });
}

export async function savePlan(userId: string, personId: string, raw: z.input<typeof planInput>) {
  z.string().uuid().parse(personId);
  const input = planInput.parse(raw);
  return db.transaction(async (tx) => {
    await lockPeople(tx, userId, [personId]);
    const [existing] = await tx.select().from(keepInTouchPlans)
      .where(and(eq(keepInTouchPlans.userId, userId), eq(keepInTouchPlans.personId, personId))).for("update");
    if ((existing?.revision ?? null) !== input.revision) throw new NetworkError(409, "This plan changed. Refresh and review it before saving");
    const [latest] = await tx.select({ occurredOn: interactions.occurredOn }).from(interactions)
      .innerJoin(interactionParticipants, and(eq(interactions.id, interactionParticipants.interactionId), eq(interactionParticipants.userId, userId)))
      .where(and(eq(interactions.userId, userId), eq(interactionParticipants.personId, personId), eq(interactions.qualifiesForCadence, true), eq(interactions.datePrecision, "day")))
      .orderBy(desc(interactions.occurredOn)).limit(1);
    const fields = {
      intervalCount: input.intervalCount, intervalUnit: input.intervalUnit, timezone: input.timezone,
      preferredChannel: input.preferredChannel, nextDueOn: input.nextDueOn, anchorOn: input.nextDueOn,
      lastContactOn: latest?.occurredOn ?? null, snoozedUntil: null, updatedAt: new Date(),
    };
    if (existing) {
      await cycleDecision(tx, existing, "canceled", null, "Plan changed by owner");
      const [plan] = await tx.update(keepInTouchPlans).set({ ...fields, cycleNumber: existing.cycleNumber + 1, revision: existing.revision + 1 })
        .where(and(eq(keepInTouchPlans.id, existing.id), eq(keepInTouchPlans.userId, userId))).returning();
      return plan;
    }
    const [plan] = await tx.insert(keepInTouchPlans).values({ ...fields, userId, personId }).returning();
    return plan;
  });
}

export async function actOnPlan(userId: string, personId: string, raw: z.input<typeof planActionInput>) {
  z.string().uuid().parse(personId);
  const input = planActionInput.parse(raw);
  return db.transaction(async (tx) => {
    await lockPeople(tx, userId, [personId]);
    const [plan] = await tx.select().from(keepInTouchPlans)
      .where(and(eq(keepInTouchPlans.userId, userId), eq(keepInTouchPlans.personId, personId))).for("update");
    if (!plan) throw new NetworkError(404, "Plan not found");
    if (plan.revision !== input.revision) throw new NetworkError(409, "This plan changed. Refresh and try again");
    const today = todayInTimezone(plan.timezone);
    const fields: Partial<typeof keepInTouchPlans.$inferInsert> = { revision: plan.revision + 1, updatedAt: new Date() };
    if (input.action === "snooze") {
      if (input.until <= today || input.until <= plan.nextDueOn) throw new NetworkError(400, "Snooze until after today and the current due date");
      fields.snoozedUntil = input.until;
    } else if (input.action === "skip") {
      await cycleDecision(tx, plan, "skipped", null, "Skipped by owner; no contact occurred");
      fields.nextDueOn = nextOccurrenceAfter(plan.anchorOn, { count: plan.intervalCount, unit: plan.intervalUnit }, today > plan.nextDueOn ? today : plan.nextDueOn);
      fields.snoozedUntil = null;
      fields.cycleNumber = plan.cycleNumber + 1;
    } else if (input.action === "pause") {
      fields.status = "paused";
    } else {
      await cycleDecision(tx, plan, "canceled", null, "Plan resumed with reviewed date");
      fields.cycleNumber = plan.cycleNumber + 1;
      fields.status = "active"; fields.nextDueOn = input.nextDueOn; fields.anchorOn = input.nextDueOn; fields.snoozedUntil = null;
    }
    const [updated] = await tx.update(keepInTouchPlans).set(fields)
      .where(and(eq(keepInTouchPlans.id, plan.id), eq(keepInTouchPlans.userId, userId))).returning();
    return updated;
  });
}
