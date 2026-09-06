import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { makeSignature } from "better-auth/crypto";
import { db, closeDatabase } from "../../src/db";
import { user, session, keepInTouchPlans, people } from "../../src/db/schema";
import { createPerson } from "../../src/lib/network/store";
import {
  createInterview,
  publishInterviewGeneration,
  getInterview,
} from "../../src/lib/network/interviews";
import { runInterviewWorkerOnce, interviewJob } from '../../src/lib/network/interview-jobs';
import { interviewOutput } from '../../src/lib/network/interview-provider';
const origin = "http://127.0.0.1:3007";
const owner = `browser-owner-${randomUUID()}`;
const stranger = `browser-stranger-${randomUUID()}`;
let cookie = "";
let foreignId = "";
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error("TEST_DATABASE_URL is required");
const parsed = new URL(testUrl);
if (
  !["localhost", "127.0.0.1"].includes(parsed.hostname) ||
  !parsed.pathname.endsWith("_test")
)
  throw new Error("Disposable local test database required");
process.env.DATABASE_URL = testUrl;
// The driver allows loopback TLS exceptions only outside production.
Object.assign(process.env, { NODE_ENV: "test" });
test.beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  const old = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, "network-browser-owner@example.test"));
  for (const fixture of old) {
    await db
      .delete(keepInTouchPlans)
      .where(eq(keepInTouchPlans.userId, fixture.id));
    await db.delete(user).where(eq(user.id, fixture.id));
  }
  await db.insert(user).values([
    {
      id: owner,
      name: "Browser Test Owner",
      email: "network-browser-owner@example.test",
      emailVerified: true,
    },
    {
      id: stranger,
      name: "Other Browser Owner",
      email: `${stranger}@example.test`,
      emailVerified: true,
    },
  ]);
  const token = randomUUID();
  await db.insert(session).values({
    id: randomUUID(),
    userId: owner,
    token,
    expiresAt: new Date(Date.now() + 3_600_000),
    updatedAt: new Date(),
  });
  cookie = `${token}.${await makeSignature(token, "browser-test-secret-only-never-use-in-production")}`;
  const [foreign] = await db
    .insert(people)
    .values({
      userId: stranger,
      name: "Private stranger fixture",
      manualNotes: "foreign-note-needle",
      source: "test",
    })
    .returning();
  foreignId = foreign.id;
});
test.afterAll(async () => {
  await db.delete(keepInTouchPlans).where(eq(keepInTouchPlans.userId, owner));
  await db.delete(user).where(inArray(user.id, [owner, stranger]));
  await closeDatabase();
});
test.beforeEach(async ({ context }) => {
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: cookie,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
});
async function captureBoth(page: Page, name: string) {
  await page.setViewportSize({ width: 1280, height: 850 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `/private/tmp/network-os-${name}-desktop.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: `/private/tmp/network-os-${name}-mobile.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 850 });
}

