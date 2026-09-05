import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { makeSignature } from "better-auth/crypto";
import { db, closeDatabase } from "../../src/db";
import { user, session, keepInTouchPlans, people } from "../../src/db/schema";
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
