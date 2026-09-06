"use client";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import type { PersonalUpdateView } from "@/lib/network/personal-updates";
import { PersonPicker, type PersonOption } from "./PersonPicker";
import { buttonClass, fieldClass, secondaryButtonClass } from "./NetworkShell";
import { SaveFeedback, useNetworkMutation } from "./useNetworkMutation";

type Options = {
  people: PersonOption[];
  circles: { id: string; name: string }[];
};
function UpdateForm({
  update,
  people,
  circles,
  onSaved,
  onCancel,
}: Options & {
  update?: PersonalUpdateView;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  const mutation = useNetworkMutation();
  const [title, setTitle] = useState(update?.title ?? "");
  const [body, setBody] = useState(update?.body ?? "");
  const [date, setDate] = useState(update?.happenedOn ?? "");
  const [personIds, setPersonIds] = useState(update?.allowedPersonIds ?? []);
  const [circleIds, setCircleIds] = useState(update?.allowedCircleIds ?? []);
  const [frozen, setFrozen] = useState(false);
  const request = useRef<object | null>(null);
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        request.current ??= {
          requestKey: crypto.randomUUID(),
          title,
          body,
          happenedOn: date || null,
          allowedPersonIds: personIds,
          allowedCircleIds: circleIds,
          ...(update ? { action: "edit", revision: update.revision } : {}),
        };
        setFrozen(true);
        const result = await mutation.save(
          `/api/updates${update ? `/${update.id}` : ""}`,
          update ? "PATCH" : "POST",
          request.current,
        );
        if (result) onSaved();
        else if (mutation.rejected.current) {
          request.current = null;
          setFrozen(false);
        }
      }}
    >
      <fieldset disabled={mutation.pending || frozen} className="space-y-4">
        <div>
          <label htmlFor={`${id}-title`} className="mb-1 block text-sm">
            Update title
          </label>
          <input
            id={`${id}-title`}
            className={fieldClass}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={160}
          />
        </div>
        <div>
          <label htmlFor={`${id}-body`} className="mb-1 block text-sm">
            What would you like to remember?
          </label>
          <textarea
            id={`${id}-body`}
            className={`${fieldClass} min-h-32`}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            required
            maxLength={4000}
          />
        </div>
        <div>
          <label htmlFor={`${id}-date`} className="mb-1 block text-sm">
            Date (optional)
          </label>
          <input
            id={`${id}-date`}
            className={fieldClass}
            type="date"
            min="1900-01-01"
            max="9999-12-31"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
        <details
          className="rounded-md border border-[#deded5] p-3"
          open={personIds.length + circleIds.length > 0 || undefined}
        >
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
            Who may receive this in a draft?
          </summary>
          <p className="mb-3 text-sm leading-6 text-[#62685e]">
            No selection keeps it private. A circle includes its current and
            future members. You will still choose which update to use for each
            draft.
          </p>
          <PersonPicker
            label="Allowed people"
            multiple
            selected={personIds}
            onChange={setPersonIds}
            initial={people}
          />
          {personIds.filter(
            (personId) => !people.some((person) => person.id === personId),
          ).length > 0 && (
            <p className="mt-2 text-sm text-[#62685e]">
              Your selected people are retained. Search to review their
              selection, or clear the audience below.
            </p>
          )}
          <fieldset className="mt-4">
            <legend className="text-sm font-medium">Allowed circles</legend>
            {circles.map((circle) => (
              <label
                key={circle.id}
                className="flex min-h-11 items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={circleIds.includes(circle.id)}
                  onChange={(event) =>
                    setCircleIds(
                      event.target.checked
                        ? [...circleIds, circle.id]
                        : circleIds.filter((id) => id !== circle.id),
                    )
                  }
                />
                {circle.name}
              </label>
            ))}
            {!circles.length && (
              <p className="mt-2 text-sm text-[#62685e]">
                Create a circle to choose it here.
              </p>
            )}
          </fieldset>
          <button
            className="mt-2 min-h-11 text-sm text-[#43664F] underline"
            type="button"
            onClick={() => {
              setPersonIds([]);
              setCircleIds([]);
            }}
          >
            Clear audience — keep private
          </button>
        </details>
        <p className="text-sm text-[#62685e]">
          {personIds.length + circleIds.length
            ? `${personIds.length} people and ${circleIds.length} circles allowed`
            : "Private — no draft audience selected"}
        </p>
      </fieldset>
      <SaveFeedback {...mutation} />
      {mutation.error && frozen && (
        <p className="text-sm text-[#62685e]">
          Retry to confirm this save before making another change.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button className={buttonClass} disabled={mutation.pending}>
          {mutation.error ? "Retry update" : "Save update"}
        </button>
        <button
          type="button"
          className={secondaryButtonClass}
          disabled={mutation.pending || frozen}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function UpdateCard({
  update,
  people,
  circles,
}: Options & { update: PersonalUpdateView }) {
  const router = useRouter();
  const mutation = useNetworkMutation();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const request = useRef<object | null>(null);
  const audience = [
    ...people
      .filter((person) => update.allowedPersonIds.includes(person.id))
      .map((person) => person.name),
    ...circles
      .filter((circle) => update.allowedCircleIds.includes(circle.id))
      .map((circle) => `${circle.name} (circle)`),
  ];
  const missingAudience =
    update.allowedPersonIds.length +
    update.allowedCircleIds.length -
    audience.length;
  return (
    <article
      aria-label={update.title}
      className="rounded-lg border border-[#deded5] bg-white p-5 sm:p-6"
    >
      {editing ? (
        <UpdateForm
          update={update}
          people={people}
          circles={circles}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      ) : (
        <>
          <h2 className="break-words text-xl font-medium text-balance">
            {update.title}
          </h2>
          <p className="mt-2 text-sm text-[#62685e]">
            {update.happenedOn ?? "Date not specified"}
          </p>
          <p className="mt-4 whitespace-pre-wrap break-words leading-7">
            {update.body}
          </p>
          <p className="mt-4 text-sm leading-6 text-[#62685e]">
            {update.allowedPersonIds.length + update.allowedCircleIds.length
              ? `Allowed in drafts for: ${[...audience, ...(missingAudience ? [`${missingAudience} unavailable selections — edit to review`] : [])].join(" · ")}`
              : "Private — no draft audience selected"}
          </p>
          {update.sourceInterviewId && (
            <Link
              className="inline-flex min-h-11 items-center text-sm text-[#43664F] underline"
              href={`/interviews/${update.sourceInterviewId}`}
            >
              Reviewed in your interview
            </Link>
          )}
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              className={secondaryButtonClass}
              onClick={() => setEditing(true)}
            >
              Edit update
            </button>
            <AlertDialog.Root open={removing} onOpenChange={setRemoving}>
              <AlertDialog.Trigger asChild>
                <button className="min-h-11 px-2 text-sm text-[#62685e] underline">
                  Remove update
                </button>
              </AlertDialog.Trigger>
              <AlertDialog.Portal>
                <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
                <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-[#F7F5F0] p-6 shadow-lg">
                  <AlertDialog.Title className="text-xl font-medium">
                    Remove this update?
                  </AlertDialog.Title>
                  <AlertDialog.Description className="mt-3 text-sm leading-6 text-[#62685e]">
                    Its saved text and draft audience will be removed. Original
                    interview words remain in the source interview.
                  </AlertDialog.Description>
                  <div className="mt-4">
                    <SaveFeedback {...mutation} />
                    {mutation.error &&
                      request.current &&
                      !mutation.rejected.current && (
                        <p className="mt-2 text-sm text-[#62685e]">
                          Removal status is uncertain. Retry to confirm its
                          result.
                        </p>
                      )}
                  </div>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <AlertDialog.Cancel asChild>
                      <button
                        className={secondaryButtonClass}
                        disabled={mutation.pending}
                      >
                        {mutation.error &&
                        request.current &&
                        !mutation.rejected.current
                          ? "Close"
                          : "Keep update"}
                      </button>
                    </AlertDialog.Cancel>
                    <button
                      className={buttonClass}
                      disabled={mutation.pending}
                      onClick={async () => {
                        request.current ??= {
                          requestKey: crypto.randomUUID(),
                          revision: update.revision,
                          action: "remove",
                        };
                        const result = await mutation.save(
                          `/api/updates/${update.id}`,
                          "PATCH",
                          request.current,
                        );
                        if (result) {
                          setRemoving(false);
                          router.refresh();
                        } else if (mutation.rejected.current)
                          request.current = null;
                      }}
                    >
                      {mutation.error ? "Retry removal" : "Confirm removal"}
                    </button>
                  </div>
                </AlertDialog.Content>
              </AlertDialog.Portal>
            </AlertDialog.Root>
          </div>
        </>
      )}
    </article>
  );
}

export function PersonalUpdateLibrary({
  updates,
  people,
  circles,
}: Options & { updates: PersonalUpdateView[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section aria-label="Saved personal updates" className="space-y-4">
        {updates.map((update) => (
          <UpdateCard
            key={`${update.id}-${update.revision}`}
            update={update}
            people={people}
            circles={circles}
          />
        ))}
        {!updates.length && (
          <div className="rounded-lg border border-dashed border-[#c8ccc1] p-6">
            <h2 className="font-serif text-3xl text-balance">
              Something small is enough.
            </h2>
            <p className="mt-3 leading-7 text-[#62685e]">
              A new place, a book, or a question that stayed with you. Save it
              here until the right conversation comes along.
            </p>
          </div>
        )}
      </section>
      <section
        aria-label="Add a personal update"
        className="order-first lg:order-none rounded-lg border border-[#deded5] bg-[#efeee5] p-5 sm:p-6"
      >
        <h2 className="mb-4 text-xl font-medium text-balance">
          From your life
        </h2>
        {adding ? (
          <UpdateForm
            people={people}
            circles={circles}
            onCancel={() => setAdding(false)}
            onSaved={() => {
              setAdding(false);
              router.refresh();
            }}
          />
        ) : (
          <>
            <p className="mb-4 text-sm leading-6 text-[#62685e]">
              Updates start private. You choose their audience, and can change
              your mind later.
            </p>
            <button className={buttonClass} onClick={() => setAdding(true)}>
              Add an update
            </button>
          </>
        )}
      </section>
    </div>
  );
}
