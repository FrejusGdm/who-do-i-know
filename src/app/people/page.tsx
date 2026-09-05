import Link from "next/link";
import { z } from "zod";
import { requirePrivatePageSession } from "@/lib/server-session";
import { networkCircles, networkPeople } from "@/lib/network/queries";
import {
  NetworkShell,
  PageHeading,
  buttonClass,
  fieldClass,
  secondaryButtonClass,
} from "@/components/network/NetworkShell";
export const dynamic = "force-dynamic";

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    circle?: string;
    type?: string;
    status?: string;
    page?: string;
  }>;
}) {
  const session = await requirePrivatePageSession();
  const raw = await searchParams;
  const params = {
    ...raw,
    circle:
      raw.circle && z.string().uuid().safeParse(raw.circle).success
        ? raw.circle
        : undefined,
  };
  const [result, circles] = await Promise.all([
    networkPeople(session.user.id, params),
    networkCircles(session.user.id),
  ]);
  const pageLink = (page: number) =>
    `/people?${new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter((pair): pair is [string, string] => typeof pair[1] === "string")), page: String(page) })}`;
  return (
    <NetworkShell active="People">
      <PageHeading
        title="Your people"
        description="A name, a shared story, a reason to stay close."
        action={
          <Link className={buttonClass} href="/people/new">
            Add someone
          </Link>
        }
      />
      <form className="mb-7 grid grid-cols-2 items-end gap-3 lg:grid-cols-[2fr_1fr_1fr_auto]">
        <label className="col-span-2 space-y-2 lg:col-span-1">
          <span className="text-sm">Search people and notes</span>
          <input
            className={fieldClass}
            name="q"
            defaultValue={params.q}
            maxLength={200}
            placeholder="Name, organization, something you discussed…"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm">Circle</span>
          <select
            className={fieldClass}
            name="circle"
            defaultValue={params.circle ?? ""}
          >
            <option value="">All circles</option>
            {circles.map((circle) => (
              <option key={circle.id} value={circle.id}>
                {circle.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-sm">Show</span>
          <select
            className={fieldClass}
            name="status"
            defaultValue={params.status ?? ""}
          >
            <option value="">Active people</option>
            <option value="archived">Archived people</option>
          </select>
        </label>
        {params.type && <input type="hidden" name="type" value={params.type} />}
        <button className={`${secondaryButtonClass} col-span-2 lg:col-span-1`}>
          Search
        </button>
      </form>
      <p className="mb-3 text-sm tabular-nums text-[#62685e]">
        {result.total} {result.total === 1 ? "person" : "people"}
        {params.q ? ` matching “${params.q}”` : " in your notebook"}
      </p>
      <div className="overflow-hidden rounded-lg border border-[#deded5] bg-white">
        <div className="hidden grid-cols-[2fr_1fr_1fr] gap-4 border-b border-[#deded5] px-5 py-3 text-sm text-[#62685e] md:grid">
          <span>Person</span>
          <span>Relationship</span>
          <span>Next check-in</span>
        </div>
        <ul className="divide-y divide-[#deded5]">
          {result.people.map((person) => (
            <li key={person.id}>
              <Link
                href={`/people/${person.id}`}
                className="grid gap-2 px-5 py-5 hover:bg-[#fafbf7] md:grid-cols-[2fr_1fr_1fr] md:items-center md:gap-4"
              >
                <div className="min-w-0">
                  <span className="text-lg font-medium">{person.name}</span>
                  <p className="mt-1 truncate text-sm text-[#62685e]">
                    {person.organization ||
                      person.primaryEmail ||
                      "No contact details yet"}
                  </p>
                  <p className="mt-1 text-sm text-[#62685e]">
                    Last exchange: {person.lastMutualOn ?? "unknown"}
                    {person.lastOutboundOn
                      ? ` · You reached out ${person.lastOutboundOn}`
                      : ""}
                  </p>
                </div>
                <span className="text-sm capitalize text-[#62685e]">
                  {person.relationshipType === "unknown"
                    ? "Getting to know them"
                    : person.relationshipType}
                  <span className="ml-2 md:ml-0 md:mt-1 md:block">
                    {person.metState.replaceAll("_", " ")}
                  </span>
                </span>
                <span className="text-sm text-[#43664F]">
                  {person.plan
                    ? person.plan.status === "paused"
                      ? "Reminders paused"
                      : person.plan.snoozedUntil
                        ? `Snoozed to ${person.plan.snoozedUntil}`
                        : person.plan.nextDueOn
                    : "No rhythm set"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {result.people.length === 0 && (
          <div className="px-5 py-12">
            <h2 className="text-xl font-medium text-balance">
              {params.q || params.circle
                ? "No one matches just yet"
                : "Start with someone you want to keep close"}
            </h2>
            <p className="mt-2 text-pretty text-[#62685e]">
              {params.q || params.circle
                ? "Try a different name or clear your filters."
                : "A name is enough. You can fill in their story as you go."}
            </p>
            <Link
              className={`${secondaryButtonClass} mt-5`}
              href={params.q || params.circle ? "/people" : "/people/new"}
            >
              {params.q || params.circle ? "Clear filters" : "Add someone"}
            </Link>
          </div>
        )}
      </div>
      <nav
        aria-label="People pages"
        className="mt-6 flex items-center justify-between gap-3"
      >
        <span className="text-sm tabular-nums text-[#62685e]">
          Page {result.page}
        </span>
        <div className="flex gap-3">
          {result.page > 1 && (
            <Link
              className={secondaryButtonClass}
              href={pageLink(result.page - 1)}
            >
              Previous
            </Link>
          )}
          {result.hasMore && (
            <Link
              className={secondaryButtonClass}
              href={pageLink(result.page + 1)}
            >
              Next
            </Link>
          )}
        </div>
      </nav>
    </NetworkShell>
  );
}
