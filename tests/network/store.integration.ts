import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { eq, and } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, closeDatabase } from "../../src/db";
import { checkIns, circleMembers, interactions, keepInTouchPlans, people, user } from "../../src/db/schema";
import { actOnPlan, createCircle, createPerson, NetworkError, recordInteraction, savePlan, setCircleMembership } from "../../src/lib/network/store";

// Never fall back to DATABASE_URL: the environment may contain production credentials.
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error("Set TEST_DATABASE_URL to a disposable local database");
const parsed = new URL(testUrl);
if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || !parsed.pathname.endsWith("_test")) {
  throw new Error("Integration tests require a local database ending in _test");
}
process.env.DATABASE_URL = testUrl;
const owner = `test-owner-${randomUUID()}`;
const stranger = `test-stranger-${randomUUID()}`;
const notFound = (error: unknown) => error instanceof NetworkError && error.status === 404;
const conflict = (error: unknown) => error instanceof NetworkError && error.status === 409;
before(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(user).values([
    { id: owner, name: "Test owner", email: `${owner}@example.test`, emailVerified: true },
    { id: stranger, name: "Test stranger", email: `${stranger}@example.test`, emailVerified: true },
  ]);
});
after(async () => {
  // check-ins reference interactions; remove the derived plans first for explicit cleanup.
  await db.delete(keepInTouchPlans).where(eq(keepInTouchPlans.userId, owner));
  await db.delete(user).where(eq(user.id, owner));
  await db.delete(user).where(eq(user.id, stranger));
  await closeDatabase();
});

test("name-only people are distinct and circle ownership is enforced even by the database", async () => {
  const circle = await createCircle(owner, { name: `Test cohort ${randomUUID()}`, kind: "cohort" });
  const a = await createPerson(owner, { name: "Same name", circleIds: [circle.id] });
  const b = await createPerson(owner, { name: "Same name" });
  assert.equal(a.primaryEmail, null); assert.notEqual(a.id, b.id);
  const foreign = await createPerson(stranger, { name: "Foreign owner" });
  await assert.rejects(() => setCircleMembership(owner, circle.id, foreign.id, true), notFound);
  await assert.rejects(() => createPerson(stranger, { name: "Rejected", circleIds: [circle.id] }), notFound);
  await assert.rejects(() => db.insert(circleMembers).values({ userId: owner, circleId: circle.id, personId: foreign.id }));
});

test("recording contact is atomic, retry-safe, and never confused with creating a plan", async () => {
  const person = await createPerson(owner, { name: "Mentor fixture", relationshipType: "mentor" });
  const plan = await savePlan(owner, person.id, { nextDueOn: "2026-09-05" });
  assert.equal(plan.lastContactOn, null);
  const input = { requestKey: randomUUID(), personIds: [person.id], body: "Test conversation", channel: "email" as const,
    direction: "outbound" as const, datePrecision: "day" as const, occurredOn: "2026-09-05", qualifiesForCadence: true };
  const [first, retry] = await Promise.all([recordInteraction(owner, input), recordInteraction(owner, input)]);
  assert.equal(first.id, retry.id);
  const [updated] = await db.select().from(keepInTouchPlans).where(eq(keepInTouchPlans.id, plan.id));
  assert.equal(updated.lastContactOn, "2026-09-05"); assert.equal(updated.nextDueOn, "2026-12-05");
  assert.equal(updated.revision, 2);
  assert.equal((await db.select().from(checkIns).where(eq(checkIns.planId, plan.id))).length, 1);
  await assert.rejects(() => recordInteraction(owner, { ...input, body: "Changed replay" }), conflict);
  await assert.rejects(() => savePlan(owner, person.id, { nextDueOn: "2027-01-01", revision: 1 }), conflict);
});

test("ambiguous and historical dates preserve context without advancing cadence", async () => {
  const person = await createPerson(owner, { name: "Date fixture" });
  await savePlan(owner, person.id, { nextDueOn: "2026-09-05" });
  const base = { personIds: [person.id], body: "Test context", channel: "in_person" as const, qualifiesForCadence: true };
  await recordInteraction(owner, { ...base, requestKey: randomUUID(), datePrecision: "day", occurredOn: "2026-06-20" });
  await recordInteraction(owner, { ...base, requestKey: randomUUID(), datePrecision: "day", occurredOn: "2026-01-10" });
  await recordInteraction(owner, { ...base, requestKey: randomUUID(), datePrecision: "month", datePhrase: "Sometime in August" });
  const [plan] = await db.select().from(keepInTouchPlans).where(eq(keepInTouchPlans.personId, person.id));
  assert.equal(plan.lastContactOn, "2026-06-20"); assert.equal(plan.nextDueOn, "2026-09-20");
});

test("foreign and archived people cannot be mutated or partially linked", async () => {
  const mine = await createPerson(owner, { name: "Mine" });
  const foreign = await createPerson(stranger, { name: "Theirs" });
  await assert.rejects(() => savePlan(owner, foreign.id, { nextDueOn: "2026-09-05" }), notFound);
  const requestKey = randomUUID();
  await assert.rejects(() => recordInteraction(owner, {
    requestKey, personIds: [mine.id, foreign.id], body: "Invalid mixed owners", channel: "call",
  }), notFound);
  assert.equal((await db.select().from(interactions).where(and(eq(interactions.userId, owner), eq(interactions.requestKey, requestKey)))).length, 0);
  await db.update(people).set({ archivedAt: new Date(), reviewStatus: "archived" }).where(eq(people.id, mine.id));
  await assert.rejects(() => savePlan(owner, mine.id, { nextDueOn: "2026-09-05" }), notFound);
});

test("snooze and pause do not invent contact; actual contact replaces a snoozed cycle", async () => {
  const person = await createPerson(owner, { name: "Snooze fixture" });
  const plan = await savePlan(owner, person.id, { nextDueOn: "2026-05-01" });
  const snoozed = await actOnPlan(owner, person.id, { action: "snooze", revision: plan.revision, until: "2099-01-01" });
  assert.equal(snoozed.lastContactOn, null); assert.equal(snoozed.cycleNumber, plan.cycleNumber);
  await recordInteraction(owner, { requestKey: randomUUID(), personIds: [person.id], body: "A recent conversation",
    channel: "call", datePrecision: "day", occurredOn: "2026-08-20", qualifiesForCadence: true });
  const [updated] = await db.select().from(keepInTouchPlans).where(eq(keepInTouchPlans.id, plan.id));
  assert.equal(updated.snoozedUntil, null); assert.equal(updated.nextDueOn, "2026-11-20");
  const paused = await actOnPlan(owner, person.id, { action: "pause", revision: updated.revision });
  assert.equal(paused.status, "paused"); assert.equal(paused.lastContactOn, "2026-08-20");
  const skipped = await actOnPlan(owner, person.id, { action: "skip", revision: paused.revision });
  assert.equal(skipped.lastContactOn, "2026-08-20"); assert.equal(skipped.status, "paused");
});
