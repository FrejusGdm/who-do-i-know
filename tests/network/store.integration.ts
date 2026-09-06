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

test("real signed sessions reject tampering, expiration, and unauthorized session creation", async () => {
  const secret = `test-only-${randomUUID()}-${randomUUID()}`;
  process.env.BETTER_AUTH_SECRET = secret;
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.PRIVATE_USER_EMAILS = `${owner}@example.test`;
  const { auth } = await import("../../src/lib/auth");
  const { makeSignature } = await import("better-auth/crypto");
  const { session: sessionTable } = await import("../../src/db/schema");
  const context = await auth.$context;
  const valid = await context.internalAdapter.createSession(owner);
  assert.ok(valid);
  assert.equal(await context.internalAdapter.createSession(stranger), null);
  assert.equal(await context.internalAdapter.createUser({ name: "Denied fixture", email: "uninvited@example.test", emailVerified: true }), null);
  const signature = await makeSignature(valid.token, secret);
  const cookie = `better-auth.session_token=${encodeURIComponent(`${valid.token}.${signature}`)}`;
  const read = (value: string) => auth.api.getSession({ headers: new Headers({ cookie: value }) });
  assert.equal((await read(cookie))?.user.id, owner);
  assert.equal(await read(`${cookie}tampered`), null);
  assert.equal(await read("better-auth.session_token=made-up"), null);
  await db.update(sessionTable).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(sessionTable.id, valid.id));
  assert.equal(await read(cookie), null);
  await db.update(user).set({ emailVerified: false }).where(eq(user.id, owner));
  assert.equal(await context.internalAdapter.createSession(owner), null);
  await db.update(user).set({ emailVerified: true }).where(eq(user.id, owner));
});

test("search is owner-scoped, paginated and treats wildcard characters literally", async () => {
  const { networkPeople, networkPerson } = await import('../../src/lib/network/queries');
  const mine = await createPerson(owner, { name: 'Search fixture 100%_literal' });
  const foreign = await createPerson(stranger, { name: 'Search foreign fixture' });
  await db.update(people).set({ manualNotes: 'unique-foreign-note-needle' }).where(eq(people.id, foreign.id));
  assert.equal((await networkPeople(owner, { q: 'unique-foreign-note-needle' })).total, 0);
  assert.equal((await networkPeople(owner, { q: '%_literal' })).people[0]?.id, mine.id);
  await assert.rejects(() => networkPerson(owner, foreign.id), notFound);
  await assert.rejects(() => networkPerson(owner, 'not-a-uuid'), notFound);
  await db.insert(people).values(Array.from({ length: 51 }, (_, index) => ({ userId: owner, name: `Pagination fixture ${String(index).padStart(2, '0')}`, source: 'test' })));
  const first = await networkPeople(owner, { q: 'Pagination fixture' });
  const second = await networkPeople(owner, { q: 'Pagination fixture', page: '2' });
  assert.equal(first.total, 51); assert.equal(first.people.length, 50); assert.equal(first.hasMore, true);
  assert.equal(second.people.length, 1); assert.equal(second.hasMore, false);
  assert.notEqual(first.people[0].id, second.people[0].id);
});


test("an unanswered outgoing message is distinct from meeting or a mutual exchange", async () => {
  const { networkPerson } = await import('../../src/lib/network/queries');
  const person = await createPerson(owner, { name: 'Outgoing fixture', metState: 'not_met' });
  await recordInteraction(owner, { requestKey: randomUUID(), personIds: [person.id], body: 'Outgoing test message', channel: 'email', direction: 'outbound', datePrecision: 'day', occurredOn: '2026-09-05', qualifiesForCadence: true });
  const record = await networkPerson(owner, person.id);
  assert.equal(record.person.metState, 'not_met');
  assert.equal(record.person.lastOutboundOn, '2026-09-05');
  assert.equal(record.person.lastMutualOn, null);
});

// Interview integration fixtures are deliberately synthetic; no owner stories belong in tests.
async function interviewFixture(personIds: string[] = [], content = 'Alex enjoys climbing. Sam is applying to graduate school. We talked on September 5.') {
  const { createInterview, appendInterviewTurn } = await import('../../src/lib/network/interviews');
  const interview = await createInterview(owner, { requestKey: randomUUID(), personIds });
  const saved = await appendInterviewTurn(owner, interview.id, { requestKey: randomUUID(), revision: interview.revision, content });
  const source = { turnId: saved.turn.id, revision: 1, start: 0, end: saved.turn.content.length, quote: saved.turn.content };
  return { interview: saved.interview, turn: saved.turn, source };
}

test('interviews and turns are persistent, owner-scoped, revision-guarded and replay-safe', async () => {
  const { createInterview, appendInterviewTurn, getInterview, changeInterviewStatus } = await import('../../src/lib/network/interviews');
  const request = { requestKey: randomUUID(), title: 'Interview fixture' };
  const [first, retry] = await Promise.all([createInterview(owner, request), createInterview(owner, request)]);
  assert.equal(first.id, retry.id);
  await assert.rejects(() => createInterview(owner, { ...request, title: 'Changed replay' }), conflict);
  await assert.rejects(() => getInterview(stranger, first.id), notFound);
  const input = { requestKey: randomUUID(), revision: first.revision, content: 'Private synthetic recollection' };
  const [a, b] = await Promise.all([appendInterviewTurn(owner, first.id, input), appendInterviewTurn(owner, first.id, input)]);
  assert.equal(a.turn.id, b.turn.id);
  assert.equal((await getInterview(owner, first.id)).turns.length, 1);
  await assert.rejects(() => appendInterviewTurn(owner, first.id, { ...input, requestKey: randomUUID() }), conflict);
  const paused = await changeInterviewStatus(owner, first.id, { revision: a.interview.revision, status: 'paused' });
  await assert.rejects(() => appendInterviewTurn(owner, first.id, { requestKey: randomUUID(), revision: paused.revision, content: 'Not saved while paused' }), conflict);
  const resumed = await changeInterviewStatus(owner, first.id, { revision: paused.revision, status: 'active' });
  await appendInterviewTurn(owner, first.id, { requestKey: randomUUID(), revision: resumed.revision, content: 'Continued fixture' });
  assert.equal((await getInterview(owner, first.id)).turns.length, 2);
});

test('review creates one group event with separate private notes and atomic retry-safe acceptance', async () => {
  const { publishInterviewGeneration, reviewMemoryProposal } = await import('../../src/lib/network/interviews');
  const { interactionParticipants, notes: noteTable } = await import('../../src/db/schema');
  const alex = await createPerson(owner, { name: 'Alex interview fixture' });
  const sam = await createPerson(owner, { name: 'Sam interview fixture' });
  const { interview, source } = await interviewFixture([alex.id, sam.id]);
  const generation = { generationKey: randomUUID(), sourceRevision: interview.revision, assistant: 'What would you like to follow up on?', proposals: [
    { payload: { kind: 'note' as const, personId: alex.id, body: 'Enjoys climbing', shareInDrafts: true }, sources: [{ ...source, end: 21, quote: 'Alex enjoys climbing.' }] },
    { payload: { kind: 'note' as const, personId: sam.id, body: 'Applying to graduate school' }, sources: [source] },
    { payload: { kind: 'interaction' as const, values: { requestKey: randomUUID(), personIds: [alex.id, sam.id], body: 'A shared conversation', channel: 'in_person' as const, datePrecision: 'day' as const, occurredOn: '2026-09-05', qualifiesForCadence: true } }, sources: [source] },
  ] };
  const result = await publishInterviewGeneration(owner, interview.id, generation);
  const replay = await publishInterviewGeneration(owner, interview.id, generation);
  assert.equal(result.assistant.id, replay.assistant.id); assert.equal(replay.proposals.length, 3);
  assert.equal(result.proposals[0].payload.kind === 'note' && result.proposals[0].payload.shareInDrafts, false);
  const command = { revision: result.proposals[0].revision, action: 'accept' as const };
  const [a, b] = await Promise.all([reviewMemoryProposal(owner, interview.id, result.proposals[0].id, command), reviewMemoryProposal(owner, interview.id, result.proposals[0].id, command)]);
  assert.equal(a.acceptedRef?.id, b.acceptedRef?.id);
  await reviewMemoryProposal(owner, interview.id, result.proposals[1].id, { revision: 1, action: 'accept' });
  const acceptedEvent = await reviewMemoryProposal(owner, interview.id, result.proposals[2].id, { revision: 1, action: 'accept' });
  const links = await db.select().from(interactionParticipants).where(eq(interactionParticipants.interactionId, acceptedEvent.acceptedRef!.id));
  assert.equal(links.length, 2);
  const alexNotes = await db.select().from(noteTable).where(eq(noteTable.personId, alex.id));
  assert.equal(alexNotes.length, 1); assert.equal(alexNotes[0].body, 'Enjoys climbing');
  await assert.rejects(() => reviewMemoryProposal(stranger, interview.id, result.proposals[0].id, command), notFound);
  await assert.rejects(() => reviewMemoryProposal(owner, interview.id, result.proposals[0].id, { ...command, action: 'reject' }), conflict);
});

test('unsupported sources and late model results cannot create proposals or assistant turns', async () => {
  const { publishInterviewGeneration, appendInterviewTurn, getInterview } = await import('../../src/lib/network/interviews');
  const { interview, source } = await interviewFixture();
  const input = { generationKey: randomUUID(), sourceRevision: interview.revision, assistant: 'A fixture question?', proposals: [{ payload: { kind: 'note' as const, body: 'A suggested note' }, sources: [{ ...source, quote: 'An invented quote' }] }] };
  await assert.rejects(() => publishInterviewGeneration(owner, interview.id, input));
  assert.equal((await getInterview(owner, interview.id)).turns.length, 1);
  await appendInterviewTurn(owner, interview.id, { requestKey: randomUUID(), revision: interview.revision, content: 'New context arrived' });
  await assert.rejects(() => publishInterviewGeneration(owner, interview.id, { ...input, proposals: [{ payload: { kind: 'note', body: 'A suggested note' }, sources: [source] }] }), conflict);
  assert.equal((await getInterview(owner, interview.id)).proposals.length, 0);
});

test('unresolved identities, changed sources and foreign destinations block acceptance without partial writes', async () => {
  const { publishInterviewGeneration, reviewMemoryProposal, getInterview } = await import('../../src/lib/network/interviews');
  const { interviewTurns } = await import('../../src/db/schema');
  const person = await createPerson(owner, { name: 'Resolved fixture' });
  const foreign = await createPerson(stranger, { name: 'Foreign destination fixture' });
  const { interview, turn, source } = await interviewFixture();
  const { proposals } = await publishInterviewGeneration(owner, interview.id, { generationKey: randomUUID(), sourceRevision: interview.revision, assistant: 'Which Alex do you mean?', proposals: [{ payload: { kind: 'note', body: 'Enjoys climbing' }, identityHints: ['Alex'], sources: [source] }] });
  const proposal = proposals[0]; assert.equal(proposal.unresolvedIdentity, true);
  await assert.rejects(() => reviewMemoryProposal(owner, interview.id, proposal.id, { revision: 1, action: 'accept' }), conflict);
  await assert.rejects(() => reviewMemoryProposal(owner, interview.id, proposal.id, { revision: 1, action: 'accept', identityConfirmed: true, payload: { kind: 'note', personId: foreign.id, body: 'Enjoys climbing' } }), notFound);
  await db.update(interviewTurns).set({ revision: 2, content: 'Corrected fixture' }).where(eq(interviewTurns.id, turn.id));
  await assert.rejects(() => reviewMemoryProposal(owner, interview.id, proposal.id, { revision: 1, action: 'accept', identityConfirmed: true, payload: { kind: 'note', personId: person.id, body: 'Enjoys climbing' } }), conflict);
  assert.equal((await getInterview(owner, interview.id)).proposals[0].status, 'pending');
});

