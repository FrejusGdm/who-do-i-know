// Administrator-only tool. Run with the deployed DATABASE_URL, PRIVATE_USER_EMAILS,
// and BETTER_AUTH_URL supplied securely. Never run in public CI or log its environment.
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
const emails = (process.env.PRIVATE_USER_EMAILS ?? "").split(",").map(v=>v.trim().toLowerCase()).filter(Boolean);
if (emails.length !== 1 || !process.env.DATABASE_URL) throw new Error("Configure exactly one private owner and the deployed database");
const origin = new URL(process.env.BETTER_AUTH_URL ?? "");
if (origin.protocol !== "https:") throw new Error("HTTPS is required");
const output = process.argv[2];
if (!output?.startsWith("/private/tmp/") || output.includes("..")) throw new Error("Supply a new private temporary output file");
const token = randomBytes(32).toString("hex");
const hash = createHash("sha256").update(token).digest("hex");
const sql = neon(process.env.DATABASE_URL);
try {
  const results = await sql.transaction([
    sql`INSERT INTO "user" (id,name,email,email_verified) VALUES (${randomUUID()},'Workspace owner',${emails[0]},true) ON CONFLICT (email) DO NOTHING`,
    sql`SELECT id FROM "user" WHERE email=${emails[0]} FOR UPDATE`,
    sql`INSERT INTO owner_setup_tokens (token_hash,user_id,expires_at)
      SELECT ${hash},id,clock_timestamp()+interval '1 hour' FROM "user"
      WHERE email=${emails[0]} AND email_verified=true
        AND NOT EXISTS (SELECT 1 FROM account WHERE user_id="user".id AND provider_id='credential')
      ON CONFLICT (user_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at,consumed_at=NULL
      RETURNING expires_at`,
  ]);
  if(results[2].length!==1) throw new Error("Owner is not eligible for initial setup");
  writeFileSync(output, JSON.stringify({url:`${origin.origin}/setup#${token}`,expiresAt:results[2][0].expires_at}), {mode:0o600,flag:"wx"});
  console.log("Setup link written to the private output file. It expires in one hour.");
} catch { console.error("Could not issue setup link. Check owner eligibility and database access."); process.exitCode=1; }
