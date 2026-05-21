import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { ArrowLeft, CalendarDays, Mail, MessageSquareText, Sparkles } from "lucide-react";
import { db } from "@/db";
import {
  aiPersonSummaries,
  aiThreadSummaries,
  contactMethods,
  emailThreads,
  notes,
  outreachTasks,
  people,
  personThreadLinks,
} from "@/db/schema";
import { requirePrivatePageSession } from "@/lib/server-session";
import { NoteComposer } from "@/components/people/NoteComposer";
import { AppNav } from "@/components/AppNav";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(value);
}

export default async function PersonProfilePage({
  params,
}: {
  params: Promise<{ personId: string }>;
}) {
  const session = await requirePrivatePageSession();
  const { personId } = await params;

  const [person] = await db
    .select()
    .from(people)
    .where(and(eq(people.id, personId), eq(people.userId, session.user.id)))
    .limit(1);

  if (!person) notFound();

  const [methods, summaryRows, noteRows, taskRows, links] = await Promise.all([
    db.select().from(contactMethods).where(eq(contactMethods.personId, person.id)),
    db
      .select()
      .from(aiPersonSummaries)
      .where(eq(aiPersonSummaries.personId, person.id))
      .orderBy(desc(aiPersonSummaries.createdAt))
      .limit(1),
    db.select().from(notes).where(eq(notes.personId, person.id)).orderBy(desc(notes.createdAt)),
    db
      .select()
      .from(outreachTasks)
      .where(eq(outreachTasks.personId, person.id))
      .orderBy(desc(outreachTasks.priority)),
    db.select().from(personThreadLinks).where(eq(personThreadLinks.personId, person.id)),
  ]);

  const threads = [];
  for (const link of links) {
    const [thread] = await db.select().from(emailThreads).where(eq(emailThreads.id, link.threadId)).limit(1);
    if (!thread) continue;
    const [threadAi] = await db
      .select()
      .from(aiThreadSummaries)
      .where(eq(aiThreadSummaries.threadId, thread.id))
      .orderBy(desc(aiThreadSummaries.createdAt))
      .limit(1);
    threads.push({ thread, summary: threadAi });
  }

  const summary = summaryRows[0];
  const activeTask = taskRows.find((task) => task.status === "queued") ?? taskRows[0];

  return (
    <main className="min-h-screen bg-white px-6 py-10 text-neutral-950">
      <AppNav />
      <div className="mx-auto mt-14 max-w-7xl">
        <Link href="/people" className="inline-flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-neutral-950">
          <ArrowLeft className="h-4 w-4" />
          People
        </Link>

        <header className="mt-8 grid gap-8 border-b border-neutral-200 pb-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <h1 className="text-5xl font-semibold tracking-tight md:text-7xl">{person.name}</h1>
            <p className="mt-4 text-lg text-neutral-600">{person.primaryEmail}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <span className="border border-neutral-300 px-3 py-1 text-sm capitalize">{person.relationshipType}</span>
              <span className="border border-neutral-300 px-3 py-1 text-sm capitalize">{person.reviewStatus.replace("_", " ")}</span>
              <span className="border border-neutral-300 px-3 py-1 text-sm">Priority {person.importanceScore}</span>
              <span className="border border-neutral-300 px-3 py-1 text-sm">Last contact {formatDate(person.lastContactedAt)}</span>
            </div>
          </div>
          <div className="border border-neutral-200 p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <h2 className="text-lg font-semibold">Relationship summary</h2>
            </div>
            <p className="mt-4 text-neutral-700">{summary?.summary ?? "No relationship summary yet."}</p>
            {summary?.whyTheyMatter && (
              <p className="mt-4 border-t border-neutral-200 pt-4 text-sm text-neutral-600">{summary.whyTheyMatter}</p>
            )}
            {summary?.mentorSignalScore !== undefined && (
              <p className="mt-4 text-sm font-medium text-neutral-900">
                Mentor signal: {summary.mentorSignalScore}/100{summary.needsReview ? " · needs review" : ""}
              </p>
            )}
          </div>
        </header>

        <section className="grid gap-8 py-8 lg:grid-cols-[0.8fr_1.2fr]">
          <aside className="space-y-6">
            <div className="border border-neutral-200 p-5">
              <h2 className="text-lg font-semibold">Contact methods</h2>
              <div className="mt-4 space-y-3 text-sm">
                {methods.map((method) => (
                  <div key={method.id} className="flex items-center gap-2 text-neutral-700">
                    <Mail className="h-4 w-4 text-neutral-400" />
                    <span>{method.value}</span>
                  </div>
                ))}
                {person.linkedInUrl && (
                  <Link href={person.linkedInUrl} className="block text-neutral-700 underline">
                    LinkedIn
                  </Link>
                )}
                {person.phone && <p className="text-neutral-700">{person.phone}</p>}
                {person.instagramUrl && (
                  <Link href={person.instagramUrl} className="block text-neutral-700 underline">
                    Instagram
                  </Link>
                )}
                {person.websiteUrl && (
                  <Link href={person.websiteUrl} className="block text-neutral-700 underline">
                    Website
                  </Link>
                )}
              </div>
            </div>

            {activeTask && (
              <div className="border border-neutral-200 p-5">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" />
                  <h2 className="text-lg font-semibold">Mentor signal</h2>
                </div>
                <p className="mt-4 whitespace-pre-wrap text-sm text-neutral-600">{activeTask.reason}</p>
              </div>
            )}

            <NoteComposer personId={person.id} />
          </aside>

          <div className="space-y-8">
            <section>
              {summary && (
                <div className="mb-8 grid gap-3 md:grid-cols-3">
                  {[
                    ["Notable advice/help", summary.notableAdvice],
                    ["Personal details", summary.personalDetails],
                    ["Open loops", summary.openLoops],
                  ].map(([label, value]) => (
                    <div key={label} className="border border-neutral-200 p-4">
                      <h3 className="text-sm font-semibold text-neutral-950">{label}</h3>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-600">
                        {value || "No evidence captured yet."}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <h2 className="mb-4 text-xl font-semibold">Manual notes</h2>
              <div className="space-y-3">
                {noteRows.map((note) => (
                  <article key={note.id} className="border border-neutral-200 p-4">
                    <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-800">{note.body}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-500">
                      <span>{formatDate(note.createdAt)}</span>
                      {note.tags.map((tag) => (
                        <span key={tag}>#{tag}</span>
                      ))}
                    </div>
                  </article>
                ))}
                {noteRows.length === 0 && (
                  <p className="border border-neutral-200 p-4 text-sm text-neutral-500">No notes yet.</p>
                )}
              </div>
            </section>

            <section>
              <div className="mb-4 flex items-center gap-2">
                <MessageSquareText className="h-5 w-5" />
                <h2 className="text-xl font-semibold">Email threads</h2>
              </div>
              <div className="space-y-3">
                {threads.map(({ thread, summary: threadAi }) => (
                  <article key={thread.id} className="border border-neutral-200 p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <h3 className="font-semibold">{thread.subject || "Untitled thread"}</h3>
                      <span className="text-sm text-neutral-500">{formatDate(thread.lastMessageAt)}</span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-neutral-700">
                      {threadAi?.summary ?? thread.snippet ?? "No thread summary yet."}
                    </p>
                    <p className="mt-3 text-xs text-neutral-500">
                      {thread.messageCount} messages · {thread.userReplied ? "mutual exchange" : "inbound"}
                    </p>
                  </article>
                ))}
                {threads.length === 0 && (
                  <p className="border border-neutral-200 p-4 text-sm text-neutral-500">No threads linked yet.</p>
                )}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
