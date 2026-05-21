import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";

type SessionResult =
  | { session: { user: { id: string; email: string; name: string }; session: { id: string } }; error?: never }
  | { session?: never; error: NextResponse };

type JobResult =
  | { job: typeof jobs.$inferSelect; error?: never }
  | { job?: never; error: NextResponse };

export function isAuthorizedEmail(email: string): boolean {
  const configured = process.env.PRIVATE_USER_EMAILS ?? process.env.PRIVATE_USER_EMAIL;
  if (!configured) return true;

  const allowed = configured
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return allowed.includes(email.toLowerCase());
}

export async function requireSession(): Promise<SessionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!isAuthorizedEmail(session.user.email)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session };
}

export async function requireJobOwnership(
  jobId: string,
  userEmail: string
): Promise<JobResult> {
  const [job] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);

  if (!job || job.userEmail !== userEmail) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  return { job };
}
