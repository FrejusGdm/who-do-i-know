import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins/username";
import { validUsername } from "./password-setup";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { isAuthorizedEmail, productionAuthConfiguration } from "./private-access";

function createAuth() {
  productionAuthConfiguration();
  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL,
    secret:
      process.env.BETTER_AUTH_SECRET ??
      "development-only-secret-change-me-before-production",
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    logger: { disabled: true },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 60 },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    databaseHooks: {
      user: { create: { before: async (candidate) => {
        if (!candidate.emailVerified || !isAuthorizedEmail(candidate.email)) return false;
        return { data: candidate };
      } } },
      session: { create: { before: async (candidate) => {
        const [owner] = await db.select({ email: schema.user.email, verified: schema.user.emailVerified })
          .from(schema.user).where(eq(schema.user.id, candidate.userId)).limit(1);
        if (!owner?.verified || !isAuthorizedEmail(owner.email)) return false;
        return { data: candidate };
      } } },
    },
    plugins: [username({ minUsernameLength: 3, maxUsernameLength: 30, usernameValidator: validUsername }), nextCookies()],
  });
}

// Builds can import route definitions without accessing production secrets or the DB.
// Runtime access still fails closed before BetterAuth initializes.
let instance: ReturnType<typeof createAuth> | undefined;
function getAuth() { return instance ??= createAuth(); }
export const auth = new Proxy({} as ReturnType<typeof createAuth>, {
  has: (_target, property) => property in getAuth(),
  get: (_target, property) => {
    const current = getAuth();
    const value = Reflect.get(current, property);
    return typeof value === "function" ? value.bind(current) : value;
  },
});
