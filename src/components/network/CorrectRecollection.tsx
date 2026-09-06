"use client";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import Link from "next/link";
import { useId, useRef, useState } from "react";
import type {
  CorrectionImpact,
  CorrectionInput,
} from "@/lib/network/interview-corrections";
import type { InterviewSnapshot } from "./InterviewWorkspace";
import { buttonClass, fieldClass, secondaryButtonClass } from "./NetworkShell";
import { SaveFeedback, useNetworkMutation } from "./useNetworkMutation";

export function CorrectRecollection({
  interviewId,
  turnId,
  disabled,
  onSaved,
}: {
  interviewId: string;
  turnId: string;
  disabled: boolean;
  onSaved: (snapshot: InterviewSnapshot) => void;
}) {
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [impact, setImpact] = useState<CorrectionImpact | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<"correct" | "remove">("correct");
  const [content, setContent] = useState("");
  const [retain, setRetain] = useState(false);
  const mutation = useNetworkMutation();
  const controller = useRef<AbortController | null>(null);
  const request = useRef<CorrectionInput | null>(null);
  const applied = useRef(false);
  const url = `/api/interviews/${interviewId}/turns/${turnId}`;
  async function preview(reset: boolean) {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setLoading(true);
    setError(null);
    setRetain(false);
    try {
      const response = await fetch(url, {
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30_000)]),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          response.status === 404
            ? "This entry is no longer available. Reload the interview to see its current state."
            : "Could not preview this change. Check your session and try again.",
        );
      if (abort.signal.aborted) return;
      setImpact(result);
      if (reset) setContent(result.turn.content);
      request.current = null;
    } catch (cause) {
      if (!abort.signal.aborted)
        setError(
          cause instanceof Error && cause.name === "Error"
            ? cause.message
            : "Connection interrupted. Try previewing again.",
        );
    } finally {
      if (!abort.signal.aborted) setLoading(false);
    }
  }
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (mutation.pending) return;
        setOpen(next);
        if (next) {
          applied.current = false;
          setImpact(null);
          setAction("correct");
          void preview(true);
        } else {
          controller.current?.abort();
          setContent("");
          setImpact(null);
          request.current = null;
        }
      }}
    >
      <AlertDialog.Trigger asChild>
        <button className={`${secondaryButtonClass} mt-4`} disabled={disabled}>
          Correct or remove
        </button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <AlertDialog.Content
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] flex-col w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg border border-[#deded5] bg-[#fafaf6] p-5 text-[#293127] shadow-lg sm:p-7"
          onEscapeKeyDown={(event) => {
            if (mutation.pending) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            if (applied.current) {
              event.preventDefault();
              document.getElementById("recollection-list-heading")?.focus();
            }
          }}
        >
          <AlertDialog.Title className="shrink-0 text-balance text-xl font-medium">
            Review this recollection
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 shrink-0 text-pretty text-sm leading-6 text-[#62685e]">
            Correcting or removing this entry also removes later AI replies and
            their suggestions, including accepted memories. You can generate
            fresh suggestions afterward.
          </AlertDialog.Description>
          <form
            className="mt-5 flex min-h-0 flex-col gap-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!impact || !retain || loading || mutation.pending) return;
              const body = {
                action,
                impactKey: impact.impactKey,
                retainConfirmedChoices: true as const,
                ...(action === "correct" ? { content: content.trim() } : {}),
              };
              if (
                !request.current ||
                JSON.stringify({
                  ...request.current,
                  requestKey: undefined,
                }) !== JSON.stringify(body)
              )
                request.current = {
                  ...body,
                  requestKey: crypto.randomUUID(),
                } as CorrectionInput;
              const snapshot = await mutation.save<InterviewSnapshot>(
                url,
                "PATCH",
                request.current,
              );
              if (snapshot) {
                applied.current = true;
                setOpen(false);
                setContent("");
                onSaved(snapshot);
              }
            }}
          >
            <div className="min-h-0 space-y-4 overflow-y-auto">
              <div className="space-y-2">
                <label className="block" htmlFor={`${fieldId}-action`}>
                  Change to make
                </label>
                <select
                  id={`${fieldId}-action`}
                  className={fieldClass}
                  value={action}
                  disabled={mutation.pending}
                  onChange={(event) =>
                    setAction(event.target.value as "correct" | "remove")
                  }
                >
                  <option value="correct">Correct the words</option>
                  <option value="remove">Remove this entry</option>
                </select>
              </div>
              {action === "correct" && (
                <div className="space-y-2">
                  <label className="block" htmlFor={`${fieldId}-content`}>
                    Corrected recollection
                  </label>
                  <textarea
                    id={`${fieldId}-content`}
                    className={`${fieldClass} min-h-36`}
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    disabled={loading || mutation.pending}
                    maxLength={12000}
                    required
                  />
                </div>
              )}
              <p role="status" className="text-sm">
                {loading ? "Checking affected memories…" : ""}
              </p>
              {error && (
                <p role="alert" className="text-sm text-red-800">
                  {error}
                </p>
              )}
              {impact && !loading && !error && (
                <div className="space-y-3 rounded-lg border border-[#deded5] bg-white p-4 text-sm leading-6">
                  <p className="font-medium">What this changes</p>
                  <p>
                    {impact.counts.assistantTurns || impact.counts.proposals
                      ? `${impact.counts.assistantTurns} AI ${impact.counts.assistantTurns === 1 ? "reply" : "replies"} and ${impact.counts.proposals} ${impact.counts.proposals === 1 ? "suggestion" : "suggestions"} removed.`
                      : "No AI replies or suggestions depend on this entry."}
                  </p>
                  {!!(
                    impact.counts.notes +
                    impact.counts.facts +
                    impact.counts.interactions +
                    impact.counts.openLoops +
                    impact.counts.updates
                  ) && (
                    <p>
                      Also removes:{" "}
                      {[
                        [impact.counts.notes, "note"],
                        [impact.counts.facts, "profile detail"],
                        [impact.counts.interactions, "interaction"],
                        [impact.counts.openLoops, "open loop"],
                        [impact.counts.updates, "personal update"],
                      ]
                        .filter(([count]) => Number(count) > 0)
                        .map(
                          ([count, label]) =>
                            `${count} ${label}${count === 1 ? "" : "s"}`,
                        )
                        .join(" · ")}
                      .
                    </p>
                  )}
                  {!!(impact.counts.summaries + impact.counts.outreach) && (
                    <p>
                      {impact.counts.summaries} person summaries removed;
                      generated text in {impact.counts.outreach} outreach
                      records cleared. Your mentor decisions stay.
                    </p>
                  )}
                  {!!impact.people.length && (
                    <details>
                      <summary className="min-h-11 cursor-pointer py-2">
                        People included ({impact.people.length})
                      </summary>
                      <ul>
                        {impact.people.map((person) => (
                          <li key={person.id}>
                            <Link
                              className="inline-flex min-h-11 items-center underline"
                              href={`/people/${person.id}`}
                            >
                              {person.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {!!impact.plansToReview.length && (
                    <>
                      <p>
                        These reminders will pause until you review their dates:
                      </p>
                      <ul>
                        {impact.plansToReview.map((plan) => (
                          <li key={plan.id}>
                            <Link
                              className="inline-flex min-h-11 items-center underline"
                              href={`/people/${plan.personId}#contact-plan`}
                            >
                              {plan.name}
                            </Link>{" "}
                            · remaining last contact:{" "}
                            {plan.lastContactOn ?? "unknown"}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {!!(
                    impact.retained.people +
                    impact.retained.memberships +
                    impact.retained.plans
                  ) && (
                    <p>
                      Choices kept from these suggestions:{" "}
                      {impact.retained.people} people,{" "}
                      {impact.retained.memberships} circle memberships and{" "}
                      {impact.retained.plans} plan settings.
                    </p>
                  )}
                </div>
              )}
              <p className="text-sm leading-6 text-[#62685e]">
                Other recollections, unfinished drafts, profile fields, met
                status and imported records remain. This is an entry change, not
                deletion of a person or the whole notebook.
              </p>
              <label className="flex items-start gap-3 text-sm leading-6">
                <input
                  className="mt-1 size-5 shrink-0 accent-[#43664F]"
                  type="checkbox"
                  checked={retain}
                  onChange={(event) => setRetain(event.target.checked)}
                  disabled={!impact || loading || !!error || mutation.pending}
                />
                <span>
                  Keep those confirmed choices and apply the effects shown
                  above.
                </span>
              </label>
              <SaveFeedback {...mutation} />
              <button
                type="button"
                className={secondaryButtonClass}
                disabled={loading || mutation.pending}
                onClick={() => void preview(!impact)}
              >
                Refresh preview
              </button>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-[#deded5] pt-4">
              <AlertDialog.Cancel asChild>
                <button
                  type="button"
                  className={secondaryButtonClass}
                  disabled={mutation.pending}
                >
                  Cancel
                </button>
              </AlertDialog.Cancel>
              <button
                aria-label={
                  action === "remove" && !mutation.pending
                    ? "Remove entry and memories"
                    : undefined
                }
                className={
                  action === "remove"
                    ? `${secondaryButtonClass} border-red-800 text-red-800`
                    : buttonClass
                }
                disabled={
                  !impact ||
                  loading ||
                  !!error ||
                  !retain ||
                  mutation.pending ||
                  (action === "correct" &&
                    (!content.trim() || content.trim() === impact.turn.content))
                }
              >
                {mutation.pending
                  ? "Saving change…"
                  : action === "remove"
                    ? "Remove entry"
                    : "Save correction"}
              </button>
            </div>
          </form>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
