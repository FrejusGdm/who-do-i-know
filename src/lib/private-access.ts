export function isAuthorizedEmail(email: string, env: Record<string, string | undefined> = process.env): boolean {
  const configured = env.PRIVATE_USER_EMAILS ?? env.PRIVATE_USER_EMAIL;
  if (!configured?.trim()) return false;
  return configured.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean).includes(email.trim().toLowerCase());
}

export function productionAuthConfiguration(env: Record<string, string | undefined> = process.env) {
  if (env.NODE_ENV !== "production") return;
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32 || env.BETTER_AUTH_SECRET === "development-only-secret-change-me-before-production") {
    throw new Error("A strong BETTER_AUTH_SECRET is required in production");
  }
  const url = env.BETTER_AUTH_URL ? new URL(env.BETTER_AUTH_URL) : null;
  if (!url || url.protocol !== "https:") throw new Error("BETTER_AUTH_URL must use HTTPS in production");
  if (!(env.PRIVATE_USER_EMAILS ?? env.PRIVATE_USER_EMAIL)?.trim()) throw new Error("Configure the private owner allowlist before starting production");
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new Error("Google sign-in is not configured");
}