test("circle, name-only person, real contact and quarterly plan persist across desktop and mobile", async ({
  page,
  context,
}) => {
  await page.goto("/circles");
  await page.getByLabel("Circle name").fill("Browser cohort fixture");
  await page.route("**/api/circles", (route) => route.abort());
  await page.getByRole("button", { name: "Create circle" }).click();
  await expect(
    page.getByText(
      "Connection interrupted. Your input is still here; please retry.",
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Circle name")).toHaveValue(
    "Browser cohort fixture",
  );
  await page.unroute("**/api/circles");
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/circles") && response.status() === 200,
    ),
    page.getByRole("button", { name: "Create circle" }).click(),
  ]);
  await expect(
    page.getByRole("heading", { name: "Browser cohort fixture" }),
  ).toBeVisible();
  await captureBoth(page, "circle");
  await page.getByRole("link", { name: "Add someone new" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Alex Browser Fixture");
  await page.getByLabel("Browser cohort fixture").check();
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/people") && response.status() === 200,
    ),
    page.getByRole("button", { name: "Add person", exact: true }).click(),
  ]);
  await expect(
    page.getByRole("heading", { name: "Alex Browser Fixture" }),
  ).toBeVisible();
  await expect(
    page.getByText("No email added", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("No reminders yet.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("First check-in").fill("2026-09-05");
  await page.getByRole("button", { name: "Start reminders" }).click();
  await expect(
    page.getByText("Last qualifying contact: unknown.", { exact: false }),
  ).toBeVisible();
  await page.goto("/dashboard");
  await expect(
    page.getByText("First check-in you chose · 2026-09-05"),
  ).toBeVisible();
  await captureBoth(page, "today");
  await page.getByRole("link", { name: "Open their story" }).click();
  await page
    .getByLabel("What would you like to remember?")
    .fill("Browser test conversation about the robotics reading group.");
  await page.getByLabel("When was it?").selectOption("day");
  await page.getByLabel("Actual date").fill("2026-09-05");
  await page.getByLabel("Count this toward our check-in rhythm").check();
  await page.getByRole("button", { name: "Save contact", exact: true }).click();
  await expect(
    page.getByText("Next check-in: 2026-12-05.", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText(
      "Browser test conversation about the robotics reading group.",
      { exact: true },
    ),
  ).toHaveCount(1);
  await captureBoth(page, "person");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/people");
  await expect(
    page.getByRole("link", { name: /Alex Browser Fixture/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "/private/tmp/network-os-people-mobile.png",
    fullPage: true,
  });
  await page.getByLabel("Search people and notes").fill("robotics");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("link", { name: /Alex Browser Fixture/ }),
  ).toBeVisible();
  await page.getByLabel("Search people and notes").fill("foreign-note-needle");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("No one matches just yet")).toBeVisible();
  const noOrigin = await context.request.post("/api/people", {
    data: { name: "Denied browser fixture" },
  });
  expect(noOrigin.status()).toBe(403);
  const crossOwner = await context.request.put(
    `/api/people/${foreignId}/keep-in-touch`,
    { headers: { origin }, data: { nextDueOn: "2026-12-05" } },
  );
  expect(crossOwner.status()).toBe(404);
  const forged = await context.request.get("/api/people", {
    headers: { cookie: "better-auth.session_token=forged" },
  });
  expect(forged.status()).toBe(401);
});

test("interview capture, identity review, private memory and source links survive reload", async ({
  page,
  context,
}) => {
  const { notes: noteTable } = await import("../../src/db/schema");
  const person = await createPerson(owner, {
    name: "Taylor Interview Fixture",
  });
  const foreignInterview = await createInterview(stranger, {
    requestKey: randomUUID(),
    title: "Foreign interview fixture",
  });
  await page.goto("/interviews");
  await expect(
    page.getByRole("heading", { name: "Your conversations" }),
  ).toBeVisible();
  await page
    .getByLabel("Conversation title")
    .fill("Remembering a shared afternoon");
  await page
    .getByRole("button", { name: "Start a conversation", exact: true })
    .click();
  await expect(page).toHaveURL(/\/interviews\/[0-9a-f-]+$/);
  const interviewId = page.url().split("/").pop()!;
  const words = "Taylor enjoys climbing. Sam is applying to graduate school.";
  await page.getByLabel("What would you like to remember?").fill(words);
  await page.route("**/turns", (route) => route.abort());
  await page.getByRole("button", { name: "Save recollection" }).click();
  await expect(
    page.getByRole("region", { name: "Saved conversation" }).getByRole("alert"),
  ).toContainText("Your input is still here");
  await expect(page.getByLabel("What would you like to remember?")).toHaveValue(
    words,
  );
  await page.unroute("**/turns");
  await page.getByRole("button", { name: "Save recollection" }).click();
  await expect(
    page.getByText("Saved to your private notebook", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause interview" }).click();
  await expect(
    page.getByRole("button", { name: "Resume interview" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText(words, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resume interview" }).click();
  await expect(
    page.getByRole("button", { name: "Pause interview" }),
  ).toBeVisible();
  const saved = await getInterview(owner, interviewId);
  const turn = saved.turns[0];
  // Deterministic model output is injected through the internal boundary only in this test.
  const generated = await publishInterviewGeneration(owner, interviewId, {
    generationKey: randomUUID(),
    sourceRevision: saved.interview.revision,
    assistant: "Which Taylor is this about?",
    proposals: [
      {
        payload: { kind: "note", body: "Enjoys climbing" },
        sources: [
          {
            turnId: turn.id,
            revision: turn.revision,
            start: 0,
            end: 23,
            quote: "Taylor enjoys climbing.",
          },
        ],
        identityHints: ["Taylor"],
      },
      {
        payload: {
          kind: "personal_update",
          title: "Uncertain suggestion",
          body: "<img src=x onerror=alert(1)>",
        },
        sources: [
          {
            turnId: turn.id,
            revision: turn.revision,
            start: 0,
            end: 23,
            quote: "Taylor enjoys climbing.",
          },
        ],
        uncertainty: "A test-only unsupported interpretation to reject",
      },
    ],
  });
  await page.reload();
  const card = page.getByRole("article", { name: "Private note suggestion" });
  await expect(
    card.getByRole("button", { name: "Save this memory" }),
  ).toBeDisabled();
  await card.getByRole("radio", { name: /Taylor Interview Fixture/ }).check();
  await card.getByLabel("I have checked the identity above").check();
  await card
    .getByLabel("Memory to save")
    .fill("Enjoys climbing; ask about a favorite route.");
  await page.route("**/proposals/*", (route) => route.abort());
  await card.getByRole("button", { name: "Save this memory" }).click();
  await expect(card.getByRole("alert")).toContainText(
    "Your input is still here",
  );
  await expect(card.getByLabel("Memory to save")).toHaveValue(
    "Enjoys climbing; ask about a favorite route.",
  );
  await page.unroute("**/proposals/*");
  await captureBoth(page, "interview-review");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Review (2)", exact: true }).click();
  await expect(card).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "/private/tmp/network-os-interview-review-mobile.png",
    fullPage: true,
  });
  await card.getByRole('link', { name: 'Taylor enjoys climbing.' }).click();
  await expect(page.getByRole('region', { name: 'Saved conversation' })).toBeVisible();
  await expect(page.locator(`#turn-${turn.id}`)).toBeVisible();
  await page.getByRole('button', { name: 'Review (2)', exact: true }).click();
  await card.getByRole("button", { name: "Save this memory" }).click();
  await expect(
    card.getByText("Saved to your notebook. No message was sent."),
  ).toBeVisible();
  const updateCard = page.getByRole("article", {
    name: "Your personal update suggestion",
  });
  await expect(updateCard.locator("img")).toHaveCount(0);
  await updateCard.getByRole("button", { name: "Reject suggestion" }).click();
  await expect(updateCard.getByText("rejected", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(
    card.getByText("Saved to your notebook. No message was sent."),
  ).toBeVisible();
  expect(
    (await db.select().from(noteTable).where(eq(noteTable.personId, person.id)))
      .length,
  ).toBe(1);
  await page.goto(`/people/${person.id}`);
  await expect(
    page.getByText("Enjoys climbing; ask about a favorite route.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Sam is applying to graduate school.", { exact: false }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Reviewed in your interview" }).click();
  await expect(page).toHaveURL(new RegExp(`/interviews/${interviewId}$`));
  const deniedRead = await context.request.get(
    `/api/interviews/${foreignInterview.id}`,
  );
  expect(deniedRead.status()).toBe(404);
  const deniedTurn = await context.request.post(
    `/api/interviews/${foreignInterview.id}/turns`,
    {
      headers: { origin },
      data: {
        requestKey: randomUUID(),
        revision: 1,
        content: "Denied fixture",
      },
    },
  );
  expect(deniedTurn.status()).toBe(404);
  const deniedReview = await context.request.patch(
    `/api/interviews/${foreignInterview.id}/proposals/${generated.proposals[0].id}`,
    { headers: { origin }, data: { revision: 1, action: "accept" } },
  );
  expect(deniedReview.status()).toBe(404);
  const deniedOrigin = await context.request.post("/api/interviews", {
    data: { requestKey: randomUUID() },
  });
  expect(deniedOrigin.status()).toBe(403);
  const oversized = await context.request.post(
    `/api/interviews/${interviewId}/turns`,
    {
      headers: { origin },
      data: {
        requestKey: randomUUID(),
        revision: 1,
        content: "x".repeat(70000),
      },
    },
  );
  expect(oversized.status()).toBe(413);
  const forgedRead = await context.request.get(
    `/api/interviews/${interviewId}`,
    { headers: { cookie: "better-auth.session_token=forged" } },
  );
  expect(forgedRead.status()).toBe(401);
  const privateRead = await context.request.get(
    `/api/interviews/${interviewId}`,
  );
  expect(privateRead.headers()["cache-control"]).toContain("no-store");
});

test('AI consent, durable generation, polling recovery and review work together without a real provider', async ({ page, context }) => {
  process.env.NETWORK_INTERVIEW_MODEL = 'fixture/interviewer';
  process.env.OPENROUTER_API_KEY = 'test-only-key-never-call-a-real-provider';
  process.env.PRIVATE_USER_EMAILS = 'network-browser-owner@example.test';
  const person = await createPerson(owner, { name: 'Morgan Worker Fixture' });
  await page.goto('/interviews');
  await page.getByLabel('Conversation title').fill('A worker-backed conversation');
  await page.getByRole('button', { name: 'Start a conversation', exact: true }).click();
  await expect(page).toHaveURL(/\/interviews\/[0-9a-f-]+$/);
  const interviewId = page.url().split('/').pop()!;
  const denied = await context.request.post(`/api/interviews/${interviewId}/generation`, { headers: { origin }, data: { requestKey: randomUUID(), revision: 1 } });
  expect(denied.status()).toBe(409);
  const controls = page.getByRole('region', { name: 'AI interviewer' });
  await expect(controls.getByText('OpenRouter · fixture/interviewer')).toBeVisible();
  await controls.getByRole('button', { name: 'Allow AI interviews with this provider' }).click();
  await expect(controls.getByRole('button', { name: 'Turn AI off' })).toBeVisible();
  await page.getByLabel('What would you like to remember?').fill('Morgan enjoys birdwatching.');
  const queuedResponse = page.waitForResponse((response) => response.url().endsWith('/generation') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save recollection' }).click();
  expect((await queuedResponse).status()).toBe(202);
  await expect(controls.getByText('Your request is saved and waiting for the interviewer. You can leave and return.')).toBeVisible();
  await page.reload();
  await expect(controls.getByText('Your request is saved and waiting for the interviewer. You can leave and return.')).toBeVisible();
  await page.route('**/generation', (route) => route.request().method() === 'GET' ? route.abort() : route.continue());
  await expect(controls.getByRole('alert')).toContainText('The connection was interrupted');
  let calls = 0;
  expect(await runInterviewWorkerOnce({ ownerId: owner, generate: async (input) => {
    calls++;
    const turn = input.turns.find((item) => item.role === 'user')!;
    return { output: interviewOutput.parse({ assistant: 'What did Morgan say about birdwatching?', proposals: [{ payload: { kind: 'note', personId: person.id, body: 'Enjoys birdwatching' }, sources: [{ turnId: turn.id, revision: turn.revision, start: 0, end: turn.content.length, quote: turn.content }] }] }), inputTokens: 10, outputTokens: 20 };
  } })).toBe(true);
  expect(calls).toBe(1);
  await page.unroute('**/generation');
  await controls.getByRole('button', { name: 'Check for the answer' }).click();
  await expect(page.getByText('What did Morgan say about birdwatching?', { exact: true })).toBeVisible();
  const card = page.getByRole('article', { name: 'Private note suggestion' });
  await card.getByLabel('I have checked the identity above').check();
  await card.getByRole('button', { name: 'Save this memory' }).click();
  await expect(card.getByText('Saved to your notebook. No message was sent.')).toBeVisible();
  await captureBoth(page, 'interview-ai');
  await page.getByLabel('What would you like to remember?').fill('I would like to ask about a local walk.');
  await page.getByRole('button', { name: 'Save recollection' }).click();
  await expect(controls.getByText('Your request is saved and waiting for the interviewer. You can leave and return.')).toBeVisible();
  await controls.getByRole('button', { name: 'Turn AI off' }).click();
  await expect(controls.getByRole('button', { name: 'Allow AI interviews with this provider' })).toBeVisible();
  expect((await interviewJob(owner, interviewId))!.status).toBe('canceled');
  expect(await runInterviewWorkerOnce({ ownerId: owner, generate: async () => { throw new Error('Canceled jobs must not call a provider'); } })).toBe(false);
  await page.reload();
  await expect(controls.getByRole('button', { name: 'Allow AI interviews with this provider' })).toBeVisible();
  await expect(page.getByText('I would like to ask about a local walk.', { exact: true })).toBeVisible();
});

test('private drafts autosave, survive reload, recover failed acknowledgments and resist another tab overwriting them', async ({ page, context }) => {
  const interview = await createInterview(owner, { requestKey: randomUUID(), title: 'Autosave fixture' });
  await page.goto(`/interviews/${interview.id}`);
  const input = page.getByLabel('What would you like to remember?');
  const saving = page.getByLabel('Draft saving', { exact: true });
  await input.fill('An unfinished thought with an uncertain date.');
  await expect(saving.getByRole('status')).toHaveText('Draft saved privately');
  expect((await getInterview(owner, interview.id)).turns).toHaveLength(0);
  await page.reload();
  await expect(input).toHaveValue('An unfinished thought with an uncertain date.');
  // The server commits this save, but the client never receives its acknowledgment.
  let lost = false;
  await page.route('**/draft', async (route) => {
    if (!lost) { lost = true; await route.fetch(); await route.abort(); }
    else await route.continue();
  });
  await input.fill('Words saved despite a lost acknowledgment.');
  await expect(saving.getByRole('alert')).toContainText('Connection interrupted');
  await expect(input).toHaveValue('Words saved despite a lost acknowledgment.');
  await saving.getByRole('button', { name: 'Retry draft save' }).click();
  await expect(saving.getByRole('status')).toHaveText('Draft saved privately');
  await page.unroute('**/draft');
  await page.getByRole('button', { name: 'Pause interview', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume interview', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Resume interview', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resume interview', exact: true }).click();
  await expect(input).toHaveValue('Words saved despite a lost acknowledgment.');
  const denied = await context.request.put(`/api/interviews/${interview.id}/draft`, { headers: { origin: 'https://untrusted.example' }, data: { requestKey: randomUUID(), revision: 1, content: 'Forged draft' } });
  expect(denied.status()).toBe(403);
  const foreign = await createInterview(stranger, { requestKey: randomUUID() });
  expect((await context.request.put(`/api/interviews/${foreign.id}/draft`, { headers: { origin }, data: { requestKey: randomUUID(), revision: 1, content: 'Foreign write' } })).status()).toBe(404);
  const other = await context.newPage();
  await other.goto(`/interviews/${interview.id}`);
  await input.fill('Newer words from the first tab.');
  await expect(saving.getByRole('status')).toHaveText('Draft saved privately');
  await other.getByLabel('What would you like to remember?').fill('Stale words from the second tab.');
  await expect(other.getByLabel('Draft saving', { exact: true }).getByRole('alert')).toContainText('saved draft changed');
  expect((await getInterview(owner, interview.id)).interview.draftContent).toBe('Newer words from the first tab.');
  await expect(other.getByLabel('What would you like to remember?')).toHaveValue('Stale words from the second tab.');
  await other.close();
  await page.screenshot({ path: '/private/tmp/network-os-autosave-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/private/tmp/network-os-autosave-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Save recollection', exact: true }).click();
  await expect(page.getByText('Saved to your private notebook', { exact: true })).toBeVisible();
  await page.reload();
  await expect(input).toHaveValue('');
  const record = await getInterview(owner, interview.id);
  expect(record.turns.filter((turn) => turn.role === 'user')).toHaveLength(1);
  expect(record.interview.draftContent).toBe('');
});

test('legacy processing rejects unsafe inputs before invoking any model', async ({ context }) => {
  for (const data of [
    { maxTasks: 80 },
    { maxTasks: -1 },
    { providerMode: 'unexpected' },
    { providerMode: 'byok' },
    { byokProvider: 'arbitrary-host' },
    { modelUrl: 'http://169.254.169.254' },
  ]) {
    const response = await context.request.post('/api/ai/process', { headers: { origin }, data });
    expect(response.status()).toBe(400);
  }
  expect((await context.request.post('/api/ai/process', { headers: { origin: 'https://untrusted.example' }, data: {} })).status()).toBe(403);
  expect((await context.request.post('/api/ai/process', { headers: { origin }, data: { byokApiKey: 'x'.repeat(70_000) } })).status()).toBe(413);
});

test('recollection corrections preview effects, recover lost acknowledgments, and remove memories with an accessible confirmation', async ({ page }) => {
  page.setDefaultTimeout(30_000);
  const { appendInterviewTurn, reviewMemoryProposal } = await import('../../src/lib/network/interviews');
  const { savePlan } = await import('../../src/lib/network/store');
  const person = await createPerson(owner, { name: 'Recollection correction fixture' });
  await savePlan(owner, person.id, { nextDueOn: '2026-09-05' });
  const interview = await createInterview(owner, { requestKey: randomUUID(), title: 'Correction browser fixture', personIds: [person.id] });
  const saved = await appendInterviewTurn(owner, interview.id, { requestKey: randomUUID(), revision: interview.revision, content: 'Synthetic outdated memory about a call on September 5.' });
  const generation = await publishInterviewGeneration(owner, interview.id, {
    generationKey: randomUUID(), sourceRevision: saved.interview.revision, assistant: 'Synthetic follow-up question.',
    proposals: [{ payload: { kind: 'interaction', values: { requestKey: randomUUID(), personIds: [person.id], body: 'Synthetic outdated call', channel: 'call', datePrecision: 'day', occurredOn: '2026-09-05', qualifiesForCadence: true } }, sources: [{ turnId: saved.turn.id, revision: 1, start: 0, end: saved.turn.content.length, quote: saved.turn.content }] }],
  });
  await reviewMemoryProposal(owner, interview.id, generation.proposals[0].id, { action: 'accept', revision: 1 });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/interviews/${interview.id}`);
  await page.getByRole('button', { name: 'Correct or remove', exact: true }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Review this recollection' });
  await expect(dialog.getByText('What this changes', { exact: true })).toBeVisible();
  await expect(dialog.getByText('1 AI reply and 1 suggestion removed.', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/remaining last contact: unknown/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save correction', exact: true })).toBeDisabled();
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Correct or remove', exact: true })).toBeFocused();
  await expect(page.getByRole('region', { name: 'Saved conversation', exact: true }).getByText(saved.turn.content, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Correct or remove', exact: true }).click();
  await expect(dialog.getByText('What this changes', { exact: true })).toBeVisible();
  await dialog.getByLabel('Corrected recollection', { exact: true }).fill('Synthetic corrected memory: the date is uncertain.');
  await dialog.getByRole('checkbox').check();
  await expect(dialog.getByRole('button', { name: 'Save correction', exact: true })).toBeInViewport();
  await page.screenshot({ path: '/private/tmp/network-os-correction-desktop.png', fullPage: false });
  const url = `**/api/interviews/${interview.id}/turns/${saved.turn.id}`;
  let lost = false;
  await page.route(url, async (route) => {
    if (route.request().method() === 'PATCH' && !lost) { lost = true; await route.fetch(); await route.abort(); }
    else await route.continue();
  });
  await dialog.getByRole('button', { name: 'Save correction', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Connection interrupted');
  await expect(dialog.getByLabel('Corrected recollection', { exact: true })).toHaveValue('Synthetic corrected memory: the date is uncertain.');
  await dialog.getByRole('button', { name: 'Save correction', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.unroute(url);
  await expect(page.getByText('Synthetic corrected memory: the date is uncertain.', { exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic follow-up question.', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Room to remember', exact: true })).toBeFocused();
  await page.reload();
  await expect(page.getByText('Synthetic corrected memory: the date is uncertain.', { exact: true })).toBeVisible();
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Check these reminder dates', exact: true })).toBeVisible();
  await page.getByRole('link', { name: person.name, exact: true }).click();
  await expect(page.getByText(/A source recollection changed\. Review the remaining contact history/)).toBeVisible();
  await page.goto(`/interviews/${interview.id}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Correct or remove', exact: true }).click();
  await expect(dialog.getByText('What this changes', { exact: true })).toBeVisible();
  await dialog.getByLabel('Change to make', { exact: true }).selectOption('remove');
  await dialog.getByRole('checkbox').check();
  await expect(dialog.getByRole('button', { name: 'Remove entry and memories', exact: true })).toBeInViewport();
  await page.screenshot({ path: '/private/tmp/network-os-correction-mobile.png', fullPage: false });
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await dialog.getByRole('button', { name: 'Remove entry and memories', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Correct or remove', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Room to remember', exact: true })).toBeFocused();
  await page.reload();
  expect((await getInterview(owner, interview.id)).turns).toHaveLength(0);
  const target = `/api/interviews/${interview.id}/turns/${saved.turn.id}`;
  const missing = await page.request.get(target); expect(missing.status()).toBe(404);
  const noOrigin = await page.request.patch(target, { data: {} }); expect(noOrigin.status()).toBe(403);
  const foreign = await page.request.get(`/api/interviews/${foreignId}/turns/${saved.turn.id}`); expect(foreign.status()).toBe(404);
  const invalid = await page.request.patch(target, { headers: { Origin: origin }, data: { action: 'remove' } }); expect(invalid.status()).toBe(400);
  const oversized = await page.request.patch(target, { headers: { Origin: origin }, data: { content: 'x'.repeat(70_000) } }); expect(oversized.status()).toBe(413);
});

test('commitments survive lost acknowledgments, stay separate from contact, and work on mobile', async ({ page, context }) => {
  page.setDefaultTimeout(30_000);
  const { savePlan } = await import('../../src/lib/network/store');
  const { personOpenLoops } = await import('../../src/lib/network/open-loops');
  const person = await createPerson(owner, { name: `Commitment browser ${randomUUID().slice(0, 6)}` });
  const plan = await savePlan(owner, person.id, { nextDueOn: '2020-01-01' });
  const endpoint = `${origin}/api/people/${person.id}/open-loops`;
  await page.goto(`/people/${person.id}`);
  const section = page.getByRole('region', { name: 'Promises and follow-ups' });
  await section.getByRole('button', { name: 'Add commitment' }).click();
  await section.getByLabel('Promise or follow-up', { exact: true }).fill('   ');
  await section.getByRole('button', { name: 'Save commitment', exact: true }).click();
  await expect(section.getByRole('alert')).toBeVisible();
  await expect(section.getByLabel('Promise or follow-up', { exact: true })).toBeEnabled();
  await section.getByLabel('Promise or follow-up', { exact: true }).fill('Send a synthetic reading list');
  await section.getByLabel('Due date (optional)', { exact: true }).fill('2020-01-02');
  // The server commits, but the browser loses the acknowledgment.
  await page.route(endpoint, async route => { await route.fetch(); await route.abort('failed'); }, { times: 1 });
  await section.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(section.getByRole('alert')).toBeVisible();
  await expect(section.getByLabel('Promise or follow-up', { exact: true })).toHaveValue('Send a synthetic reading list');
  await section.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(section.getByRole('button', { name: 'Add commitment' })).toBeVisible();
  await expect(section.getByText('Send a synthetic reading list', { exact: true })).toBeVisible();
  const loops = await personOpenLoops(owner, person.id); expect(loops).toHaveLength(1);
  const loop = loops[0];
  await section.getByRole('button', { name: 'Edit', exact: true }).click();
  await section.getByLabel('Promise or follow-up', { exact: true }).fill('Send the revised synthetic reading list');
  await section.getByRole('button', { name: 'Save commitment', exact: true }).click();
  await expect(section.getByRole('button', { name: 'Save commitment', exact: true })).toHaveCount(0);
  await expect(section.getByText('Send the revised synthetic reading list', { exact: true })).toBeVisible();
  await captureBoth(page, 'commitments-person');
  await page.goto('/dashboard');
  const card = page.locator('li').filter({ has: page.getByRole('link', { name: person.name, exact: true }) });
  await expect(card).toHaveCount(1);
  await expect(card.getByText('Send the revised synthetic reading list', { exact: true })).toBeVisible();
  await expect(card.getByText('First check-in you chose · 2020-01-01', { exact: true })).toBeVisible();
  await captureBoth(page, 'commitments-today');
  await page.setViewportSize({ width: 390, height: 844 });
  await card.getByRole('button', { name: 'Mark done', exact: true }).click();
  await expect(card.getByText('Send the revised synthetic reading list', { exact: true })).toHaveCount(0);
  await expect(card.getByRole('link', { name: person.name, exact: true })).toBeVisible();
  const [unchanged] = await db.select().from(keepInTouchPlans).where(eq(keepInTouchPlans.id, plan.id));
  expect(unchanged).toEqual(plan);
  await page.goto(`/people/${person.id}`);
  await section.getByText('Completed or dismissed (1)', { exact: true }).click();
  await section.getByRole('button', { name: 'Reopen', exact: true }).click();
  await expect(section.getByRole('button', { name: 'Mark done', exact: true })).toBeVisible();
  await section.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(section.getByRole('button', { name: 'Mark done', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(section.getByText('Completed or dismissed (1)', { exact: true })).toBeVisible();
  const data = { requestKey: randomUUID(), body: 'Unauthorized synthetic write' };
  expect((await context.request.post(endpoint, { data })).status()).toBe(403);
  expect((await context.request.get(`${origin}/api/people/${foreignId}/open-loops`)).status()).toBe(404);
  expect((await context.request.patch(`${origin}/api/people/${foreignId}/open-loops/${loop.id}`, { headers: { Origin: origin }, data: { requestKey: randomUUID(), action: 'status', revision: 1, status: 'done' } })).status()).toBe(404);
  expect((await context.request.post(endpoint, { headers: { Origin: origin }, data: { ...data, body: 'x'.repeat(4001) } })).status()).toBe(400);
  expect((await context.request.get(endpoint, { headers: { Cookie: 'better-auth.session_token=forged' } })).status()).toBe(401);
});
