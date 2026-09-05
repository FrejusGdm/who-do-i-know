import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePrivatePageSession } from "@/lib/server-session";
import { networkPerson, ownerSettings } from "@/lib/network/queries";
import { NetworkError } from "@/lib/network/store";
import { todayInTimezone } from "@/lib/network/calendar";
import {
  NetworkShell,
  PageHeading,
  secondaryButtonClass,
} from "@/components/network/NetworkShell";
import { ContactPlan } from "@/components/network/ContactPlan";
import { LogContact } from "@/components/network/LogContact";
import { ImportedContext } from "@/components/network/ImportedContext";
import { NoteComposer } from "@/components/people/NoteComposer";
export const dynamic = "force-dynamic";
export default async function PersonPage({
  params,
}: {
  params: Promise<{ personId: string }>;
}) {
  const session = await requirePrivatePageSession();
  const { personId } = await params;
  const data = await networkPerson(session.user.id, personId).catch((error) => {
    if (error instanceof NetworkError && error.status === 404) notFound();
    throw error;
  });
  const settings = await ownerSettings(session.user.id);
  const today = todayInTimezone(settings.timezone);
  const { person, plan, interactions, notes, circles } = data;
  const archived =
    person.archivedAt !== null || person.reviewStatus === "archived";
  const memberships = circles.filter((circle) =>
    circle.personIds.includes(person.id),
  );
  return (
    <NetworkShell active="People">
      <PageHeading
        eyebrow="Your people"
        title={person.name}
        description={[
          person.organization,
          person.relationshipType !== "unknown"
            ? person.relationshipType
            : "Still getting to know them",
        ]
          .filter(Boolean)
          .join(" · ")}
        action={
          !archived && (
            <a href="#log-contact" className={secondaryButtonClass}>
              Log contact
            </a>
          )
        }
      />
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-[#c8ccc1] px-3 py-1 text-sm capitalize">
          {person.metState.replaceAll("_", " ")}
        </span>
        {memberships.map((circle) => (
          <Link
            key={circle.id}
            className="rounded-full bg-[#e5eadd] px-3 py-1 text-sm text-[#344e3d]"
            href={`/circles/${circle.id}`}
          >
            {circle.name}
          </Link>
        ))}
        <span className="text-sm text-[#62685e]">
          {person.primaryEmail ??
            "No email added — you can still keep notes and reminders"}
        </span>
      </div>
      <p className="mb-6 text-sm text-[#62685e]">
        Last conversation / exchange: {person.lastMutualOn ?? "unknown"} · Last
        outgoing contact: {person.lastOutboundOn ?? "unknown"}
      </p>
      {archived && (
        <p
          role="status"
          className="mb-6 rounded-lg border border-[#deded5] p-5"
        >
          This person is archived. Their history stays available; reminders and
          new activity are paused.
        </p>
      )}
      <div className="grid items-start gap-8 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          {person.manualNotes && (
            <section className="rounded-lg border border-[#deded5] bg-white p-5">
              <h2 className="text-xl font-medium text-balance">
                Relationship context
              </h2>
              <p className="mt-3 whitespace-pre-wrap leading-7">
                {person.manualNotes}
              </p>
              <p className="mt-3 text-sm text-[#62685e]">
                Your private profile notes
              </p>
            </section>
          )}
          <section>
            <h2 className="mb-4 text-xl font-medium text-balance">
              Contact history
            </h2>
            <div className="space-y-3">
              {interactions.map((event) => (
                <article
                  key={event.id}
                  className="rounded-lg border border-[#deded5] bg-white p-5"
                >
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-[#62685e]">
                    <span>
                      {event.datePrecision === "day"
                        ? event.occurredOn
                        : event.datePhrase ||
                          (event.datePrecision === "range"
                            ? `${event.occurredOn} to ${event.occurredUntil}`
                            : "Date unknown")}
                    </span>
                    <span>{event.channel.replace("_", " ")}</span>
                    <span>
                      {event.direction === "mutual"
                        ? "Conversation / exchange"
                        : event.direction === "outbound"
                          ? "You reached out"
                          : "They reached out"}
                    </span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap leading-7">
                    {event.body}
                  </p>
                  <p className="mt-3 text-sm text-[#62685e]">
                    Recorded by you ·{" "}
                    {event.qualifiesForCadence && event.datePrecision === "day"
                      ? "Counts toward rhythm"
                      : "Does not set a reminder date"}{" "}
                    ·{" "}
                    {event.shareInDrafts
                      ? "Allowed in drafts"
                      : "Private context"}
                  </p>
                </article>
              ))}
              {interactions.length === 0 && (
                <div className="rounded-lg border border-dashed border-[#c8ccc1] p-6">
                  <p className="font-medium">Your shared history starts here</p>
                  <p className="mt-2 text-pretty leading-7 text-[#62685e]">
                    No confirmed interactions yet. Record a conversation, even
                    if you can’t remember exactly when it happened.
                  </p>
                </div>
              )}
            </div>
          </section>
          {!archived && <LogContact personId={personId} today={today} />}
          <section>
            <h2 className="mb-4 text-xl font-medium text-balance">
              Your private notes
            </h2>
            <div className="space-y-3">
              {notes.map((note) => (
                <article
                  className="rounded-lg border border-[#deded5] bg-white p-5"
                  key={note.id}
                >
                  <p className="whitespace-pre-wrap leading-7">{note.body}</p>
                  <p className="mt-3 text-sm text-[#62685e]">
                    Your note ·{" "}
                    {new Intl.DateTimeFormat("en", {
                      timeZone: settings.timezone,
                      dateStyle: "medium",
                    }).format(note.createdAt)}
                  </p>
                </article>
              ))}
            </div>
            {notes.length === 0 && (
              <p className="text-sm text-[#62685e]">No private notes yet.</p>
            )}
          </section>
          <ImportedContext userId={session.user.id} personId={personId} />
        </div>
        <aside className="space-y-6">
          {!archived && (
            <>
              <ContactPlan
                personId={personId}
                plan={plan}
                today={today}
                timezone={settings.timezone}
              />
              <NoteComposer personId={personId} />
            </>
          )}
          <Link
            href="/review"
            className="inline-flex min-h-11 items-center text-sm text-[#43664F] underline"
          >
            Edit profile in mentor review
          </Link>
        </aside>
      </div>
    </NetworkShell>
  );
}
