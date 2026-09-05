import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePrivatePageSession } from "@/lib/server-session";
import { networkCircles, networkPeople } from "@/lib/network/queries";
import {
  NetworkShell,
  PageHeading,
  fieldClass,
  secondaryButtonClass,
} from "@/components/network/NetworkShell";
import { CircleMembership } from "@/components/network/CircleMembership";
export const dynamic = "force-dynamic";
export default async function CirclePage({
  params,
  searchParams,
}: {
  params: Promise<{ circleId: string }>;
  searchParams: Promise<{ q?: string; metState?: string; page?: string }>;
}) {
  const session = await requirePrivatePageSession();
  const { circleId } = await params;
  const search = await searchParams;
  const circles = await networkCircles(session.user.id);
  const circle = circles.find((item) => item.id === circleId);
  if (!circle) notFound();
  const [members, candidates] = await Promise.all([
    networkPeople(session.user.id, {
      circle: circleId,
      metState: search.metState,
      page: search.page,
    }),
    networkPeople(session.user.id, { q: search.q }),
  ]);
  const available = candidates.people.filter(
    (person) => !circle.personIds.includes(person.id),
  );
  return (
    <NetworkShell active="Circles">
      <PageHeading
        eyebrow={circle.cohortLabel ?? "Circles"}
        title={circle.name}
        description={`${circle.personIds.length} people${circle.expectedCount ? ` of ${circle.expectedCount} expected` : ""}. Membership keeps the group together; each relationship has its own rhythm.`}
        action={
          <Link href="/people/new" className={secondaryButtonClass}>
            Add someone new
          </Link>
        }
      />
      <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <section aria-label="Circle members">
          <form className="mb-5 flex flex-wrap items-end gap-3">
            <label className="space-y-2">
              <span className="block text-sm">Meeting status</span>
              <select
                name="metState"
                defaultValue={search.metState ?? ""}
                className={fieldClass}
              >
                <option value="">Everyone</option>
                <option value="not_met">Not met</option>
                <option value="met">Met</option>
                <option value="needs_context">Needs context</option>
              </select>
            </label>
            <button className={secondaryButtonClass}>Filter</button>
          </form>
          <ul className="divide-y divide-[#deded5] rounded-lg border border-[#deded5] bg-white">
            {members.people.map((person) => (
              <li key={person.id} className="space-y-3 p-5">
                <Link
                  href={`/people/${person.id}`}
                  className="text-lg font-medium hover:underline"
                >
                  {person.name}
                </Link>
                <p className="text-sm text-[#62685e]">
                  {person.organization || person.metState.replaceAll("_", " ")}
                </p>
                <CircleMembership
                  circleId={circleId}
                  removePersonId={person.id}
                />
              </li>
            ))}
          </ul>
          {members.people.length === 0 && (
            <p className="py-7 text-[#62685e]">
              No people in this view. Add someone using the form or try another
              filter.
            </p>
          )}
          <nav aria-label="Circle member pages" className="mt-5 flex gap-3">
            {members.page > 1 && (
              <Link
                className={secondaryButtonClass}
                href={`?page=${members.page - 1}&metState=${encodeURIComponent(search.metState ?? "")}`}
              >
                Previous
              </Link>
            )}
            {members.hasMore && (
              <Link
                className={secondaryButtonClass}
                href={`?page=${members.page + 1}&metState=${encodeURIComponent(search.metState ?? "")}`}
              >
                Next
              </Link>
            )}
          </nav>
        </section>
        <section className="h-fit space-y-5 rounded-lg border border-[#deded5] bg-white p-6">
          <h2 className="text-xl font-medium text-balance">
            Bring someone into this circle
          </h2>
          <form className="space-y-3">
            <label className="block space-y-2">
              <span>Find an existing person</span>
              <input
                name="q"
                defaultValue={search.q}
                className={fieldClass}
                placeholder="Search by name or notes"
              />
            </label>
            <button className={secondaryButtonClass}>Find people</button>
          </form>
          <CircleMembership circleId={circleId} people={available} />
          {candidates.hasMore && (
            <p className="text-sm text-[#62685e]">
              Showing the first 50 matches. Search for a name to narrow the
              list.
            </p>
          )}
        </section>
      </div>
    </NetworkShell>
  );
}
