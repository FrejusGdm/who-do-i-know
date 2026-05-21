import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Download, Mail, NotebookPen, Radar, Users } from "lucide-react";
import { db } from "@/db";
import { emailThreads, notes, outreachTasks, people, syncRuns } from "@/db/schema";
import { requirePrivatePageSession } from "@/lib/server-session";
import { Button } from "@/components/ui/button";
import { AppNav } from "@/components/AppNav";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(value);
}

export default async function DashboardPage() {
  const session = await requirePrivatePageSession();
  const [personRows, threadRows, noteRows, outreachRows, latestSync] = await Promise.all([
    db.select().from(people).where(eq(people.userId, session.user.id)),
    db.select().from(emailThreads).where(eq(emailThreads.userId, session.user.id)),
    db.select().from(notes).where(eq(notes.userId, session.user.id)),
    db.select().from(outreachTasks).where(eq(outreachTasks.userId, session.user.id)),
    db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.userId, session.user.id))
      .orderBy(desc(syncRuns.startedAt))
      .limit(1),
  ]);

  const activePeople = personRows.filter((person) => person.reviewStatus !== "archived");
  const recentPeople = [...activePeople]
    .sort((a, b) => (b.lastContactedAt?.getTime() ?? 0) - (a.lastContactedAt?.getTime() ?? 0))
    .slice(0, 6);
  const queued = outreachRows.filter((task) => task.status === "queued" || task.status === "needs_review");

  return (
    <main className="min-h-screen bg-white px-6 py-10 text-neutral-950">
      <AppNav />
      <div className="mx-auto mt-14 max-w-7xl">
        <header className="flex flex-col gap-6 border-b border-neutral-200 pb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <Link href="/" className="text-sm font-medium text-neutral-500">
              WhoDoYouKnow
            </Link>
            <h1 className="mt-3 max-w-3xl text-5xl font-semibold tracking-tight md:text-7xl">
              Relationship memory
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-neutral-600">
              Private CRM for the people, threads, notes, summaries, and follow-ups pulled from your Gmail history.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild className="rounded-md bg-neutral-950 text-white hover:bg-neutral-800">
              <Link href="/filter">
                <Mail className="mr-2 h-4 w-4" />
                Sync Gmail
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-md">
              <Link href="/exports">
                <Download className="mr-2 h-4 w-4" />
                Exports
              </Link>
            </Button>
          </div>
        </header>

        <section className="grid gap-3 py-8 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Active people", value: activePeople.length, icon: Users },
            { label: "Gmail threads", value: threadRows.length, icon: Mail },
            { label: "Manual notes", value: noteRows.length, icon: NotebookPen },
            { label: "Mentor candidates", value: queued.length, icon: Radar },
          ].map((stat) => (
            <div key={stat.label} className="border border-neutral-200 p-5">
              <div className="flex items-center justify-between text-neutral-500">
                <span className="text-sm">{stat.label}</span>
                <stat.icon className="h-4 w-4" />
              </div>
              <p className="mt-6 text-4xl font-semibold tracking-tight">{stat.value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-8 lg:grid-cols-[1.4fr_0.8fr]">
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Recent people</h2>
              <Link href="/people" className="text-sm font-medium text-neutral-600 hover:text-neutral-950">
                View all
              </Link>
            </div>
            <div className="overflow-hidden border border-neutral-200">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-left text-neutral-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Last contact</th>
                    <th className="px-4 py-3 font-medium">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPeople.map((person) => (
                    <tr key={person.id} className="border-t border-neutral-200">
                      <td className="px-4 py-4">
                        <Link href={`/people/${person.id}`} className="font-medium hover:underline">
                          {person.name}
                        </Link>
                        <p className="text-neutral-500">{person.primaryEmail}</p>
                      </td>
                      <td className="px-4 py-4 capitalize">{person.relationshipType}</td>
                      <td className="px-4 py-4">{formatDate(person.lastContactedAt)}</td>
                      <td className="px-4 py-4">{person.importanceScore}</td>
                    </tr>
                  ))}
                  {recentPeople.length === 0 && (
                    <tr>
                      <td className="px-4 py-10 text-neutral-500" colSpan={4}>
                        No people yet. Start a Gmail sync to populate your relationship memory.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="space-y-6">
            <div className="border border-neutral-200 p-5">
              <h2 className="text-xl font-semibold">Latest sync</h2>
              {latestSync[0] ? (
                <div className="mt-4 space-y-2 text-sm text-neutral-600">
                  <p>Status: <span className="font-medium text-neutral-950">{latestSync[0].status}</span></p>
                  <p>Started: {formatDate(latestSync[0].startedAt)}</p>
                  <p>Stats: {JSON.stringify(latestSync[0].stats)}</p>
                </div>
              ) : (
                <p className="mt-4 text-sm text-neutral-600">No sync has run yet.</p>
              )}
            </div>
            <div className="border border-neutral-200 p-5">
              <h2 className="text-xl font-semibold">Next actions</h2>
              <div className="mt-4 flex flex-col gap-3">
                <Button asChild variant="outline" className="justify-start rounded-md">
                  <Link href="/outreach">Open Mentor Finder</Link>
                </Button>
                <Button asChild variant="outline" className="justify-start rounded-md">
                  <Link href="/review">Open review sheet</Link>
                </Button>
                <Button asChild variant="outline" className="justify-start rounded-md">
                  <Link href="/people?q=china">Find China-related people</Link>
                </Button>
                <Button asChild variant="outline" className="justify-start rounded-md">
                  <Link href="/people?q=mentor">Find mentors</Link>
                </Button>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
