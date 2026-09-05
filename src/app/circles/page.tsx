import Link from "next/link";
import { requirePrivatePageSession } from "@/lib/server-session";
import { networkCircles } from "@/lib/network/queries";
import { NetworkShell, PageHeading } from "@/components/network/NetworkShell";
import { CreateCircleForm } from "@/components/network/CreateCircleForm";
export const dynamic = "force-dynamic";
export default async function CirclesPage() {
  const session = await requirePrivatePageSession();
  const circles = await networkCircles(session.user.id);
  return (
    <NetworkShell active="Circles">
      <PageHeading
        title="The circles in your life"
        description="Keep a cohort together, or make a small circle for people you want to stay close to."
      />
      <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <section aria-label="Your circles" className="space-y-4">
          {circles.map((circle) => (
            <Link
              key={circle.id}
              href={`/circles/${circle.id}`}
              className="block rounded-lg border border-[#deded5] bg-white p-6 hover:border-[#43664F]"
            >
              <p className="text-sm capitalize text-[#62685e]">
                {circle.cohortLabel ?? circle.kind}
              </p>
              <h2 className="mt-3 text-xl font-medium text-balance">
                {circle.name}
              </h2>
              <p className="mt-3 text-sm tabular-nums text-[#62685e]">
                {circle.personIds.length}{" "}
                {circle.personIds.length === 1 ? "person" : "people"}
                {circle.expectedCount
                  ? ` · ${circle.expectedCount} expected`
                  : ""}
              </p>
            </Link>
          ))}
          {circles.length === 0 && (
            <div className="rounded-lg border border-dashed border-[#c8ccc1] p-7">
              <h2 className="text-xl font-medium text-balance">
                A place for your people
              </h2>
              <p className="mt-3 text-pretty leading-7 text-[#62685e]">
                Start with Dartmouth mentors or Schwarzman classmates. Add
                people when you’re ready.
              </p>
              <a
                href="#create-circle"
                className="mt-4 inline-flex min-h-11 items-center text-[#43664F] underline"
              >
                Create your first circle
              </a>
            </div>
          )}
        </section>
        <section
          id="create-circle"
          className="rounded-lg border border-[#deded5] bg-white p-6"
        >
          <h2 className="mb-5 text-xl font-medium text-balance">
            Make a circle
          </h2>
          <CreateCircleForm />
        </section>
      </div>
    </NetworkShell>
  );
}
