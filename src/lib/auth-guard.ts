import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { isAuthorizedEmail } from "./private-access";
export { isAuthorizedEmail } from "./private-access";

type SessionResult =
  | { session: { user: { id: string; email: string; name: string; emailVerified: boolean }; session: { id: string } }; error?: never }
  | { session?: never; error: NextResponse };

type JobResult =
  | { job: typeof jobs.$inferSelect; error?: never }
  | { job?: never; error: NextResponse };

export async function requireSession(): Promise<SessionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!session.user.emailVerified || !isAuthorizedEmail(session.user.email)) {
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
