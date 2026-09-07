import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db } from "@/db";
import { account, ownerSetupTokens, user } from "@/db/schema";
import { isAuthorizedEmail } from "./private-access";
import { RequestError } from "./request-security";

export const validUsername = (value: string) => /^[a-zA-Z0-9_]{3,30}$/.test(value);
export const setupTokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

// Global buckets intentionally do not trust forwarded IP headers. For this single-owner
// app, they bound password hashing across every instance and survive task replacement.
export async function consumeAuthAttempt(bucket: "login" | "setup") {
  const max = bucket === "login" ? 30 : 5;
  const key = `private:${bucket}`;
  const result = await db.execute(sql`
    INSERT INTO auth_rate_limit (id, key, count, last_request)
    VALUES (${key}, ${key}, 1, floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN auth_rate_limit.last_request < floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint - 60000
        THEN 1 ELSE least(auth_rate_limit.count + 1, ${max + 1}) END,
      last_request = CASE WHEN auth_rate_limit.last_request < floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint - 60000
        THEN floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint ELSE auth_rate_limit.last_request END
    RETURNING count
  `);
  if (Number(result.rows[0]?.count) > max) throw new RequestError(429, "Too many attempts. Try again in a minute.");
}

export async function completeOwnerSetup(input: unknown) {
  const body = input as Record<string, unknown> | null;
  if (!body || Object.keys(body).some((key) => !["token", "username", "password"].includes(key)) ||
    typeof body.token !== "string" || !/^[a-f0-9]{64}$/.test(body.token) ||
    typeof body.username !== "string" || !validUsername(body.username) ||
    typeof body.password !== "string" || body.password.length < 12 || body.password.length > 128) {
    throw new RequestError(400, "Use a valid setup link, a 3–30 character username, and a 12–128 character password.");
  }
  const tokenHash = setupTokenHash(body.token);
  const normalized = body.username.toLowerCase();
  const password = body.password;
  const invalid = () => new RequestError(400, "This setup link is invalid, expired, or already used.");
  const [candidate] = await db.select().from(ownerSetupTokens).where(eq(ownerSetupTokens.tokenHash, tokenHash));
  if (!candidate) throw invalid();
  await db.transaction(async (tx) => {
    // Consistent owner-first locking also serializes credential setup across token rotations.
    const [owner] = await tx.select().from(user).where(eq(user.id, candidate.userId)).for("update");
    const [token] = await tx.select().from(ownerSetupTokens).where(eq(ownerSetupTokens.tokenHash, tokenHash)).for("update");
    if (!owner?.emailVerified || !isAuthorizedEmail(owner.email) || !token || token.userId !== owner.id ||
      token.consumedAt || token.expiresAt.getTime() <= Date.now()) throw invalid();
    const [existing] = await tx.select({ id: account.id }).from(account)
      .where(and(eq(account.userId, owner.id), eq(account.providerId, "credential")));
    if (existing) throw invalid();
    const passwordHash = await hashPassword(password);
    if (token.expiresAt.getTime() <= Date.now()) throw invalid();
    await tx.update(user).set({ username: normalized, displayUsername: body.username as string, updatedAt: new Date() }).where(eq(user.id, owner.id));
    await tx.insert(account).values({ id: randomUUID(), accountId: owner.id, providerId: "credential", userId: owner.id, password: passwordHash });
    await tx.update(ownerSetupTokens).set({ consumedAt: new Date() }).where(eq(ownerSetupTokens.tokenHash, tokenHash));
  });
}
