import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { requirePrivatePageSession } from "@/lib/server-session";
import {
  networkCircles,
  networkPlannedPeople,
  ownerSettings,
} from "@/lib/network/queries";
import { duePeople } from "@/lib/network/today";
import {
  NetworkShell,
  PageHeading,
  buttonClass,
  secondaryButtonClass,
} from "@/components/network/NetworkShell";
export const dynamic = "force-dynamic";
export default async function DashboardPage() {
  const session = await requirePrivatePageSession();
  const [planned, settings, circles] = await Promise.all([
    networkPlannedPeople(session.user.id),
    ownerSettings(session.user.id),
    networkCircles(session.user.id),
  ]);
  const due = duePeople(planned);
  const greeting = session.user.name.split(" ")[0];
  const date = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: settings.timezone,
  }).format(new Date());
  return (
    <NetworkShell active="Today">
      <PageHeading
        eyebrow={`${date} · ${settings.timezone}`}
        title={`A little time for your people${greeting ? `, ${greeting}` : ""}.`}
        description="Start with someone you’ve been meaning to reach. There doesn’t have to be big news."
        action={
          <Link href="/interviews" className={buttonClass}>
            <Plus className="size-4" aria-hidden />
            Capture a conversation
          </Link>
        }
      />
      <div className="grid items-start gap-8 xl:grid-cols-[1.7fr_1fr]">
        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-medium text-balance">
              Time to reconnect
            </h2>
            <span className="text-sm tabular-nums text-[#62685e]">
              {due.length} {due.length === 1 ? "person" : "people"}
            </span>
          </div>
          <ul className="divide-y divide-[#deded5] overflow-hidden rounded-lg border border-[#deded5] bg-white">
            {due.map((person) => (
              <li key={person.id} className="p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Link
                      href={`/people/${person.id}`}
                      className="text-xl font-medium hover:underline"
                    >
                      {person.name}
                    </Link>
                    <p className="mt-1 text-sm text-[#62685e]">
                      {circles
                        .filter((circle) =>
                          circle.personIds.includes(person.id),
                        )
                        .map((circle) => circle.name)
                        .join(" · ") || person.relationshipType}
                    </p>
                  </div>
                  <span className="rounded-full bg-[#e5eadd] px-3 py-1 text-sm text-[#344e3d]">
                    {person.plan.preferredChannel.replace("_", " ")}
                  </span>
                </div>
                <p className="mt-4 text-sm text-[#43664F]">{person.reason}</p>
                <p className="mt-2 text-sm text-[#62685e]">
                  Last qualifying contact:{" "}
                  {person.plan.lastContactOn ?? "unknown"}
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    className={secondaryButtonClass}
                    href={`/people/${person.id}`}
                  >
                    Open their story
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                  <Link
                    className="inline-flex min-h-11 items-center text-sm text-[#43664F] underline"
                    href={`/people/${person.id}#log-contact`}
                  >
                    Already in touch? Log it
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          {due.length === 0 && (
            <div className="rounded-lg border border-dashed border-[#c8ccc1] px-6 py-10">
              <h3 className="font-serif text-3xl text-balance">
                {planned.length
                  ? "A little breathing room."
                  : "Who would you like to stay close to?"}
              </h3>
              <p className="mt-3 max-w-md text-pretty leading-7 text-[#62685e]">
                {planned.length
                  ? "No check-ins are due right now. You can still record a conversation or spend a moment with someone on your mind."
                  : "Choose someone, remember your shared story, and set a rhythm that feels right. Three calendar months is a good place to start."}
              </p>
              <Link
                className={`${secondaryButtonClass} mt-6`}
                href={planned.length ? "/people" : "/people/new"}
              >
                {planned.length ? "Visit your people" : "Add your first person"}
              </Link>
            </div>
          )}
        </section>
        <aside className="space-y-6">
          <section className="rounded-lg border border-[#deded5] bg-[#efeee5] p-6">
            <p className="text-sm text-[#62685e]">A thought before you write</p>
            <h2 className="mt-3 font-serif text-3xl text-balance">
              Small is enough.
            </h2>
            <p className="mt-3 text-pretty leading-7 text-[#62685e]">
              A question you’ve been sitting with. Something that reminded you
              of them. A simple hello.
            </p>
            <p className="mt-4 text-sm leading-6 text-[#62685e]">
              Being due is an invitation to consider reconnecting. You can
              always snooze or pause.
            </p>
          </section>
          <section>
            <h2 className="mb-3 text-lg font-medium text-balance">
              Your circles
            </h2>
            {circles.length ? (
              <ul className="divide-y divide-[#deded5]">
                {circles.map((circle) => (
                  <li key={circle.id}>
                    <Link
                      href={`/circles/${circle.id}`}
                      className="flex min-h-14 items-center justify-between gap-3 py-3 text-sm"
                    >
                      <span>{circle.name}</span>
                      <span className="tabular-nums text-[#62685e]">
                        {circle.personIds.length}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm leading-6 text-[#62685e]">
                Group classmates, mentors, and other people who share a part of
                your life.
              </p>
            )}
            <Link
              href="/circles"
              className="mt-3 inline-flex min-h-11 items-center text-sm text-[#43664F] underline"
            >
              {circles.length ? "All circles" : "Create a circle"}
            </Link>
          </section>
        </aside>
      </div>
    </NetworkShell>
  );
}