test('each supported memory type materializes only after individual review and retains its provenance', async () => {
  const { publishInterviewGeneration, reviewMemoryProposal, getInterview, changeInterviewStatus } = await import('../../src/lib/network/interviews');
  const { confirmedFacts, openLoops, personalUpdates, interviewPeople } = await import('../../src/db/schema');
  const person = await createPerson(owner, { name: 'Memory types fixture' });
  const circle = await createCircle(owner, { name: `Memory circle ${randomUUID()}` });
  const { interview, source } = await interviewFixture([person.id], 'I met Taylor through this circle. Taylor enjoys climbing. Remind me to share a paper on September 12, then check in every three months. I started a new course.');
  const { proposals } = await publishInterviewGeneration(owner, interview.id, {
    generationKey: randomUUID(), sourceRevision: interview.revision, assistant: 'Which of these memories would you like to keep?',
    proposals: [
      { payload: { kind: 'new_person', values: { name: 'Taylor new person fixture' } }, sources: [source] },
      { payload: { kind: 'profile_fact', personId: person.id, label: 'Interest', body: 'Climbing' }, sources: [source] },
      { payload: { kind: 'plan', personId: person.id, values: { nextDueOn: '2026-12-05' } }, sources: [source] },
      { payload: { kind: 'circle_membership', personId: person.id, circleId: circle.id }, sources: [source] },
      { payload: { kind: 'open_loop', personId: person.id, body: 'Share a paper', dueOn: '2026-09-12' }, sources: [source] },
      { payload: { kind: 'personal_update', title: 'A new course', body: 'Started a course', allowedPersonIds: [person.id] }, sources: [source] },
    ],
  });
  assert.equal((await db.select().from(confirmedFacts).where(eq(confirmedFacts.personId, person.id))).length, 0);
  assert.equal((await db.select().from(keepInTouchPlans).where(eq(keepInTouchPlans.personId, person.id))).length, 0);
  const beforeReview = await getInterview(owner, interview.id);
  await assert.rejects(() => changeInterviewStatus(owner, interview.id, { revision: beforeReview.interview.revision, status: 'completed' }), conflict);
  for (const proposal of proposals) {
    const accepted = await reviewMemoryProposal(owner, interview.id, proposal.id, { revision: 1, action: 'accept' });
    const retry = await reviewMemoryProposal(owner, interview.id, proposal.id, { revision: 1, action: 'accept' });
    assert.deepEqual(accepted.acceptedRef, retry.acceptedRef);
    assert.equal(accepted.status, 'accepted');
    assert.deepEqual(accepted.sources, [source]);
  }
  const [fact] = await db.select().from(confirmedFacts).where(eq(confirmedFacts.personId, person.id));
  assert.equal(fact.proposalId, proposals[1].id); assert.equal(fact.shareInDrafts, false);
  const [plan] = await db.select().from(keepInTouchPlans).where(eq(keepInTouchPlans.personId, person.id));
  assert.equal(plan.intervalUnit, 'months'); assert.equal(plan.intervalCount, 3); assert.equal(plan.lastContactOn, null);
  const [membership] = await db.select().from(circleMembers).where(and(eq(circleMembers.circleId, circle.id), eq(circleMembers.personId, person.id)));
  assert.ok(membership);
  const [loop] = await db.select().from(openLoops).where(eq(openLoops.proposalId, proposals[4].id));
  assert.equal(loop.dueOn, '2026-09-12'); assert.equal(loop.status, 'open');
  const [update] = await db.select().from(personalUpdates).where(eq(personalUpdates.proposalId, proposals[5].id));
  assert.deepEqual(update.allowedPersonIds, []); assert.deepEqual(update.allowedCircleIds, []);
  const links = await db.select().from(interviewPeople).where(eq(interviewPeople.interviewId, interview.id));
  assert.equal(links.length, 2);
  const current = await getInterview(owner, interview.id);
  const completed = await changeInterviewStatus(owner, interview.id, { revision: current.interview.revision, status: 'completed' });
  assert.equal(completed.status, 'completed');
  const { networkPerson, networkPeople } = await import('../../src/lib/network/queries');
  const profile = await networkPerson(owner, person.id);
  assert.equal(profile.facts[0].sourceInterviewId, interview.id);
  assert.equal(profile.facts[0].body, 'Climbing');
  assert.ok((await networkPeople(owner, { q: 'Climbing' })).people.some((row) => row.id === person.id));
  await db.update(confirmedFacts).set({ status: 'stale' }).where(eq(confirmedFacts.id, fact.id));
  assert.equal((await networkPerson(owner, person.id)).facts.length, 0);
  assert.equal((await networkPeople(owner, { q: 'Climbing' })).people.some((row) => row.id === person.id), false);
});

test('stale plan edits and foreign circles roll back review; sensitive context cannot be shared', async () => {
  const { publishInterviewGeneration, reviewMemoryProposal, getInterview } = await import('../../src/lib/network/interviews');
  const { confirmedFacts, personalUpdates } = await import('../../src/db/schema');
  const person = await createPerson(owner, { name: 'Atomic review fixture' });
  const plan = await savePlan(owner, person.id, { nextDueOn: '2026-09-05' });
  const foreignCircle = await createCircle(stranger, { name: `Foreign circle ${randomUUID()}` });
  const { interview, source } = await interviewFixture([person.id]);
  const { proposals } = await publishInterviewGeneration(owner, interview.id, {
    generationKey: randomUUID(), sourceRevision: interview.revision, assistant: 'Review these details?',
    proposals: [
      { payload: { kind: 'plan', personId: person.id, values: { nextDueOn: '2026-12-05', revision: plan.revision } }, sources: [source] },
      { payload: { kind: 'profile_fact', personId: person.id, label: 'Interest', body: 'Climbing' }, sources: [source] },
      { payload: { kind: 'personal_update', title: 'A course', body: 'Started a course' }, sources: [source] },
    ],
  });
  await savePlan(owner, person.id, { nextDueOn: '2027-01-10', revision: plan.revision });
  await assert.rejects(() => reviewMemoryProposal(owner, interview.id, proposals[0].id, { revision: 1, action: 'accept' }), conflict);
  const [unchanged] = await db.select().from(keepInTouchPlans).where(eq(keepInTouchPlans.id, plan.id));
  assert.equal(unchanged.nextDueOn, '2027-01-10'); assert.equal(unchanged.revision, 2);
  await assert.rejects(() => reviewMemoryProposal(owner, interview.id, proposals[1].id, {
    revision: 1, action: 'accept', payload: { kind: 'profile_fact', personId: person.id, label: 'Interest', body: 'Climbing', shareInDrafts: true },
  }), (error: unknown) => error instanceof NetworkError && error.status === 400);
  assert.equal((await db.select().from(confirmedFacts).where(eq(confirmedFacts.proposalId, proposals[1].id))).length, 0);
  await assert.rejects(() => reviewMemoryProposal(owner, interview.id, proposals[2].id, {
    revision: 1, action: 'accept', sensitive: false,
    payload: { kind: 'personal_update', title: 'A course', body: 'Started a course', allowedCircleIds: [foreignCircle.id] },
  }), notFound);
  assert.equal((await db.select().from(personalUpdates).where(eq(personalUpdates.proposalId, proposals[2].id))).length, 0);
  assert.ok((await getInterview(owner, interview.id)).proposals.every((proposal) => proposal.status === 'pending' && proposal.acceptedRef === null));
  const rejected = await reviewMemoryProposal(owner, interview.id, proposals[0].id, { revision: 1, action: 'reject' });
  assert.equal(rejected.status, 'rejected');
  assert.equal((await reviewMemoryProposal(owner, interview.id, proposals[0].id, { revision: 1, action: 'reject' })).revision, rejected.revision);
});

async function enableInterviewAI() {
  process.env.NETWORK_INTERVIEW_MODEL = 'fixture/interviewer';
  process.env.OPENROUTER_API_KEY = 'test-only-key';
  const { interviewProviderConfig } = await import('../../src/lib/network/interview-provider');
  const { setInterviewAIConsent } = await import('../../src/lib/network/interview-jobs');
  return setInterviewAIConsent(owner, { allowed: true, configurationKey: interviewProviderConfig()!.configurationKey });
}
async function fixtureReply() {
  const { interviewOutput } = await import('../../src/lib/network/interview-provider');
  return { output: interviewOutput.parse({ assistant: 'What would you like to remember next?', proposals: [] }), inputTokens: 10, outputTokens: 8 };
}

test('AI consent is configuration-bound and concurrent workers claim one retry-safe request per owner', async () => {
  const { queueInterview, claimInterviewJob, finishInterviewJob, interviewAIStatus, setInterviewAIConsent, interviewJobContext } = await import('../../src/lib/network/interview-jobs');
  const { interview, source } = await interviewFixture();
  await assert.rejects(() => queueInterview(owner, interview.id, { requestKey: randomUUID(), revision: interview.revision }), conflict);
  const status = await enableInterviewAI(); assert.equal(status.allowed, true);
  await assert.rejects(() => setInterviewAIConsent(owner, { allowed: true, configurationKey: 'a'.repeat(64) }), conflict);
  const command = { requestKey: randomUUID(), revision: interview.revision };
  const [first, retry] = await Promise.all([queueInterview(owner, interview.id, command), queueInterview(owner, interview.id, command)]);
  assert.equal(first!.id, retry!.id);
  const claims = await Promise.all([claimInterviewJob(owner), claimInterviewJob(owner)]);
  assert.equal(claims.filter(Boolean).length, 1);
  const claim = claims.find(Boolean)!;
  const context = await interviewJobContext(claim);
  assert.equal(context.turns[0].id, source.turnId);
  assert.equal(context.turns[0].content, source.quote);
  assert.equal(context.people.some((person) => person.name === 'Foreign destination fixture'), false);
  assert.equal(await finishInterviewJob(claim, await fixtureReply()), true);
  assert.equal(await finishInterviewJob(claim, await fixtureReply()), false);
  assert.equal((await interviewAIStatus(owner)).requestsToday, 1);
});

