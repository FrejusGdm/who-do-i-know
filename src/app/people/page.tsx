import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Search, SlidersHorizontal } from "lucide-react";
import { db } from "@/db";
import { aiPersonSummaries, people } from "@/db/schema";
import { requirePrivatePageSession } from "@/lib/server-session";
import { AppNav } from "@/components/AppNav";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(value);
}

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; status?: string }>;
}) {
  const session = await requirePrivatePageSession();
  const params = await searchParams;
  const query = (params.q ?? "").trim().toLowerCase();
  const type = (params.type ?? "").trim().toLowerCase();
  const status = (params.status ?? "").trim().toLowerCase();

  const [personRows, summaries] = await Promise.all([
    db.select().from(people).where(eq(people.userId, session.user.id)).orderBy(desc(people.importanceScore)),
    db.select().from(aiPersonSummaries).orderBy(desc(aiPersonSummaries.createdAt)),
  ]);

  const latestSummary = new Map<string, typeof summaries[number]>();
  for (const summary of summaries) {
    if (!latestSummary.has(summary.personId)) latestSummary.set(summary.personId, summary);
  }

  const filtered = personRows.filter((person) => {
    if (!status && person.reviewStatus === "archived") return false;
    if (status && person.reviewStatus !== status) return false;
    const summary = latestSummary.get(person.id);
    const haystack = [
      person.name,
      person.primaryEmail,
      person.organization,
      person.role,
      person.relationshipType,
      summary?.summary,
      summary?.whyTheyMatter,
      summary?.howYouKnowThem,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return (!query || haystack.includes(query)) && (!type || person.relationshipType === type);
  });

  const types = Array.from(new Set(personRows.map((person) => person.relationshipType).filter(Boolean)));
  const statuses = ["new", "needs_review", "confirmed", "not_mentor", "archived"];

  return (
    <main className="min-h-screen bg-white px-6 py-10 text-neutral-950">
      <AppNav />
      <div className="mx-auto mt-14 max-w-7xl">
        <header className="flex flex-col gap-5 border-b border-neutral-200 pb-7 md:flex-row md:items-end md:justify-between">
          <div>
            <Link href="/dashboard" className="text-sm font-medium text-neutral-500">
              Dashboard
            </Link>
            <h1 className="mt-3 text-5xl font-semibold tracking-tight">People</h1>
            <p className="mt-3 text-neutral-600">
              Search by name, email, topic, organization, relationship type, or summary text.
            </p>
          </div>
          <form className="flex w-full flex-col gap-2 md:w-[720px] md:flex-row">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Search relationship memory"
                className="h-11 w-full border border-neutral-300 pl-10 pr-3 text-sm outline-none focus:border-neutral-950"
              />
            </label>
            <label className="relative">
              <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <select
                name="type"
                defaultValue={params.type ?? ""}
                className="h-11 w-full border border-neutral-300 bg-white pl-10 pr-8 text-sm outline-none focus:border-neutral-950 md:w-44"
              >
                <option value="">All types</option>
                {types.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <select
              name="status"
              defaultValue={params.status ?? ""}
              className="h-11 w-full border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-950 md:w-40"
            >
              <option value="">Active</option>
              {statuses.map((item) => (
                <option key={item} value={item}>
                  {item.replace("_", " ")}
                </option>
              ))}
            </select>
            <button className="h-11 bg-neutral-950 px-5 text-sm font-medium text-white">
              Search
            </button>
          </form>
        </header>

        <div className="mt-8 overflow-hidden border border-neutral-200">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Person</th>
                <th className="px-4 py-3 font-medium">Relationship</th>
                <th className="px-4 py-3 font-medium">Review</th>
                <th className="px-4 py-3 font-medium">Summary</th>
                <th className="px-4 py-3 font-medium">Last contact</th>
                <th className="px-4 py-3 font-medium">Priority</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((person) => {
                const summary = latestSummary.get(person.id);
                return (
                  <tr key={person.id} className="border-t border-neutral-200 align-top">
                    <td className="px-4 py-4">
                      <Link href={`/people/${person.id}`} className="font-semibold hover:underline">
                        {person.name}
                      </Link>
                      <p className="mt-1 text-neutral-500">{person.primaryEmail}</p>
                      {person.organization && <p className="mt-1 text-neutral-500">{person.organization}</p>}
                    </td>
                    <td className="px-4 py-4 capitalize">{person.relationshipType}</td>
                    <td className="px-4 py-4 capitalize">{person.reviewStatus.replace("_", " ")}</td>
                    <td className="max-w-xl px-4 py-4 text-neutral-700">
                      {summary?.summary ?? "No summary yet."}
                    </td>
                    <td className="px-4 py-4">{formatDate(person.lastContactedAt)}</td>
                    <td className="px-4 py-4">{person.importanceScore}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td className="px-4 py-12 text-neutral-500" colSpan={6}>
                    No matching people found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
