import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  aiPersonSummaries,
  contactMethods,
  emailThreads,
  personThreadLinks,
} from "@/db/schema";
export async function ImportedContext({
  userId,
  personId,
}: {
  userId: string;
  personId: string;
}) {
  // The parent verifies person ownership; thread joins repeat it because links can be imported.
  const [summaries, methods, threads] = await Promise.all([
    db
      .select()
      .from(aiPersonSummaries)
      .where(eq(aiPersonSummaries.personId, personId))
      .orderBy(desc(aiPersonSummaries.createdAt))
      .limit(1),
    db
      .select()
      .from(contactMethods)
      .where(eq(contactMethods.personId, personId)),
    db
      .select({
        id: emailThreads.id,
        subject: emailThreads.subject,
        snippet: emailThreads.snippet,
        lastMessageAt: emailThreads.lastMessageAt,
      })
      .from(emailThreads)
      .innerJoin(
        personThreadLinks,
        and(
          eq(personThreadLinks.threadId, emailThreads.id),
          eq(personThreadLinks.personId, personId),
        ),
      )
      .where(eq(emailThreads.userId, userId))
      .orderBy(desc(emailThreads.lastMessageAt))
      .limit(25),
  ]);
  const summary = summaries[0];
  if (!summary && !methods.length && !threads.length) return null;
  return (
    <details className="rounded-lg border border-[#deded5] bg-white p-5">
      <summary className="min-h-11 cursor-pointer font-medium">
        Imported context and earlier analysis
      </summary>
      <p className="mb-5 text-sm leading-6 text-[#62685e]">
        Imported email activity and earlier AI summaries provide context. They
        do not establish confirmed contact dates or change your reminders.
      </p>
      {summary && (
        <article className="mb-5 border-l-2 border-[#c8ccc1] pl-4">
          <h3 className="text-sm font-medium">
            Earlier AI summary · unreviewed
          </h3>
          <p className="mt-2 whitespace-pre-wrap leading-7 text-[#62685e]">
            {summary.summary}
          </p>
          {summary.notableAdvice && (
            <p className="mt-3 whitespace-pre-wrap text-sm text-[#62685e]">
              {summary.notableAdvice}
            </p>
          )}
        </article>
      )}
      {methods.length > 0 && (
        <ul className="mb-5 space-y-2 text-sm">
          {methods.map((method) => (
            <li className="break-words" key={method.id}>
              {method.type}: {method.value}
            </li>
          ))}
        </ul>
      )}
      <ul className="divide-y divide-[#deded5]">
        {threads.map((thread) => (
          <li key={thread.id} className="py-4">
            <h3 className="font-medium">
              {thread.subject || "Untitled email thread"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-[#62685e]">
              {thread.snippet || "No preview available"}
            </p>
            <p className="mt-2 text-sm text-[#62685e]">
              Imported email ·{" "}
              {thread.lastMessageAt?.toISOString().slice(0, 10) ??
                "Date unknown"}
            </p>
          </li>
        ))}
      </ul>
    </details>
  );
}