test('an expired worker lease can be reclaimed and a superseded worker cannot publish', async () => {
  const { aiProcessingTasks } = await import('../../src/db/schema');
  const { queueInterview, claimInterviewJob, finishInterviewJob } = await import('../../src/lib/network/interview-jobs');
  const { getInterview } = await import('../../src/lib/network/interviews');
  await enableInterviewAI();
  const { interview } = await interviewFixture();
  await queueInterview(owner, interview.id, { requestKey: randomUUID(), revision: interview.revision });
  const crashed = (await claimInterviewJob(owner))!;
  await db.update(aiProcessingTasks).set({ leaseExpiresAt: new Date(Date.now() - 1000) }).where(eq(aiProcessingTasks.id, crashed.id));
  const recovered = (await claimInterviewJob(owner))!;
  assert.notEqual(crashed.leaseToken, recovered.leaseToken); assert.equal(recovered.attempts, 2);
  assert.equal(await finishInterviewJob(crashed, await fixtureReply()), false);
  assert.equal(await finishInterviewJob(recovered, await fixtureReply()), true);
  assert.equal((await getInterview(owner, interview.id)).turns.filter((turn) => turn.role === 'assistant').length, 1);
});

test('revoking consent during inference cancels publication and never silently re-enables processing', async () => {
  const { queueInterview, runInterviewWorkerOnce, setInterviewAIConsent, interviewJob, interviewAIStatus } = await import('../../src/lib/network/interview-jobs');
  const { getInterview } = await import('../../src/lib/network/interviews');
  await enableInterviewAI(); const { interview } = await interviewFixture();
  await queueInterview(owner, interview.id, { requestKey: randomUUID(), revision: interview.revision });
  let started!: () => void; let release!: () => void;
  const begun = new Promise<void>((resolve) => { started = resolve; });
  const finish = new Promise<void>((resolve) => { release = resolve; });
  const running = runInterviewWorkerOnce({ ownerId: owner, generate: async () => { started(); await finish; return fixtureReply(); } });
  await begun;
  await setInterviewAIConsent(owner, { allowed: false, configurationKey: null });
  release(); await running;
  assert.equal((await getInterview(owner, interview.id)).turns.length, 1);
  assert.equal((await interviewJob(owner, interview.id))!.status, 'canceled');
  assert.equal((await interviewAIStatus(owner)).allowed, false);
  await assert.rejects(() => queueInterview(owner, interview.id, { requestKey: randomUUID(), revision: interview.revision }), conflict);
});

test('new words, archive and source deletion invalidate an in-flight answer, including answers without proposals', async () => {
  const { queueInterview, claimInterviewJob, finishInterviewJob, runInterviewWorkerOnce } = await import('../../src/lib/network/interview-jobs');
  const { appendInterviewTurn, getInterview } = await import('../../src/lib/network/interviews');
  const { interviews: interviewTable, aiProcessingTasks } = await import('../../src/db/schema');
  await enableInterviewAI();
  const { interview } = await interviewFixture();
  await queueInterview(owner, interview.id, { requestKey: randomUUID(), revision: interview.revision });
  const old = (await claimInterviewJob(owner))!;
  await appendInterviewTurn(owner, interview.id, { requestKey: randomUUID(), revision: interview.revision, content: 'Newer words must take precedence.' });
  assert.equal(await finishInterviewJob(old, await fixtureReply()), false);
  assert.equal((await getInterview(owner, interview.id)).turns.length, 2);
  const person = await createPerson(owner, { name: 'Archive worker fixture' });
  const archivedFixture = await interviewFixture([person.id]);
  await queueInterview(owner, archivedFixture.interview.id, { requestKey: randomUUID(), revision: archivedFixture.interview.revision });
  await runInterviewWorkerOnce({ ownerId: owner, generate: async () => {
    await db.update(people).set({ archivedAt: new Date(), reviewStatus: 'archived' }).where(eq(people.id, person.id));
    return fixtureReply();
  } });
  assert.equal((await getInterview(owner, archivedFixture.interview.id)).turns.length, 1);
  const candidate = await createPerson(owner, { name: 'Candidate Archive Fixture' });
  const candidateFixture = await interviewFixture([], 'Candidate and I discussed a shared interest.');
  await queueInterview(owner, candidateFixture.interview.id, { requestKey: randomUUID(), revision: candidateFixture.interview.revision });
  await runInterviewWorkerOnce({ ownerId: owner, generate: async (context) => {
    assert.ok(context.people.some((person) => person.id === candidate.id && !person.selected));
    await db.update(people).set({ archivedAt: new Date(), reviewStatus: 'archived' }).where(eq(people.id, candidate.id));
    return fixtureReply();
  } });
  assert.equal((await getInterview(owner, candidateFixture.interview.id)).turns.length, 1);
  const deleted = await interviewFixture();
  await queueInterview(owner, deleted.interview.id, { requestKey: randomUUID(), revision: deleted.interview.revision });
  const deletedJob = (await claimInterviewJob(owner))!;
  await db.delete(interviewTable).where(eq(interviewTable.id, deleted.interview.id));
  assert.equal(await finishInterviewJob(deletedJob, await fixtureReply()), false);
  const [canceled] = await db.select().from(aiProcessingTasks).where(eq(aiProcessingTasks.id, deletedJob.id));
  assert.equal(canceled.status, 'canceled');
});

test('provider failure is sanitized, backoff is respected and attempts are bounded', async () => {
  const { queueInterview, runInterviewWorkerOnce, interviewJob } = await import('../../src/lib/network/interview-jobs');
  const { InterviewProviderError } = await import('../../src/lib/network/interview-provider');
  const { aiProcessingTasks } = await import('../../src/db/schema');
  await enableInterviewAI(); const { interview } = await interviewFixture();
  await queueInterview(owner, interview.id, { requestKey: randomUUID(), revision: interview.revision });
  let calls = 0;
  const generate = async () => { calls++; throw new InterviewProviderError('timeout'); };
  assert.equal(await runInterviewWorkerOnce({ ownerId: owner, generate }), true);
  assert.equal(await runInterviewWorkerOnce({ ownerId: owner, generate }), false);
  for (let retry = 0; retry < 2; retry++) {
    const job = (await interviewJob(owner, interview.id))!;
    await db.update(aiProcessingTasks).set({ availableAt: new Date(Date.now() - 1000) }).where(eq(aiProcessingTasks.id, job.id));
    await runInterviewWorkerOnce({ ownerId: owner, generate });
  }
  const job = (await interviewJob(owner, interview.id))!;
  assert.equal(calls, 3); assert.equal(job.status, 'failed'); assert.equal(job.errorCategory, 'timeout');
  const [stored] = await db.select().from(aiProcessingTasks).where(eq(aiProcessingTasks.id, job.id));
  assert.equal(stored.errorMessage, null); assert.equal(stored.leaseToken, null);
});

test('daily usage remains bounded across explicit retries and changed configuration requires fresh consent', async () => {
  const { queueInterview, runInterviewWorkerOnce, interviewJob, interviewAIStatus } = await import('../../src/lib/network/interview-jobs');
  const { networkAiUsage } = await import('../../src/db/schema');
  const { INTERVIEW_LIMITS } = await import('../../src/lib/network/interview-provider');
  await enableInterviewAI(); const { interview } = await interviewFixture();
  process.env.NETWORK_INTERVIEW_MODEL = 'fixture/changed';
  assert.equal((await interviewAIStatus(owner)).allowed, false);
  await assert.rejects(() => queueInterview(owner, interview.id, { requestKey: randomUUID(), revision: interview.revision }), conflict);
  await enableInterviewAI();
  await db.update(networkAiUsage).set({ requests: INTERVIEW_LIMITS.dailyRequests }).where(and(eq(networkAiUsage.userId, owner), eq(networkAiUsage.day, new Date().toISOString().slice(0, 10))));
  let calls = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    await queueInterview(owner, interview.id, { requestKey: randomUUID(), revision: interview.revision });
    await runInterviewWorkerOnce({ ownerId: owner, generate: async () => { calls++; return fixtureReply(); } });
    assert.equal((await interviewJob(owner, interview.id))!.errorCategory, 'daily_limit');
  }
  assert.equal(calls, 0); assert.equal((await interviewAIStatus(owner)).requestsToday, INTERVIEW_LIMITS.dailyRequests);
});

test('interview drafts persist exact words, reject foreign and stale writes, and replay uncertain acknowledgments', async () => {
  const { createInterview, saveInterviewDraft, getInterview, listInterviews, changeInterviewStatus } = await import('../../src/lib/network/interviews');
  const interview = await createInterview(owner, { requestKey: randomUUID() });
  const input = { requestKey: randomUUID(), revision: 1, content: '  Unfinished draft\nwith uncertainty.  ' };
  await assert.rejects(() => saveInterviewDraft(stranger, interview.id, input), notFound);
  const saved = await saveInterviewDraft(owner, interview.id, input);
  assert.deepEqual(await saveInterviewDraft(owner, interview.id, input), saved);
  assert.equal(saved.content, input.content); assert.equal(saved.revision, 2);
  const record = await getInterview(owner, interview.id);
  assert.equal(record.interview.revision, 1); assert.equal(record.turns.length, 0); assert.equal(record.proposals.length, 0);
  assert.equal(record.interview.draftContent, input.content);
  assert.equal('draftContent' in (await listInterviews(owner))[0], false);
  await assert.rejects(() => saveInterviewDraft(owner, interview.id, { ...input, content: 'Different retry' }), conflict);
  const updates = await Promise.allSettled(['First tab', 'Second tab'].map((content) => saveInterviewDraft(owner, interview.id, { requestKey: randomUUID(), revision: 2, content })));
  assert.equal(updates.filter((value) => value.status === 'fulfilled').length, 1);
  await assert.rejects(() => saveInterviewDraft(owner, interview.id, input), conflict);
  await assert.rejects(() => changeInterviewStatus(owner, interview.id, { revision: 1, status: 'completed' }), conflict);
  await changeInterviewStatus(owner, interview.id, { revision: 1, status: 'paused' });
  await assert.rejects(() => saveInterviewDraft(owner, interview.id, { requestKey: randomUUID(), revision: 3, content: 'Late paused write' }), conflict);
});

test('submitting a draft atomically clears it and delayed autosaves or repeated submissions cannot restore it', async () => {
  const { createInterview, saveInterviewDraft, appendInterviewTurn, getInterview } = await import('../../src/lib/network/interviews');
  const interview = await createInterview(owner, { requestKey: randomUUID() });
  const input = { requestKey: randomUUID(), revision: 1, content: '  A submitted recollection.  ' };
  const draft = await saveInterviewDraft(owner, interview.id, input);
  await assert.rejects(() => appendInterviewTurn(owner, interview.id, { requestKey: randomUUID(), revision: 1, draftRevision: 1, content: draft.content }), conflict);
  await assert.rejects(() => appendInterviewTurn(owner, interview.id, { requestKey: randomUUID(), revision: 1, draftRevision: 2, content: 'Mismatched words' }), conflict);
  const submit = { requestKey: randomUUID(), revision: 1, draftRevision: draft.revision, content: draft.content };
  const result = await appendInterviewTurn(owner, interview.id, submit);
  assert.equal(result.interview.draftContent, ''); assert.equal(result.interview.draftRevision, 3);
  assert.equal((await appendInterviewTurn(owner, interview.id, submit)).turn.id, result.turn.id);
  await assert.rejects(() => saveInterviewDraft(owner, interview.id, input), conflict);
  await assert.rejects(() => saveInterviewDraft(owner, interview.id, { ...input, requestKey: randomUUID(), revision: 2 }), conflict);
  await saveInterviewDraft(owner, interview.id, { requestKey: randomUUID(), revision: 3, content: 'Next draft' });
  await appendInterviewTurn(owner, interview.id, submit);
  const record = await getInterview(owner, interview.id);
  assert.equal(record.turns.length, 1); assert.equal(record.interview.draftContent, 'Next draft');
});

