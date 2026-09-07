import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, closeDatabase } from "../../src/db";
import { user, account, ownerSetupTokens, rateLimit } from "../../src/db/schema";
import { completeOwnerSetup, consumeAuthAttempt, setupTokenHash } from "../../src/lib/password-setup";
import { POST as setup } from "../../src/app/api/owner-setup/route";
import { POST as authPost, GET as authGet } from "../../src/app/api/auth/[...all]/route";
import { RequestError } from "../../src/lib/request-security";
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !["localhost", "127.0.0.1"].includes(new URL(testUrl).hostname) || !new URL(testUrl).pathname.endsWith("_test")) throw new Error("Disposable local test database required");
Object.assign(process.env, { DATABASE_URL: testUrl, NODE_ENV: "test", BETTER_AUTH_URL: "http://localhost:3000", BETTER_AUTH_SECRET: "test-password-auth-secret-at-least-32-characters" });
const id = randomUUID();
const email = `${id}@example.test`;
process.env.PRIVATE_USER_EMAILS = email;
const token = randomBytes(32).toString("hex");
const username = `owner_${id.slice(0,8)}`;
const password = "A private test password 472!";
const request = (path: string, body: unknown, origin = "http://localhost:3000") => new Request(`http://localhost:3000/api/${path}`, { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
before(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(user).values({ id, name: "Test owner", email, emailVerified: true });
  await db.insert(ownerSetupTokens).values({ userId: id, tokenHash: setupTokenHash(token), expiresAt: new Date(Date.now()+60000) });
  await db.delete(rateLimit);
});
after(async () => { await db.delete(user).where(eq(user.id,id)); await db.delete(rateLimit); await closeDatabase(); });

test("setup rejects forged origins, oversized bodies, unknown tokens and identity injection", async () => {
  assert.equal((await setup(request("owner-setup", {token,username,password}, "https://evil.example"))).status,403);
  assert.equal((await setup(request("owner-setup", {token,username,password:"x".repeat(9000)}))).status,413);
  await assert.rejects(() => completeOwnerSetup({token:"0".repeat(64),username,password}), RequestError);
  await assert.rejects(() => completeOwnerSetup({token,username,password,email:"injected@example.test"}), RequestError);
});
test("expired, unverified and non-owner invitations cannot create credentials", async () => {
  await db.update(ownerSetupTokens).set({expiresAt:new Date(0)}).where(eq(ownerSetupTokens.userId,id));
  await assert.rejects(() => completeOwnerSetup({token,username,password}), RequestError);
  await db.update(ownerSetupTokens).set({expiresAt:new Date(Date.now()+60000)}).where(eq(ownerSetupTokens.userId,id));
  await db.update(user).set({emailVerified:false}).where(eq(user.id,id));
  await assert.rejects(() => completeOwnerSetup({token,username,password}), RequestError);
  await db.update(user).set({emailVerified:true}).where(eq(user.id,id));
  process.env.PRIVATE_USER_EMAILS = "other@example.test";
  await assert.rejects(() => completeOwnerSetup({token,username,password}), RequestError);
  process.env.PRIVATE_USER_EMAILS = email;
});
test("username collision rolls back token consumption and credentials", async () => {
  const otherId = randomUUID();
  await db.insert(user).values({ id:otherId, name:"Collision fixture",email:`${otherId}@example.test`,username });
  try {
    await assert.rejects(()=>completeOwnerSetup({token,username,password}));
    const [invitation] = await db.select().from(ownerSetupTokens).where(eq(ownerSetupTokens.userId,id));
    assert.equal(invitation.consumedAt,null);
    assert.equal((await db.select().from(account).where(eq(account.userId,id))).length,0);
  } finally { await db.delete(user).where(eq(user.id,otherId)); }
});
test("concurrent setup consumes invitation once and real BetterAuth verifies the hash", async () => {
  const results = await Promise.allSettled([completeOwnerSetup({token,username:username.toUpperCase(),password}), completeOwnerSetup({token,username,password})]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  const [credential] = await db.select().from(account).where(eq(account.userId,id));
  assert.equal(credential.providerId,"credential"); assert.notEqual(credential.password,password);
  assert.ok(credential.password && credential.password.length > 64);
  const [used] = await db.select().from(ownerSetupTokens).where(eq(ownerSetupTokens.userId,id)); assert.ok(used.consumedAt);
  await assert.rejects(()=>completeOwnerSetup({token,username,password}),RequestError);
  const bad = await authPost(request("auth/sign-in/username",{username,password:"wrong password"})); assert.equal(bad.status,401);
  const response = await authPost(request("auth/sign-in/username",{username,password}));
  assert.equal(response.status,200,await response.clone().text());
  const cookie = response.headers.get("set-cookie"); assert.ok(cookie?.includes("HttpOnly"));
  const current = await authGet(new Request("http://localhost:3000/api/auth/get-session",{headers:{cookie:cookie!.split(";")[0]}}));
  assert.equal((await current.json()).user.id,id);
  const logoutRequest = request("auth/sign-out", {});
  logoutRequest.headers.set("cookie", cookie!.split(";")[0]);
  assert.equal((await authPost(logoutRequest)).status, 200);
  const signedOut = await authGet(new Request("http://localhost:3000/api/auth/get-session", {headers:{cookie:cookie!.split(";")[0]}}));
  assert.equal(await signedOut.json(), null);
  process.env.PRIVATE_USER_EMAILS = "other@example.test";
  assert.notEqual((await authPost(request("auth/sign-in/username",{username,password}))).status,200);
  process.env.PRIVATE_USER_EMAILS = email;
});
test("signup, email login, social login and reset endpoints stay closed", async () => {
  for(const path of ["sign-up/email","sign-in/social","sign-in/email","link-social","request-password-reset","reset-password"]) assert.equal((await authPost(request(`auth/${path}`,{}))).status,404);
  assert.equal((await authPost(request("auth/sign-in/username",{username,password},"https://evil.example"))).status,403);
});
test("setup throttle persists in the database across calls", async () => {
  await db.delete(rateLimit);
  for(let i=0;i<5;i++) await consumeAuthAttempt("setup");
  await assert.rejects(()=>consumeAuthAttempt("setup"),(error:unknown)=>error instanceof RequestError && error.status===429);
  await db.update(rateLimit).set({lastRequest:0});
  await consumeAuthAttempt("setup");
});
