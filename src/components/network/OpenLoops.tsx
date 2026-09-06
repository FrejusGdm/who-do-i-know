"use client";
import Link from "next/link";
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { OpenLoopView } from "@/lib/network/open-loops";
import { buttonClass, fieldClass, secondaryButtonClass } from "./NetworkShell";
import { SaveFeedback, useNetworkMutation } from "./useNetworkMutation";

type EventOption = { id: string; body: string; occurredOn: string | null };
type Loop = Omit<OpenLoopView, "sourceInterviewId"> & {
  sourceInterviewId?: string | null;
};

function CommitmentForm({
  personId,
  loop,
  events,
  onSaved,
  onCancel,
}: {
  personId: string;
  loop?: Loop;
  events: EventOption[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  const mutation = useNetworkMutation();
  const [body, setBody] = useState(loop?.body ?? "");
  const [dueOn, setDueOn] = useState(loop?.dueOn ?? "");
  const [interactionId, setInteractionId] = useState(loop?.interactionId ?? "");
  const request = useRef<object | null>(null);
  const [frozen, setFrozen] = useState(false);
  const locked = mutation.pending || frozen;
  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        request.current ??= {
          requestKey: crypto.randomUUID(),
          body,
          dueOn: dueOn || null,
          interactionId: interactionId || null,
          ...(loop ? { action: "edit", revision: loop.revision } : {}),
        };
        setFrozen(true);
        const result = await mutation.save(
          `/api/people/${personId}/open-loops${loop ? `/${loop.id}` : ""}`,
          loop ? "PATCH" : "POST",
          request.current,
        );
        if (result) onSaved();
        else if (mutation.rejected.current) {
          request.current = null;
          setFrozen(false);
        }
      }}
    >
      <div>
        <label htmlFor={`${id}-body`} className="mb-1 block text-sm">
          Promise or follow-up
        </label>
        <textarea
          id={`${id}-body`}
          className={`${fieldClass} min-h-24`}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          required
          maxLength={4000}
          disabled={locked}
        />
      </div>
      <div>
        <label htmlFor={`${id}-date`} className="mb-1 block text-sm">
          Due date (optional)
        </label>
        <input
          id={`${id}-date`}
          type="date"
          min="1900-01-01"
          max="9999-12-31"
          className={fieldClass}
          value={dueOn}
          onChange={(event) => setDueOn(event.target.value)}
          disabled={locked}
        />
      </div>
      <div>
        <label htmlFor={`${id}-event`} className="mb-1 block text-sm">
          Related contact (optional)
        </label>
        <select
          id={`${id}-event`}
          className={fieldClass}
          value={interactionId}
          onChange={(event) => setInteractionId(event.target.value)}
          disabled={locked}
        >
          <option value="">No linked contact</option>
          {interactionId &&
            !events.some((event) => event.id === interactionId) && (
              <option value={interactionId}>Previously linked contact</option>
            )}
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.occurredOn ?? "Date unknown"} · {event.body.slice(0, 80)}
            </option>
          ))}
        </select>
      </div>
      <SaveFeedback {...mutation} />
      {mutation.error && request.current && (
        <p className="text-sm text-[#62685e]">
          Retry this save to confirm its result before making another change.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button className={buttonClass} disabled={mutation.pending}>
          {mutation.error ? "Retry save" : "Save commitment"}
        </button>
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={onCancel}
          disabled={locked}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function CommitmentCard({
  loop,
  events = [],
  readOnly = false,
  compact = false,
}: {
  loop: Loop;
  events?: EventOption[];
  readOnly?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const mutation = useNetworkMutation();
  const [editing, setEditing] = useState(false);
  const request = useRef<{
    requestKey: string;
    action: "status";
    revision: number;
    status: "open" | "done" | "dismissed";
  } | null>(null);
  async function change(status: "open" | "done" | "dismissed") {
    request.current ??= {
      requestKey: crypto.randomUUID(),
      action: "status",
      revision: loop.revision,
      status,
    };
    const result = await mutation.save(
      `/api/people/${loop.personId}/open-loops/${loop.id}`,
      "PATCH",
      request.current,
    );
    if (result) {
      request.current = null;
      router.refresh();
    } else if (mutation.rejected.current) request.current = null;
  }
  return (
    <article
      className={
        compact
          ? "rounded-md bg-[#f4f3eb] p-4"
          : "rounded-lg border border-[#deded5] bg-white p-4"
      }
    >
      {editing ? (
        <CommitmentForm
          personId={loop.personId}
          loop={loop}
          events={events}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      ) : (
        <>
          <p className="whitespace-pre-wrap break-words leading-6">
            {loop.body}
          </p>
          <p className="mt-2 text-sm text-[#62685e]">
            {loop.dueOn ? `Due ${loop.dueOn}` : "No deadline"}
            {loop.status !== "open"
              ? ` · ${loop.status === "done" ? "Done" : "Dismissed"}`
              : ""}
          </p>
          {!compact && (
            <div className="flex flex-wrap gap-x-4 text-sm">
              {loop.sourceInterviewId && (
                <Link
                  className="inline-flex min-h-11 items-center text-[#43664F] underline"
                  href={`/interviews/${loop.sourceInterviewId}`}
                >
                  Reviewed in your interview
                </Link>
              )}
              {loop.interactionId && (
                <Link
                  className="inline-flex min-h-11 items-center text-[#43664F] underline"
                  href={`/people/${loop.personId}#interaction-${loop.interactionId}`}
                >
                  Related contact
                </Link>
              )}
            </div>
          )}
          {!readOnly && (
            <div className="mt-2 flex flex-wrap gap-2">
              {mutation.error && request.current ? (
                <button
                  className={secondaryButtonClass}
                  disabled={mutation.pending}
                  onClick={() => change(request.current!.status)}
                >
                  Retry change
                </button>
              ) : (
                <>
                  <button
                    className={secondaryButtonClass}
                    disabled={mutation.pending}
                    onClick={() =>
                      change(loop.status === "open" ? "done" : "open")
                    }
                  >
                    {loop.status === "open" ? "Mark done" : "Reopen"}
                  </button>
                  {loop.status === "open" && (
                    <button
                      className="min-h-11 px-3 text-sm text-[#62685e] underline"
                      disabled={mutation.pending}
                      onClick={() => change("dismissed")}
                    >
                      Dismiss
                    </button>
                  )}
                  {compact ? (
                    <Link
                      className="inline-flex min-h-11 items-center px-2 text-sm text-[#43664F] underline"
                      href={`/people/${loop.personId}#open-loops`}
                    >
                      Edit
                    </Link>
                  ) : (
                    <button
                      className="min-h-11 px-3 text-sm text-[#43664F] underline"
                      disabled={mutation.pending}
                      onClick={() => setEditing(true)}
                    >
                      Edit
                    </button>
                  )}
                </>
              )}
            </div>
          )}
          <SaveFeedback {...mutation} />
        </>
      )}
    </article>
  );
}

export function OpenLoops({
  personId,
  loops,
  events,
  archived,
}: {
  personId: string;
  loops: OpenLoopView[];
  events: EventOption[];
  archived: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const router = useRouter();
  const open = loops.filter((loop) => loop.status === "open");
  const closed = loops.filter((loop) => loop.status !== "open");
  const card = (loop: OpenLoopView) => (
    <CommitmentCard
      key={`${loop.id}-${loop.revision}`}
      loop={loop}
      events={events}
      readOnly={archived}
    />
  );
  return (
    <section
      id="open-loops"
      aria-label="Promises and follow-ups"
      className="space-y-3"
    >
      <h2 className="text-xl font-medium text-balance">
        Promises &amp; follow-ups
      </h2>
      <p className="text-sm leading-6 text-[#62685e]">
        Things you want to follow through on. Marking one done does not record
        contact or change your rhythm.
      </p>
      {open.map(card)}
      {!open.length && (
        <p className="rounded-lg border border-dashed border-[#c8ccc1] p-4 text-sm text-[#62685e]">
          No open commitments. Add a promise, question, or something to send.
        </p>
      )}
      {closed.length > 0 && (
        <details className="space-y-3">
          <summary className="min-h-11 cursor-pointer py-3 text-sm text-[#62685e]">
            Completed or dismissed ({closed.length})
          </summary>
          {closed.map(card)}
        </details>
      )}
      {!archived &&
        (adding ? (
          <CommitmentForm
            personId={personId}
            events={events}
            onCancel={() => setAdding(false)}
            onSaved={() => {
              setAdding(false);
              router.refresh();
            }}
          />
        ) : (
          <button
            className={secondaryButtonClass}
            onClick={() => setAdding(true)}
          >
            Add commitment
          </button>
        ))}
    </section>
  );
}
