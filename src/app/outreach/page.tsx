import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowLeft, Radar } from "lucide-react";
import { db } from "@/db";
import { outreachTasks, people } from "@/db/schema";
import { requirePrivatePageSession } from "@/lib/server-session";
import { OutreachActions } from "@/components/outreach/OutreachActions";
import { AppNav } from "@/components/AppNav";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(value);
}

const tabs = [
  { id: "queue", label: "Review queue" },
  { id: "confirmed", label: "Confirmed mentors" },
  { id: "needs_review", label: "Needs review" },
  { id: "hidden", label: "Hidden" },
] as const;

function tabForTask(status: string, relationshipType?: string, reviewStatus?: string) {
  if (status === "archived" || status === "not_mentor" || status === "friend" || reviewStatus === "archived" || reviewStatus === "not_mentor") {
    return "hidden";
  }
  if (status === "needs_review" || reviewStatus === "needs_review") return "needs_review";
  if (status === "confirmed" || relationshipType === "mentor") return "confirmed";
  return "queue";
}

function labelForStatus(status: string, relationshipType?: string, reviewStatus?: string) {
  if (reviewStatus === "archived" || status === "archived") return "archived";
  if (status === "not_mentor" || reviewStatus === "not_mentor") return "not a mentor";
  if (status === "friend" || relationshipType === "friend") return "friend";
  if (status === "confirmed" || relationshipType === "mentor") return "mentor";
  if (status === "needs_review" || reviewStatus === "needs_review") return "needs review";
  return "review";
}

export default async function OutreachPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requirePrivatePageSession();
  const params = await searchParams;
  const selectedTab = tabs.some((tab) => tab.id === params.tab) ? params.tab! : "queue";
  const [tasks, personRows] = await Promise.all([
    db
      .select()
      .from(outreachTasks)
      .where(eq(outreachTasks.userId, session.user.id))
      .orderBy(desc(outreachTasks.priority)),
    db.select().from(people).where(eq(people.userId, session.user.id)),
  ]);

  const peopleById = new Map(personRows.map((person) => [person.id, person]));
  const tasksWithPeople = tasks
    .map((task) => ({ task, person: peopleById.get(task.personId) }))
    .filter((item): item is { task: typeof tasks[number]; person: typeof personRows[number] } => Boolean(item.person));

  const counts = tabs.reduce<Record<string, number>>((acc, tab) => {
    acc[tab.id] = tasksWithPeople.filter(({ task, person }) => tabForTask(task.status, person.relationshipType, person.reviewStatus) === tab.id).length;
    return acc;
  }, {});
  const visibleTasks = tasksWithPeople.filter(({ task, person }) => tabForTask(task.status, person.relationshipType, person.reviewStatus) === selectedTab);

  return (
    <main className="min-h-screen bg-white px-6 py-10 text-neutral-950">
      <AppNav />
      <div className="mx-auto mt-14 max-w-5xl">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-neutral-950">
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
        <header className="mt-8 border-b border-neutral-200 pb-7">
          <div className="flex items-center gap-3">
            <Radar className="h-6 w-6" />
            <h1 className="text-5xl font-semibold tracking-tight">Mentor Finder</h1>
          </div>
          <p className="mt-4 max-w-2xl text-neutral-600">
            Confirm your mentors, route friends out of the mentor workflow, and hide noisy senders without deleting your relationship memory.
          </p>
        </header>

        <div className="mt-6 flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const active = selectedTab === tab.id;
            return (
              <Link
                key={tab.id}
                href={`/outreach?tab=${tab.id}`}
                className={
                  active
                    ? "bg-neutral-950 px-3 py-2 text-sm font-medium text-white"
                    : "border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-600 hover:border-neutral-950 hover:text-neutral-950"
                }
              >
                {tab.label} <span className={active ? "text-neutral-300" : "text-neutral-400"}>{counts[tab.id] ?? 0}</span>
              </Link>
            );
          })}
          <Link
            href="/review"
            className="ml-auto border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-600 hover:border-neutral-950 hover:text-neutral-950"
          >
            Open review sheet
          </Link>
        </div>

        <section className="mt-8 space-y-4">
          {visibleTasks.map(({ task, person }) => {
            return (
              <article key={task.id} className="border border-neutral-200 p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <Link href={`/people/${person.id}`} className="text-xl font-semibold hover:underline">
                      {person.name}
                    </Link>
                    <p className="mt-1 text-sm text-neutral-500">{person.primaryEmail}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="border border-neutral-300 px-2 py-1">Mentor signal {task.priority}</span>
                    <span className="border border-neutral-300 px-2 py-1 capitalize">
                      {labelForStatus(task.status, person.relationshipType, person.reviewStatus)}
                    </span>
                    <span className="border border-neutral-300 px-2 py-1">{formatDate(person.lastContactedAt)}</span>
                  </div>
                </div>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-neutral-700">{task.reason}</p>
                <OutreachActions taskId={task.id} />
              </article>
            );
          })}
          {visibleTasks.length === 0 && (
            <p className="border border-neutral-200 p-6 text-sm text-neutral-500">
              No people in this mentor view yet.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