test('unsubmitted drafts never enter interview model context or create generation work', async () => {
  const { createInterview, saveInterviewDraft, getInterview } = await import('../../src/lib/network/interviews');
  const { queueInterview, claimInterviewJob, interviewJobContext, interviewJob } = await import('../../src/lib/network/interview-jobs');
  await enableInterviewAI();
  const { networkAiUsage } = await import('../../src/db/schema');
  await db.delete(networkAiUsage).where(eq(networkAiUsage.userId, owner));
  const interview = await createInterview(owner, { requestKey: randomUUID() });
  await saveInterviewDraft(owner, interview.id, { requestKey: randomUUID(), revision: 1, content: 'draft-only-private-needle' });
  assert.equal(await interviewJob(owner, interview.id), null);
  await queueInterview(owner, interview.id, { requestKey: randomUUID(), revision: 1 });
  const job = await claimInterviewJob(owner); assert.ok(job);
  assert.equal(JSON.stringify(await interviewJobContext(job)).includes('draft-only-private-needle'), false);
  assert.equal((await getInterview(owner, interview.id)).turns.length, 0);
});

async function legacyFixture() {
  const { aiProcessingTasks } = await import('../../src/db/schema');
  const { inArray } = await import('drizzle-orm');
  const { LEGACY_TASK_TYPES } = await import('../../src/lib/network/legacy-ai-jobs');
  await db.delete(aiProcessingTasks).where(and(eq(aiProcessingTasks.userId, owner), inArray(aiProcessingTasks.taskType, [...LEGACY_TASK_TYPES])));
  process.env.PRIVATE_USER_EMAILS = `${owner}@example.test`;
  return createPerson(owner, { name: 'Legacy worker fixture' });
}

test('legacy leases claim once, recover after expiry, and atomically publish output with completion', async () => {
  const person = await legacyFixture();
  const { enqueueAITask } = await import('../../src/lib/ai-task-processor');
  const { claimLegacyJob, publishLegacyJob } = await import('../../src/lib/network/legacy-ai-jobs');
  const { aiProcessingTasks, aiPersonSummaries } = await import('../../src/db/schema');
  await enqueueAITask({ userId: owner, taskType: 'person_summarizer', targetType: 'person', targetId: person.id });
  const claims = await Promise.all([claimLegacyJob(owner, 'fixture/model'), claimLegacyJob(owner, 'fixture/model')]);
  const first = claims.find(Boolean)!; assert.ok(first); assert.equal(claims.filter(Boolean).length, 1);
  await db.update(aiProcessingTasks).set({ leaseExpiresAt: new Date(0) }).where(eq(aiProcessingTasks.id, first.id));
  const recovered = await claimLegacyJob(owner, 'fixture/model'); assert.ok(recovered); assert.notEqual(first.leaseToken, recovered.leaseToken);
  let staleWrites = 0;
  assert.equal(await publishLegacyJob(first, async () => { staleWrites++; }), false); assert.equal(staleWrites, 0);
  await assert.rejects(() => publishLegacyJob(recovered, async (tx) => {
    await tx.insert(aiPersonSummaries).values({ personId: person.id, summary: 'Must roll back' });
    throw new Error('Fixture rollback');
  }));
  assert.equal((await db.select().from(aiPersonSummaries).where(eq(aiPersonSummaries.personId, person.id))).length, 0);
  assert.equal(await publishLegacyJob(recovered, async (tx) => { await tx.insert(aiPersonSummaries).values({ personId: person.id, summary: 'One verified fixture summary' }); }), true);
  assert.equal(await publishLegacyJob(recovered, async () => { staleWrites++; }), false);
  assert.equal((await db.select().from(aiPersonSummaries).where(eq(aiPersonSummaries.personId, person.id))).length, 1);
  assert.equal((await db.select().from(aiProcessingTasks).where(eq(aiProcessingTasks.id, first.id)))[0].status, 'complete');
});

test('legacy publication rejects changed or deleted source notes, archived people and foreign targets', async () => {
  const { enqueueAITask } = await import('../../src/lib/ai-task-processor');
  const { claimLegacyJob, publishLegacyJob } = await import('../../src/lib/network/legacy-ai-jobs');
  const { notes } = await import('../../src/db/schema');
  for (const change of ['edit', 'delete', 'archive', 'decision']) {
    const person = await legacyFixture();
    const [note] = await db.insert(notes).values({ userId: owner, personId: person.id, body: 'Source fixture before change' }).returning();
    await enqueueAITask({ userId: owner, taskType: 'person_summarizer', targetType: 'person', targetId: person.id });
    const job = await claimLegacyJob(owner, 'fixture/model'); assert.ok(job);
    if (change === 'edit') await db.update(notes).set({ body: 'Corrected source' }).where(eq(notes.id, note.id));
    if (change === 'delete') await db.delete(notes).where(eq(notes.id, note.id));
    if (change === 'archive') await db.update(people).set({ archivedAt: new Date() }).where(eq(people.id, person.id));
    if (change === 'decision') await db.update(people).set({ relationshipType: 'friend' }).where(eq(people.id, person.id));
    let writes = 0; assert.equal(await publishLegacyJob(job, async () => { writes++; }), false); assert.equal(writes, 0);
  }
  await legacyFixture();
  const foreign = await createPerson(stranger, { name: 'Foreign legacy fixture' });
  await enqueueAITask({ userId: owner, taskType: 'person_summarizer', targetType: 'person', targetId: foreign.id });
  assert.equal(await claimLegacyJob(owner, 'fixture/model'), null);
  assert.equal(await claimLegacyJob(stranger, 'fixture/model'), null);
});

test('a re-enqueued legacy task invalidates the old generation and failures cannot revive canceled work', async () => {
  const person = await legacyFixture();
  const { enqueueAITask } = await import('../../src/lib/ai-task-processor');
  const { claimLegacyJob, publishLegacyJob, failLegacyJob } = await import('../../src/lib/network/legacy-ai-jobs');
  const { aiProcessingTasks } = await import('../../src/db/schema');
  const input = { userId: owner, taskType: 'person_summarizer' as const, targetType: 'person' as const, targetId: person.id };
  await enqueueAITask(input); const old = await claimLegacyJob(owner, 'fixture/model'); assert.ok(old);
  await enqueueAITask(input);
  assert.equal(await claimLegacyJob(owner, 'fixture/model'), null);
  assert.equal(await publishLegacyJob(old, async () => { throw new Error('Stale writer called'); }), false);
  const next = await claimLegacyJob(owner, 'fixture/model'); assert.ok(next); assert.notEqual(next.generationKey, old.generationKey);
  await db.update(aiProcessingTasks).set({ status: 'canceled' }).where(eq(aiProcessingTasks.id, next.id));
  await failLegacyJob(next);
  const [stored] = await db.select().from(aiProcessingTasks).where(eq(aiProcessingTasks.id, next.id));
  assert.equal(stored.status, 'canceled'); assert.equal(stored.leaseToken, null); assert.equal(stored.errorMessage, null);
});

test('the actual legacy processor commits its summary and downstream job together and discards canceled inference', async () => {
  const { enqueueAITask, processQueuedAITasks } = await import('../../src/lib/ai-task-processor');
  const { aiProcessingTasks, aiPersonSummaries } = await import('../../src/db/schema');
  const originalFetch = globalThis.fetch;
  try {
    for (const canceled of [false, true]) {
      const person = await legacyFixture();
      await enqueueAITask({ userId: owner, taskType: 'person_summarizer', targetType: 'person', targetId: person.id });
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        if (canceled) await db.update(aiProcessingTasks).set({ status: 'canceled' }).where(and(eq(aiProcessingTasks.userId, owner), eq(aiProcessingTasks.targetId, person.id)));
        return new Response(JSON.stringify({ id: 'fixture-completion', object: 'chat.completion', created: 0, model: 'fixture/model', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ summary: 'Synthetic remembered detail', how_you_know_them: '', why_they_matter: '', notable_advice: '', personal_details: '', open_loops: '', classification: 'unknown', mentor_signal_score: 0, mentor_signal_evidence: [], needs_review: true }) } }] }), { headers: { 'content-type': 'application/json' } });
      };
      const result = await processQueuedAITasks({ userId: owner, mode: 'byok', byokProvider: 'openai', apiKey: 'test-only-no-provider-call', model: 'fixture/model', maxTasks: 1 });
      assert.equal(calls, 1); assert.equal(result.completed, canceled ? 0 : 1);
      assert.equal((await db.select().from(aiPersonSummaries).where(eq(aiPersonSummaries.personId, person.id))).length, canceled ? 0 : 1);
      const downstream = await db.select().from(aiProcessingTasks).where(and(eq(aiProcessingTasks.userId, owner), eq(aiProcessingTasks.targetId, person.id), eq(aiProcessingTasks.taskType, 'mentor_signal_reviewer')));
      assert.equal(downstream.length, canceled ? 0 : 1);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('legacy thread and mentor writers preserve downstream work and isolate cross-owner links', async () => {
  const { enqueueAITask, processQueuedAITasks } = await import('../../src/lib/ai-task-processor');
  const { aiProcessingTasks, aiThreadSummaries, emailThreads, emailMessages, personThreadLinks, outreachTasks } = await import('../../src/db/schema');
  const originalFetch = globalThis.fetch;
  try {
    const person = await legacyFixture();
    const [thread] = await db.insert(emailThreads).values({ userId: owner, gmailThreadId: randomUUID(), subject: 'Owned thread fixture' }).returning();
    await db.insert(emailMessages).values({ userId: owner, threadId: thread.id, gmailMessageId: randomUUID(), senderEmail: 'fixture@example.test', body: 'Owned thread context' });
    await db.insert(personThreadLinks).values({ personId: person.id, threadId: thread.id });
    const foreign = await createPerson(stranger, { name: 'Foreign downstream fixture' });
    // Deliberately corrupt a legacy link: ownership must still be enforced at every boundary.
    await db.insert(personThreadLinks).values({ personId: foreign.id, threadId: thread.id });
    await enqueueAITask({ userId: owner, taskType: 'thread_summarizer', targetType: 'thread', targetId: thread.id });
    let payload = '';
    globalThis.fetch = async (_url, init) => {
      payload = String(init?.body ?? '');
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ summary: 'Owned thread summary', topics: [], decisions: '', personal_details: '', follow_up_signals: '', relationship_evidence: [], confidence: 'low', score: 20, reason: 'A synthetic mentor review', evidence: [], status: 'needs_review' }) } }] }), { headers: { 'content-type': 'application/json' } });
    };
    const run = () => processQueuedAITasks({ userId: owner, mode: 'byok', byokProvider: 'openai', apiKey: 'test-only-no-provider-call', model: 'fixture/model', maxTasks: 1 });
    assert.equal((await run()).completed, 1);
    assert.equal((await db.select().from(aiThreadSummaries).where(eq(aiThreadSummaries.threadId, thread.id))).length, 1);
    assert.equal((await db.select().from(aiProcessingTasks).where(and(eq(aiProcessingTasks.userId, owner), eq(aiProcessingTasks.targetId, foreign.id)))).length, 0);
    const [foreignThread] = await db.insert(emailThreads).values({ userId: stranger, gmailThreadId: randomUUID() }).returning();
    await db.insert(personThreadLinks).values({ personId: person.id, threadId: foreignThread.id });
    await db.insert(aiThreadSummaries).values({ threadId: foreignThread.id, summary: 'foreign-context-must-not-reach-provider' });
    assert.equal((await run()).completed, 1);
    assert.equal(payload.includes('foreign-context-must-not-reach-provider'), false);
    assert.equal((await run()).completed, 1);
    assert.equal((await db.select().from(outreachTasks).where(and(eq(outreachTasks.userId, owner), eq(outreachTasks.personId, person.id)))).length, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('removing a recollection purges all dependent narrative types, retains reviewed choices, and pauses affected plans', async () => {
  const { publishInterviewGeneration, reviewMemoryProposal, getInterview, appendInterviewTurn, saveInterviewDraft } = await import('../../src/lib/network/interviews');
  const { previewInterviewCorrection, correctInterviewTurn } = await import('../../src/lib/network/interview-corrections');
  const { notes, confirmedFacts, openLoops, personalUpdates, aiPersonSummaries, outreachTasks, interviewTurns, interviewCorrections } = await import('../../src/db/schema');
  const { networkPeople } = await import('../../src/lib/network/queries');
  const person = await createPerson(owner, { name: 'Correction subject', relationshipType: 'mentor' });
  const circle = await createCircle(owner, { name: `Correction circle ${randomUUID()}` });
  const fixture = await interviewFixture([person.id], 'A synthetic cobalt-needle recollection. We spoke on September 5.');
  const { interview, source, turn } = fixture;
  await recordInteraction(owner, { requestKey: randomUUID(), personIds: [person.id], body: 'Independent earlier contact', channel: 'call', datePrecision: 'day', occurredOn: '2026-06-01', qualifiesForCadence: true });
  const generation = { generationKey: randomUUID(), sourceRevision: interview.revision, assistant: 'A synthetic cobalt-needle reply.', proposals: [
    { payload: { kind: 'new_person' as const, values: { name: 'Retained confirmed identity' } }, sources: [source] },
    { payload: { kind: 'note' as const, personId: person.id, body: 'cobalt-needle note' }, sources: [source] },
    { payload: { kind: 'profile_fact' as const, personId: person.id, label: 'Interest', body: 'cobalt-needle fact' }, sources: [source] },
    { payload: { kind: 'plan' as const, personId: person.id, values: { nextDueOn: '2026-12-05' } }, sources: [source] },
    { payload: { kind: 'circle_membership' as const, personId: person.id, circleId: circle.id }, sources: [source] },
    { payload: { kind: 'open_loop' as const, personId: person.id, body: 'cobalt-needle loop' }, sources: [source] },
    { payload: { kind: 'personal_update' as const, title: 'Synthetic update', body: 'cobalt-needle update' }, sources: [source] },
    { payload: { kind: 'interaction' as const, values: { requestKey: randomUUID(), personIds: [person.id], body: 'cobalt-needle interaction', channel: 'call' as const, direction: 'mutual' as const, datePrecision: 'day' as const, occurredOn: '2026-09-05', qualifiesForCadence: true } }, sources: [source] },
  ] };
  const generated = await publishInterviewGeneration(owner, interview.id, generation);
  for (const proposal of generated.proposals) await reviewMemoryProposal(owner, interview.id, proposal.id, { action: 'accept', revision: 1 });
  const before = await getInterview(owner, interview.id);
  const later = await appendInterviewTurn(owner, interview.id, { requestKey: randomUUID(), revision: before.interview.revision, content: 'Independent later recollection' });
  const laterSource = { turnId: later.turn.id, revision: 1, start: 0, end: later.turn.content.length, quote: later.turn.content };
  // A later answer can repeat old information even if its displayed quote cites only the new entry.
  await publishInterviewGeneration(owner, interview.id, { generationKey: randomUUID(), sourceRevision: later.interview.revision, assistant: 'Later cobalt-needle answer', proposals: [{ payload: { kind: 'note', personId: person.id, body: 'Later cobalt-needle inference' }, sources: [laterSource] }] });
  await saveInterviewDraft(owner, interview.id, { requestKey: randomUUID(), revision: 1, content: 'Independent unfinished draft' });
  await db.insert(aiPersonSummaries).values({ personId: person.id, summary: 'cobalt-needle summary', model: 'fixture' });
  await db.insert(outreachTasks).values({ userId: owner, personId: person.id, status: 'confirmed', reason: 'cobalt-needle reason', draftMessage: 'cobalt-needle draft' });
  const preview = await previewInterviewCorrection(owner, interview.id, turn.id);
  assert.deepEqual(preview.counts, { assistantTurns: 2, proposals: 9, notes: 1, facts: 1, interactions: 1, openLoops: 1, updates: 1, summaries: 1, outreach: 1 });
  assert.deepEqual(preview.retained, { people: 1, memberships: 1, plans: 1 });
  assert.equal(preview.plansToReview[0].lastContactOn, '2026-06-01');
  const input = { requestKey: randomUUID(), impactKey: preview.impactKey, action: 'remove' as const, retainConfirmedChoices: true as const };
  await Promise.all([correctInterviewTurn(owner, interview.id, turn.id, input), correctInterviewTurn(owner, interview.id, turn.id, input)]);
  const current = await getInterview(owner, interview.id);
  assert.deepEqual(current.turns.map((row) => row.id), [later.turn.id]);
  assert.equal(current.proposals.length, 0);
  assert.equal(current.interview.draftContent, 'Independent unfinished draft');
  const stored = await db.select().from(interviewTurns).where(eq(interviewTurns.interviewId, interview.id));
  assert.equal(JSON.stringify(stored).includes('cobalt-needle'), false);
  assert.ok(stored.find((row) => row.id === turn.id)?.deletedAt);
  for (const table of [notes, confirmedFacts, openLoops]) assert.equal((await db.select().from(table).where(eq(table.personId, person.id))).length, 0);
  assert.equal((await db.select().from(personalUpdates).where(eq(personalUpdates.proposalId, generated.proposals[6].id))).length, 0);
  assert.equal((await db.select().from(aiPersonSummaries).where(eq(aiPersonSummaries.personId, person.id))).length, 0);
  const [outreach] = await db.select().from(outreachTasks).where(eq(outreachTasks.personId, person.id));
  assert.equal(outreach.status, 'confirmed'); assert.equal(outreach.draftMessage, null); assert.equal(outreach.reason.includes('cobalt-needle'), false);
  assert.equal((await networkPeople(owner, { q: 'cobalt-needle' })).people.length, 0);
  assert.equal((await db.select().from(circleMembers).where(eq(circleMembers.circleId, circle.id))).length, 1);
  assert.ok((await db.select().from(people).where(eq(people.id, person.id)))[0]);
  const [plan] = await db.select().from(keepInTouchPlans).where(eq(keepInTouchPlans.personId, person.id));
  assert.equal(plan.lastContactOn, '2026-06-01'); assert.equal(plan.status, 'paused'); assert.equal(plan.needsReview, true);
  assert.equal((await db.select().from(checkIns).where(eq(checkIns.planId, plan.id))).some((row) => row.interactionId !== null), false);
  const resumed = await actOnPlan(owner, person.id, { revision: plan.revision, action: 'resume', nextDueOn: '2026-10-01' });
  assert.equal(resumed.needsReview, false); assert.equal(resumed.lastContactOn, '2026-06-01');
  assert.equal((await db.select().from(interviewCorrections).where(eq(interviewCorrections.interviewId, interview.id))).length, 1);
  await assert.rejects(() => publishInterviewGeneration(owner, interview.id, generation), conflict);
  await assert.rejects(() => appendInterviewTurn(owner, interview.id, { requestKey: turn.requestKey, revision: current.interview.revision, content: turn.content }), conflict);
  await assert.rejects(() => reviewMemoryProposal(owner, interview.id, generated.proposals[1].id, { action: 'accept', revision: 1 }), notFound);
});

test('correction requires a current impact preview, exact owner, and retention consent; replay cannot undo a newer edit', async () => {
  const { publishInterviewGeneration, reviewMemoryProposal, getInterview, appendInterviewTurn } = await import('../../src/lib/network/interviews');
  const { correctInterviewTurn, previewInterviewCorrection } = await import('../../src/lib/network/interview-corrections');
  const person = await createPerson(owner, { name: 'Correction revision fixture' });
  const { interview, turn, source } = await interviewFixture([person.id], 'Synthetic outdated source');
  const generated = await publishInterviewGeneration(owner, interview.id, { generationKey: randomUUID(), sourceRevision: interview.revision, assistant: 'Synthetic question', proposals: [{ payload: { kind: 'note', personId: person.id, body: 'Synthetic note' }, sources: [source] }] });
  const preview = await previewInterviewCorrection(owner, interview.id, turn.id);
  const input = { requestKey: randomUUID(), impactKey: preview.impactKey, action: 'correct' as const, content: 'Synthetic corrected source', retainConfirmedChoices: true as const };
  await assert.rejects(() => previewInterviewCorrection(stranger, interview.id, turn.id), notFound);
  await assert.rejects(() => correctInterviewTurn(stranger, interview.id, turn.id, input), notFound);
  await assert.rejects(() => previewInterviewCorrection(owner, interview.id, randomUUID()), notFound);
  await assert.rejects(() => previewInterviewCorrection(owner, interview.id, generated.assistant.id), notFound);
  await assert.rejects(() => correctInterviewTurn(owner, interview.id, turn.id, { ...input, retainConfirmedChoices: false } as never));
  await reviewMemoryProposal(owner, interview.id, generated.proposals[0].id, { action: 'accept', revision: 1 });
  // Accepting a memory does not change the interview revision, but must invalidate the preview.
  await assert.rejects(() => correctInterviewTurn(owner, interview.id, turn.id, input), conflict);
  assert.equal((await getInterview(owner, interview.id)).turns[0].content, turn.content);
  const fresh = await previewInterviewCorrection(owner, interview.id, turn.id);
  const corrected = { ...input, impactKey: fresh.impactKey };
  await correctInterviewTurn(owner, interview.id, turn.id, corrected);
  const second = await previewInterviewCorrection(owner, interview.id, turn.id);
  await correctInterviewTurn(owner, interview.id, turn.id, { ...corrected, requestKey: randomUUID(), impactKey: second.impactKey, content: 'Second synthetic correction' });
  await correctInterviewTurn(owner, interview.id, turn.id, corrected);
  assert.equal((await getInterview(owner, interview.id)).turns[0].content, 'Second synthetic correction');
  await assert.rejects(() => correctInterviewTurn(owner, interview.id, turn.id, { ...corrected, content: 'Different replay' }), conflict);
  await assert.rejects(() => appendInterviewTurn(owner, interview.id, { requestKey: turn.requestKey, revision: 1, content: turn.content }), conflict);
  // Correction/removal remains available for archived participants.
  await db.update(people).set({ archivedAt: new Date(), reviewStatus: 'archived' }).where(eq(people.id, person.id));
  const archived = await previewInterviewCorrection(owner, interview.id, turn.id);
  await correctInterviewTurn(owner, interview.id, turn.id, { requestKey: randomUUID(), impactKey: archived.impactKey, action: 'remove', retainConfirmedChoices: true });
  assert.equal((await getInterview(owner, interview.id)).turns.length, 0);
});

test('source correction cancels in-flight interview and legacy output and excludes removed text from the next model context', async () => {
  const { correctInterviewTurn, previewInterviewCorrection } = await import('../../src/lib/network/interview-corrections');
  const { getInterview } = await import('../../src/lib/network/interviews');
  const { aiProcessingTasks, networkAiUsage, aiPersonSummaries } = await import('../../src/db/schema');
  const { queueInterview, claimInterviewJob, interviewJobContext, finishInterviewJob } = await import('../../src/lib/network/interview-jobs');
  const { claimLegacyJob, publishLegacyJob } = await import('../../src/lib/network/legacy-ai-jobs');
  const { enqueueAITask } = await import('../../src/lib/ai-task-processor');
  await db.delete(aiProcessingTasks).where(eq(aiProcessingTasks.userId, owner));
  await db.delete(networkAiUsage).where(eq(networkAiUsage.userId, owner));
  process.env.PRIVATE_USER_EMAILS = `${owner}@example.test`;
  await enableInterviewAI();
  const person = await createPerson(owner, { name: 'Cancellation correction fixture' });
  const { interview, turn } = await interviewFixture([person.id], 'Synthetic vanishing-needle source');
  await queueInterview(owner, interview.id, { requestKey: randomUUID(), revision: interview.revision });
  const job = await claimInterviewJob(owner); assert.ok(job);
  assert.ok(JSON.stringify(await interviewJobContext(job)).includes('vanishing-needle'));
  await enqueueAITask({ userId: owner, taskType: 'person_summarizer', targetType: 'person', targetId: person.id });
  const legacy = await claimLegacyJob(owner, 'fixture'); assert.ok(legacy);
  const preview = await previewInterviewCorrection(owner, interview.id, turn.id);
  await correctInterviewTurn(owner, interview.id, turn.id, { requestKey: randomUUID(), impactKey: preview.impactKey, action: 'correct', content: 'Current safe fixture text', retainConfirmedChoices: true });
  assert.equal(await finishInterviewJob(job, await fixtureReply()), false);
  assert.equal(await publishLegacyJob(legacy, async (tx) => { await tx.insert(aiPersonSummaries).values({ personId: person.id, summary: 'vanishing-needle', model: 'fixture' }); }), false);
  assert.equal((await db.select().from(aiPersonSummaries).where(eq(aiPersonSummaries.personId, person.id))).length, 0);
  const current = await getInterview(owner, interview.id);
  await queueInterview(owner, interview.id, { requestKey: randomUUID(), revision: current.interview.revision });
  const fresh = await claimInterviewJob(owner); assert.ok(fresh);
  const context = await interviewJobContext(fresh);
  assert.equal(JSON.stringify(context).includes('vanishing-needle'), false);
  assert.ok(JSON.stringify(context).includes('Current safe fixture text'));
  await finishInterviewJob(fresh, await fixtureReply());
});

test('a failed correction rolls back source removal, memories, summaries and contact-plan changes together', async () => {
  const { sql } = await import('drizzle-orm');
  const { correctInterviewTurn, previewInterviewCorrection } = await import('../../src/lib/network/interview-corrections');
  const { publishInterviewGeneration, reviewMemoryProposal, getInterview } = await import('../../src/lib/network/interviews');
  const { notes, aiPersonSummaries } = await import('../../src/db/schema');
  const person = await createPerson(owner, { name: 'Rollback correction fixture' });
  const { interview, turn, source } = await interviewFixture([person.id], 'Synthetic rollback recollection');
  const generated = await publishInterviewGeneration(owner, interview.id, { generationKey: randomUUID(), sourceRevision: interview.revision, assistant: 'Synthetic rollback question', proposals: [{ payload: { kind: 'note', personId: person.id, body: 'Synthetic rollback note' }, sources: [source] }, { payload: { kind: 'plan', personId: person.id, values: { nextDueOn: '2026-10-01' } }, sources: [source] }] });
  for (const proposal of generated.proposals) await reviewMemoryProposal(owner, interview.id, proposal.id, { action: 'accept', revision: 1 });
  await db.insert(aiPersonSummaries).values({ personId: person.id, summary: 'Synthetic rollback summary', model: 'fixture' });
  const preview = await previewInterviewCorrection(owner, interview.id, turn.id);
  const requestKey = randomUUID();
  // Test-only constraint targets this operation; the final receipt write fails after the purge work.
  await db.execute(sql.raw(`ALTER TABLE interview_corrections ADD CONSTRAINT test_correction_rollback CHECK (request_key <> '${requestKey}'::uuid)`));
  try {
    await assert.rejects(() => correctInterviewTurn(owner, interview.id, turn.id, { requestKey, impactKey: preview.impactKey, action: 'remove', retainConfirmedChoices: true }));
  } finally {
    await db.execute(sql`ALTER TABLE interview_corrections DROP CONSTRAINT test_correction_rollback`);
  }
  const current = await getInterview(owner, interview.id);
  assert.equal(current.turns.length, 2); assert.equal(current.turns[0].content, turn.content); assert.equal(current.proposals.length, 2);
  assert.equal((await db.select().from(notes).where(eq(notes.personId, person.id))).length, 1);
  assert.equal((await db.select().from(aiPersonSummaries).where(eq(aiPersonSummaries.personId, person.id))).length, 1);
  const [plan] = await db.select().from(keepInTouchPlans).where(eq(keepInTouchPlans.personId, person.id));
  assert.equal(plan.needsReview, false); assert.equal(plan.status, 'active');
  assert.equal((await previewInterviewCorrection(owner, interview.id, turn.id)).impactKey, preview.impactKey);
});

test('commitments are owner-scoped, revisioned and retry-safe without inventing contact', async () => {
  const { createOpenLoop, updateOpenLoop, personOpenLoops, openLoopReminders } = await import('../../src/lib/network/open-loops');
  const person = await createPerson(owner, { name: 'Commitment fixture' });
  const foreign = await createPerson(stranger, { name: 'Foreign commitment fixture' });
  const plan = await savePlan(owner, person.id, { nextDueOn: '2026-09-06' });
  const input = { requestKey: randomUUID(), body: 'Send synthetic reading list', dueOn: '2026-09-10' };
  const [first, replay] = await Promise.all([createOpenLoop(owner, person.id, input), createOpenLoop(owner, person.id, input)]);
  assert.equal(first.id, replay.id); assert.equal((await personOpenLoops(owner, person.id)).length, 1);
  await assert.rejects(() => createOpenLoop(owner, foreign.id, input), conflict);
  await assert.rejects(() => createOpenLoop(owner, foreign.id, { ...input, requestKey: randomUUID() }), notFound);
  await assert.rejects(() => personOpenLoops(stranger, person.id), notFound);
  await assert.rejects(() => updateOpenLoop(stranger, person.id, first.id, { requestKey: randomUUID(), revision: 1, action: 'status', status: 'done' }), notFound);
  const doneRequest = { requestKey: randomUUID(), revision: 1, action: 'status' as const, status: 'done' as const };
  const done = await updateOpenLoop(owner, person.id, first.id, doneRequest);
  assert.equal((await openLoopReminders(owner)).some(row => row.loop.id === first.id), false);
  const reopened = await updateOpenLoop(owner, person.id, first.id, { requestKey: randomUUID(), revision: done.revision, action: 'status', status: 'open' });
  assert.equal((await updateOpenLoop(owner, person.id, first.id, doneRequest)).status, 'open');
  assert.equal((await createOpenLoop(owner, person.id, input)).revision, reopened.revision);
  await assert.rejects(() => updateOpenLoop(owner, person.id, first.id, { ...doneRequest, requestKey: randomUUID() }), conflict);
  const edited = await updateOpenLoop(owner, person.id, first.id, { requestKey: randomUUID(), revision: reopened.revision, action: 'edit', body: 'Revised synthetic list', dueOn: null });
  assert.equal(edited.dueOn, null);
  const [unchanged] = await db.select().from(keepInTouchPlans).where(eq(keepInTouchPlans.id, plan.id));
  assert.deepEqual(unchanged, plan);
  assert.equal((await db.select().from(checkIns).where(eq(checkIns.planId, plan.id))).length, 0);
  await db.update(people).set({ archivedAt: new Date() }).where(eq(people.id, person.id));
  await assert.rejects(() => updateOpenLoop(owner, person.id, first.id, { requestKey: randomUUID(), revision: edited.revision, action: 'status', status: 'dismissed' }), notFound);
  assert.equal((await personOpenLoops(owner, person.id)).length, 1);
  assert.equal((await openLoopReminders(owner)).some(row => row.person.id === foreign.id || row.person.id === person.id), false);
});

test('commitments only link owned participating interactions and reminders report real last contact', async () => {
  const { createOpenLoop, openLoopReminders } = await import('../../src/lib/network/open-loops');
  const person = await createPerson(owner, { name: 'Linked commitment fixture' });
  const other = await createPerson(owner, { name: 'Unrelated person fixture' });
  const foreign = await createPerson(stranger, { name: 'Private contact fixture' });
  const event = await recordInteraction(owner, { requestKey: randomUUID(), personIds: [person.id], body: 'Synthetic call', channel: 'call', datePrecision: 'day', occurredOn: '2026-06-10', qualifiesForCadence: true });
  const foreignEvent = await recordInteraction(stranger, { requestKey: randomUUID(), personIds: [foreign.id], body: 'Foreign call', channel: 'call' });
  const input = { requestKey: randomUUID(), body: 'Synthetic linked promise', dueOn: '2026-09-06', interactionId: event.id };
  const loop = await createOpenLoop(owner, person.id, input);
  await assert.rejects(() => createOpenLoop(owner, other.id, { ...input, requestKey: randomUUID() }), notFound);
  await assert.rejects(() => createOpenLoop(owner, person.id, { ...input, requestKey: randomUUID(), interactionId: foreignEvent.id }), notFound);
  const reminder = (await openLoopReminders(owner)).find(row => row.loop.id === loop.id)!;
  assert.equal(reminder.lastContactOn, '2026-06-10');
  const unknown = await createOpenLoop(owner, other.id, { requestKey: randomUUID(), body: 'No contact history', dueOn: '2026-09-06' });
  assert.equal((await openLoopReminders(owner)).find(row => row.loop.id === unknown.id)!.lastContactOn, null);
});

test('commitment edits invalidate interview work; reviewed status stays current and source removal prevents resurrection', async () => {
  const { createOpenLoop, updateOpenLoop, personOpenLoops } = await import('../../src/lib/network/open-loops');
  const { publishInterviewGeneration, reviewMemoryProposal, getInterview } = await import('../../src/lib/network/interviews');
  const { previewInterviewCorrection, correctInterviewTurn } = await import('../../src/lib/network/interview-corrections');
  const { queueInterview, claimInterviewJob, interviewJobContext, finishInterviewJob } = await import('../../src/lib/network/interview-jobs');
  const { aiProcessingTasks, networkAiUsage } = await import('../../src/db/schema');
  await db.delete(aiProcessingTasks).where(eq(aiProcessingTasks.userId, owner));
  await db.delete(networkAiUsage).where(eq(networkAiUsage.userId, owner));
  process.env.PRIVATE_USER_EMAILS = `${owner}@example.test`; await enableInterviewAI();
  const person = await createPerson(owner, { name: 'Cross interview commitment fixture' });
  const original = await interviewFixture([person.id], 'Synthetic source call and promise');
  const generated = await publishInterviewGeneration(owner, original.interview.id, { generationKey: randomUUID(), sourceRevision: original.interview.revision, assistant: 'Synthetic question', proposals: [
    { payload: { kind: 'interaction', values: { requestKey: randomUUID(), personIds: [person.id], body: 'Synthetic call', channel: 'call', datePrecision: 'day', occurredOn: '2026-06-01' } }, sources: [original.source] },
    { payload: { kind: 'open_loop', personId: person.id, body: 'Old synthetic promise', dueOn: '2026-09-06' }, sources: [original.source] }
  ] });
  for (const proposal of generated.proposals) await reviewMemoryProposal(owner, original.interview.id, proposal.id, { action: 'accept', revision: 1 });
  const [event] = await db.select().from(interactions).where(eq(interactions.requestKey, generated.proposals[0].id));
  const input = { requestKey: randomUUID(), body: 'Manually linked promise', dueOn: '2026-09-07', interactionId: event.id };
  await createOpenLoop(owner, person.id, input);
  const reviewed = (await personOpenLoops(owner, person.id)).find(row => row.sourceInterviewId)!;
  const second = await interviewFixture([person.id], 'Synthetic follow-up interview');
  await queueInterview(owner, second.interview.id, { requestKey: randomUUID(), revision: second.interview.revision });
  const stale = await claimInterviewJob(owner); assert.ok(stale);
  const before = await interviewJobContext(stale); assert.equal(JSON.stringify(before).includes('Manually linked promise'), false);
  const edited = await updateOpenLoop(owner, person.id, reviewed.id, { requestKey: randomUUID(), revision: reviewed.revision, action: 'edit', body: 'Current synthetic promise', dueOn: null });
  assert.equal(await finishInterviewJob(stale, await fixtureReply()), false);
  await updateOpenLoop(owner, person.id, reviewed.id, { requestKey: randomUUID(), revision: edited.revision, action: 'status', status: 'done' });
  const current = await getInterview(owner, original.interview.id);
  await queueInterview(owner, original.interview.id, { requestKey: randomUUID(), revision: current.interview.revision });
  const own = await claimInterviewJob(owner); assert.ok(own);
  const context = await interviewJobContext(own);
  assert.ok(context?.reviewed.some(row => row.summary.includes('Current synthetic promise') && row.summary.includes('done')));
  await finishInterviewJob(own, await fixtureReply());
  const refreshed = await getInterview(owner, second.interview.id);
  await queueInterview(owner, second.interview.id, { requestKey: randomUUID(), revision: refreshed.interview.revision });
  const removed = await claimInterviewJob(owner); assert.ok(removed);
  assert.ok(await interviewJobContext(removed));
  const preview = await previewInterviewCorrection(owner, original.interview.id, original.turn.id);
  await correctInterviewTurn(owner, original.interview.id, original.turn.id, { requestKey: randomUUID(), impactKey: preview.impactKey, action: 'remove', retainConfirmedChoices: true });
  assert.equal(await finishInterviewJob(removed, await fixtureReply()), false);
  assert.equal((await personOpenLoops(owner, person.id)).length, 0);
  await assert.rejects(() => createOpenLoop(owner, person.id, input), conflict);
});

test('commitment receipt failures roll back memory and interview revisions together', async () => {
  const { sql } = await import('drizzle-orm');
  const { createOpenLoop, personOpenLoops } = await import('../../src/lib/network/open-loops');
  const { getInterview } = await import('../../src/lib/network/interviews');
  const person = await createPerson(owner, { name: 'Atomic commitment fixture' });
  const { interview } = await interviewFixture([person.id]);
  const requestKey = randomUUID();
  await db.execute(sql.raw(`ALTER TABLE open_loop_requests ADD CONSTRAINT test_loop_rollback CHECK (request_key <> '${requestKey}'::uuid)`));
  try {
    await assert.rejects(() => createOpenLoop(owner, person.id, { requestKey, body: 'Synthetic rolled-back promise', dueOn: '2026-09-06' }));
  } finally {
    await db.execute(sql`ALTER TABLE open_loop_requests DROP CONSTRAINT test_loop_rollback`);
  }
  assert.equal((await personOpenLoops(owner, person.id)).length, 0);
  assert.equal((await getInterview(owner, interview.id)).interview.revision, interview.revision);
  assert.ok(await createOpenLoop(owner, person.id, { requestKey, body: 'Synthetic successful retry', dueOn: '2026-09-06' }));
});

test('removing a linked interaction invalidates the promise origin even without interview participants', async () => {
  const { updateOpenLoop, personOpenLoops } = await import('../../src/lib/network/open-loops');
  const { publishInterviewGeneration, reviewMemoryProposal, getInterview } = await import('../../src/lib/network/interviews');
  const { previewInterviewCorrection, correctInterviewTurn } = await import('../../src/lib/network/interview-corrections');
  const person = await createPerson(owner, { name: 'Independent promise source fixture' });
  const first = await interviewFixture([person.id], 'Synthetic interaction source');
  const contact = await publishInterviewGeneration(owner, first.interview.id, { generationKey: randomUUID(), sourceRevision: first.interview.revision, assistant: 'Synthetic contact question', proposals: [{ payload: { kind: 'interaction', values: { requestKey: randomUUID(), personIds: [person.id], body: 'Synthetic linked call', channel: 'call' } }, sources: [first.source] }] });
  await reviewMemoryProposal(owner, first.interview.id, contact.proposals[0].id, { action: 'accept', revision: 1 });
  const [event] = await db.select().from(interactions).where(eq(interactions.requestKey, contact.proposals[0].id));
  const second = await interviewFixture([], 'Synthetic independent promise source');
  const generated = await publishInterviewGeneration(owner, second.interview.id, { generationKey: randomUUID(), sourceRevision: second.interview.revision, assistant: 'Synthetic promise question', proposals: [{ payload: { kind: 'open_loop', personId: person.id, body: 'Independent synthetic promise', dueOn: null }, sources: [second.source] }] });
  await reviewMemoryProposal(owner, second.interview.id, generated.proposals[0].id, { action: 'accept', revision: 1, identityConfirmed: true });
  const [loop] = await personOpenLoops(owner, person.id);
  await updateOpenLoop(owner, person.id, loop.id, { requestKey: randomUUID(), revision: loop.revision, action: 'edit', body: loop.body, interactionId: event.id });
  const before = await getInterview(owner, second.interview.id);
  const preview = await previewInterviewCorrection(owner, first.interview.id, first.turn.id);
  await correctInterviewTurn(owner, first.interview.id, first.turn.id, { requestKey: randomUUID(), impactKey: preview.impactKey, action: 'remove', retainConfirmedChoices: true });
  assert.equal((await getInterview(owner, second.interview.id)).interview.revision, before.interview.revision + 1);
  assert.equal((await personOpenLoops(owner, person.id)).length, 0);
  // Other explicitly submitted recollections remain in their own interview.
  assert.equal((await getInterview(owner, second.interview.id)).turns[0].content, second.turn.content);
});

test('conversation preferences preserve explicit choices, isolate owners and reject stale saves without changing contact', async () => {
  const { savePersonPreferences, personPreferences } = await import('../../src/lib/network/conversation-preferences');
  const { conversationPreferences } = await import('../../src/db/schema');
  const person = await createPerson(owner, { name: 'Preferences fixture', relationshipType: 'mentor' });
  const foreign = await createPerson(stranger, { name: 'Other preferences fixture' });
  const plan = await savePlan(owner, person.id, { nextDueOn: '2026-09-06' });
  assert.equal(await personPreferences(owner, person.id), null);
  const input = { requestKey: randomUUID(), revision: 0, intention: 'Keep a thoughtful mentorship', topics: 'Personal updates and AI safety questions', preferredFormats: ['photo', 'question'] as const, language: 'Français', draftExclusions: 'Private family details' };
  const value = { ...input, preferredFormats: [...input.preferredFormats] };
  const [saved, replay] = await Promise.all([savePersonPreferences(owner, person.id, value), savePersonPreferences(owner, person.id, { ...value, preferredFormats: ['question', 'photo'] })]);
  assert.deepEqual(saved, replay); assert.equal(saved.revision, 1);
  await assert.rejects(() => personPreferences(stranger, person.id), notFound);
  await assert.rejects(() => savePersonPreferences(owner, foreign.id, value), notFound);
  await assert.rejects(() => db.insert(conversationPreferences).values({ userId: owner, personId: foreign.id }));
  const next = await savePersonPreferences(owner, person.id, { ...value, requestKey: randomUUID(), revision: 1, topics: 'A revised topic', language: '' });
  assert.equal(next.language, ''); assert.equal(next.draftExclusions, value.draftExclusions);
  assert.deepEqual(await savePersonPreferences(owner, person.id, value), next);
  await assert.rejects(() => savePersonPreferences(owner, person.id, { ...value, requestKey: randomUUID() }), conflict);
  await assert.rejects(() => savePersonPreferences(owner, person.id, { ...value, topics: 'Changed replay' }), conflict);
  await assert.rejects(() => savePersonPreferences(owner, person.id, { ...value, requestKey: randomUUID(), revision: 2, preferredFormats: ['automatically_send'] } as never));
  const [unchanged] = await db.select().from(people).where(eq(people.id, person.id));
  assert.equal(unchanged.relationshipType, 'mentor'); assert.equal(unchanged.metState, person.metState);
  assert.deepEqual((await db.select().from(keepInTouchPlans).where(eq(keepInTouchPlans.id, plan.id)))[0], plan);
  const cleared = await savePersonPreferences(owner, person.id, { requestKey: randomUUID(), revision: 2, intention: '', topics: '', preferredFormats: [], language: '', draftExclusions: '' });
  assert.equal(cleared.intention, ''); assert.deepEqual(cleared.preferredFormats, []);
  await db.update(people).set({ archivedAt: new Date() }).where(eq(people.id, person.id));
  assert.deepEqual(await personPreferences(owner, person.id), cleared);
  await assert.rejects(() => savePersonPreferences(owner, person.id, { ...value, requestKey: randomUUID(), revision: 3 }), notFound);
});

test('a failed preference save cannot leave a partial new revision', async () => {
  const { sql } = await import('drizzle-orm');
  const { savePersonPreferences, personPreferences } = await import('../../src/lib/network/conversation-preferences');
  const person = await createPerson(owner, { name: 'Preference rollback fixture' });
  const input = { requestKey: randomUUID(), revision: 0, intention: 'Synthetic original intention', topics: '', preferredFormats: [], language: '', draftExclusions: '' };
  const original = await savePersonPreferences(owner, person.id, input);
  const requestKey = randomUUID();
  await db.execute(sql.raw(`ALTER TABLE conversation_preference_requests ADD CONSTRAINT test_preferences_rollback CHECK (request_key <> '${requestKey}'::uuid)`));
  try {
    await assert.rejects(() => savePersonPreferences(owner, person.id, { ...input, requestKey, revision: 1, intention: 'Uncommitted intention' }));
  } finally {
    await db.execute(sql`ALTER TABLE conversation_preference_requests DROP CONSTRAINT test_preferences_rollback`);
  }
  assert.deepEqual(await personPreferences(owner, person.id), original);
});

test('personal updates start private, validate audience ownership, and cannot be revived by old saves', async () => {
  const { createPersonalUpdate, changePersonalUpdate, listPersonalUpdates } = await import('../../src/lib/network/personal-updates');
  const mine = await createPerson(owner, { name: 'Update audience fixture' });
  const foreign = await createPerson(stranger, { name: 'Private foreign audience' });
  const circle = await createCircle(owner, { name: 'Update circle', kind: 'circle' });
  const foreignCircle = await createCircle(stranger, { name: 'Private foreign circle', kind: 'circle' });
  const input = { requestKey: randomUUID(), title: 'Synthetic life update', body: 'A synthetic reflection' };
  const [created, duplicate] = await Promise.all([createPersonalUpdate(owner, input), createPersonalUpdate(owner, input)]);
  assert.equal(created.id, duplicate.id); assert.deepEqual(created.allowedPersonIds, []); assert.deepEqual(created.allowedCircleIds, []);
  await assert.rejects(() => createPersonalUpdate(owner, { ...input, requestKey: randomUUID(), allowedPersonIds: [mine.id, foreign.id] }), notFound);
  await assert.rejects(() => createPersonalUpdate(owner, { ...input, requestKey: randomUUID(), allowedCircleIds: [foreignCircle.id] }), notFound);
  await assert.rejects(() => changePersonalUpdate(stranger, created.id, { requestKey: randomUUID(), revision: 1, action: 'remove' }), notFound);
  const edit = { requestKey: randomUUID(), revision: 1, action: 'edit' as const, title: 'Current synthetic update', body: 'Current reflection', happenedOn: '2026-09-06', allowedPersonIds: [mine.id], allowedCircleIds: [circle.id] };
  const current = await changePersonalUpdate(owner, created.id, edit);
  assert.deepEqual(current.allowedPersonIds, [mine.id]);
  assert.equal((await listPersonalUpdates(stranger)).updates.some(row => row.id === created.id), false);
  const listing = await listPersonalUpdates(owner); assert.ok(listing.updates.some(row => row.id === created.id));
  assert.ok(listing.people.some(row => row.id === mine.id)); assert.equal(listing.people.some(row => row.id === foreign.id), false);
  await assert.rejects(() => changePersonalUpdate(owner, created.id, { ...edit, requestKey: randomUUID() }), conflict);
  await assert.rejects(() => createPersonalUpdate(owner, { ...input, body: 'Different retry' }), conflict);
  const removed = await changePersonalUpdate(owner, created.id, { requestKey: randomUUID(), revision: 2, action: 'remove' });
  assert.equal(removed.title, ''); assert.equal(removed.body, ''); assert.deepEqual(removed.allowedPersonIds, []); assert.ok(removed.deletedAt);
  assert.ok((await createPersonalUpdate(owner, input)).deletedAt);
  assert.ok((await changePersonalUpdate(owner, created.id, edit)).deletedAt);
  assert.equal((await listPersonalUpdates(owner)).updates.some(row => row.id === created.id), false);
  await assert.rejects(() => changePersonalUpdate(owner, created.id, { ...edit, requestKey: randomUUID(), revision: 3 }), notFound);
});

test('update edits and removal invalidate originating AI work and its current reviewed context', async () => {
  const { changePersonalUpdate } = await import('../../src/lib/network/personal-updates');
  const { publishInterviewGeneration, reviewMemoryProposal, getInterview } = await import('../../src/lib/network/interviews');
  const { queueInterview, claimInterviewJob, interviewJobContext, finishInterviewJob } = await import('../../src/lib/network/interview-jobs');
  const { aiProcessingTasks, networkAiUsage } = await import('../../src/db/schema');
  await db.delete(aiProcessingTasks).where(eq(aiProcessingTasks.userId, owner));
  await db.delete(networkAiUsage).where(eq(networkAiUsage.userId, owner));
  process.env.PRIVATE_USER_EMAILS = `${owner}@example.test`; await enableInterviewAI();
  const { interview, source } = await interviewFixture([], 'Synthetic update recollection');
  const generation = await publishInterviewGeneration(owner, interview.id, { generationKey: randomUUID(), sourceRevision: interview.revision, assistant: 'Synthetic update question', proposals: [{ payload: { kind: 'personal_update', title: 'Old synthetic title', body: 'Old synthetic update' }, sources: [source] }] });
  const reviewed = await reviewMemoryProposal(owner, interview.id, generation.proposals[0].id, { action: 'accept', revision: 1 });
  const updateId = reviewed.acceptedRef!.id;
  async function claim() {
    const current = await getInterview(owner, interview.id);
    await queueInterview(owner, interview.id, { requestKey: randomUUID(), revision: current.interview.revision });
    const job = await claimInterviewJob(owner); assert.ok(job); return job;
  }
  const stale = await claim(); assert.ok(JSON.stringify(await interviewJobContext(stale)).includes('Old synthetic update'));
  await changePersonalUpdate(owner, updateId, { requestKey: randomUUID(), revision: 1, action: 'edit', title: 'Current synthetic title', body: 'Current synthetic update' });
  assert.equal(await finishInterviewJob(stale, await fixtureReply()), false);
  const current = await claim();
  const context = await interviewJobContext(current);
  assert.ok(context.reviewed.some(row => row.summary.includes('Current synthetic update')));
  assert.equal(context.reviewed.some(row => row.summary.includes('Old synthetic update')), false);
  await changePersonalUpdate(owner, updateId, { requestKey: randomUUID(), revision: 2, action: 'remove' });
  assert.equal(await finishInterviewJob(current, await fixtureReply()), false);
  const after = await claim(); const removed = await interviewJobContext(after);
  assert.ok(removed.reviewed.some(row => row.kind === 'personal_update' && row.summary.includes('removed')));
  await finishInterviewJob(after, await fixtureReply());
});

test('update audience failure rolls back source revision and source deletion preserves anti-replay receipts', async () => {
  const { createPersonalUpdate, changePersonalUpdate } = await import('../../src/lib/network/personal-updates');
  const { publishInterviewGeneration, reviewMemoryProposal, getInterview } = await import('../../src/lib/network/interviews');
  const { previewInterviewCorrection, correctInterviewTurn } = await import('../../src/lib/network/interview-corrections');
  const { personalUpdates } = await import('../../src/db/schema');
  const { interview, turn, source } = await interviewFixture([], 'Synthetic purgeable update');
  const generation = await publishInterviewGeneration(owner, interview.id, { generationKey: randomUUID(), sourceRevision: interview.revision, assistant: 'Synthetic source question', proposals: [{ payload: { kind: 'personal_update', title: 'Synthetic update title', body: 'Synthetic update body' }, sources: [source] }] });
  const accepted = await reviewMemoryProposal(owner, interview.id, generation.proposals[0].id, { action: 'accept', revision: 1 });
  const updateId = accepted.acceptedRef!.id;
  const before = await getInterview(owner, interview.id);
  await assert.rejects(() => changePersonalUpdate(owner, updateId, { requestKey: randomUUID(), revision: 1, action: 'edit', title: 'Should roll back', body: 'Should roll back', allowedPersonIds: [randomUUID()] }), notFound);
  assert.equal((await getInterview(owner, interview.id)).interview.revision, before.interview.revision);
  assert.equal((await db.select().from(personalUpdates).where(eq(personalUpdates.id, updateId)))[0].revision, 1);
  const edit = { requestKey: randomUUID(), revision: 1, action: 'edit' as const, title: 'Updated title', body: 'Updated body' };
  await changePersonalUpdate(owner, updateId, edit);
  const preview = await previewInterviewCorrection(owner, interview.id, turn.id);
  await correctInterviewTurn(owner, interview.id, turn.id, { requestKey: randomUUID(), impactKey: preview.impactKey, action: 'remove', retainConfirmedChoices: true });
  await assert.rejects(() => changePersonalUpdate(owner, updateId, edit), conflict);
  // Independent manually saved updates remain private and do not recreate an interview-derived row.
  const independent = await createPersonalUpdate(owner, { requestKey: randomUUID(), title: 'Independent fixture', body: 'Independent fixture body' });
  assert.equal(independent.proposalId, null);
});

test('the personal-update library paginates without dropping owner records or exposing other owners', async () => {
  const { personalUpdates } = await import('../../src/db/schema');
  const { listPersonalUpdates } = await import('../../src/lib/network/personal-updates');
  const fixtureOwner = `update-pages-${randomUUID()}`;
  await db.insert(user).values({ id: fixtureOwner, name: 'Update pages fixture', email: `${fixtureOwner}@example.test` });
  try {
    const inserted = await db.insert(personalUpdates).values(Array.from({ length: 23 }, (_, index) => ({ userId: fixtureOwner, title: `Synthetic page item ${index}`, body: 'Synthetic page fixture' }))).returning({ id: personalUpdates.id });
    const first = await listPersonalUpdates(fixtureOwner, 1), second = await listPersonalUpdates(fixtureOwner, 2);
    assert.equal(first.updates.length, 20); assert.equal(first.hasMore, true); assert.equal(second.updates.length, 3); assert.equal(second.hasMore, false);
    assert.deepEqual([...first.updates, ...second.updates].map(row => row.id).sort(), inserted.map(row => row.id).sort());
    assert.equal(first.people.length, 0); assert.equal(first.circles.length, 0);
    await assert.rejects(() => listPersonalUpdates(fixtureOwner, -1));
  } finally { await db.delete(user).where(eq(user.id, fixtureOwner)); }
});
