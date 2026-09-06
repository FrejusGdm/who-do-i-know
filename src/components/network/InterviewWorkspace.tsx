"use client";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import type { interviews, interviewTurns } from "@/db/schema";
import { cn } from "@/lib/utils";
import { buttonClass, fieldClass, secondaryButtonClass } from "./NetworkShell";
import { SaveFeedback, useNetworkMutation } from "./useNetworkMutation";
import { ProposalReview, type ProposalView } from "./ProposalReview";
import type { PersonOption } from "./PersonPicker";
import type {
  InterviewAIStatus,
  InterviewJobView,
} from "@/lib/network/interview-jobs";
import { useInterviewAI } from "./useInterviewAI";
import { InterviewAIControls } from "./InterviewAIControls";
import { CorrectRecollection } from "./CorrectRecollection";
import { useInterviewDraft } from "./useInterviewDraft";
type InterviewState = Pick<
  typeof interviews.$inferSelect,
  "id" | "title" | "status" | "revision" | "draftContent" | "draftRevision"
>;
type TurnView = Pick<
  typeof interviewTurns.$inferSelect,
  "id" | "role" | "content" | "ordinal" | "revision"
>;
export type InterviewSnapshot = {
  interview: InterviewState;
  turns: TurnView[];
  proposals: ProposalView[];
};
export function InterviewWorkspace({
  initial,
  people,
  circles,
  initialAI,
  initialJob,
}: {
  initial: {
    interview: InterviewState;
    turns: TurnView[];
    proposals: ProposalView[];
  };
  people: PersonOption[];
  circles: { id: string; name: string }[];
  initialAI: InterviewAIStatus;
  initialJob: InterviewJobView | null;
}) {
  const [interview, setInterview] = useState(initial.interview);
  const [turns, setTurns] = useState(initial.turns);
  const [proposals, setProposals] = useState(initial.proposals);
  const writable = ["active", "reviewing"].includes(interview.status);
  const draft = useInterviewDraft(
    initial.interview.id,
    {
      content: initial.interview.draftContent,
      revision: initial.interview.draftRevision,
    },
    writable,
  );
  const content = draft.content;
  const [submitting, setSubmitting] = useState(false);
  const [view, setView] = useState<"conversation" | "review">("conversation");
  const [saved, setSaved] = useState(false);
  const latestRevision = useRef(initial.interview.revision);
  const receiveSnapshot = useCallback((snapshot: InterviewSnapshot) => {
    if (snapshot.interview.revision < latestRevision.current) return;
    latestRevision.current = snapshot.interview.revision;
    setInterview(snapshot.interview);
    setTurns(snapshot.turns);
    setProposals((current) =>
      snapshot.proposals.map((proposal) => {
        const local = current.find((item) => item.id === proposal.id);
        return local && local.revision > proposal.revision ? local : proposal;
      }),
    );
  }, []);
  const ai = useInterviewAI({
    id: initial.interview.id,
    initialStatus: initialAI,
    initialJob,
    onSnapshot: receiveSnapshot,
  });
  const turnMutation = useNetworkMutation();
  const statusMutation = useNetworkMutation();
  const request = useRef<{
    key: string;
    content: string;
    revision: number;
  } | null>(null);
  const pendingCount = proposals.filter(
    (proposal) => proposal.status === "pending",
  ).length;
  async function setStatus(status: InterviewState["status"]) {
    if (submitting) return;
    setSubmitting(true);
    if (writable) {
      draft.hold();
      if (!(await draft.flush())) {
        draft.release();
        setSubmitting(false);
        return;
      }
    }
    const result = await statusMutation.save<{ interview: InterviewState }>(
      `/api/interviews/${interview.id}`,
      "PATCH",
      { revision: latestRevision.current, status },
    );
    if (result) {
      latestRevision.current = result.interview.revision;
      setInterview(result.interview);
    }
    draft.release();
    setSubmitting(false);
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[#deded5] py-4">
        <p className="text-sm text-[#62685e]">
          <span className="capitalize">{interview.status}</span> · Private
          conversation ·{" "}
          <span className="tabular-nums">
            {turns.filter((turn) => turn.role === "user").length}
          </span>{" "}
          saved entries
        </p>
        <div className="flex flex-wrap gap-2">
          {writable && (
            <button
              className={secondaryButtonClass}
              disabled={statusMutation.pending || submitting || draft.pending}
              onClick={() => void setStatus("paused")}
            >
              Pause interview
            </button>
          )}
          {["paused", "completed"].includes(interview.status) && (
            <button
              className={secondaryButtonClass}
              disabled={statusMutation.pending || submitting}
              onClick={() => void setStatus("active")}
            >
              Resume interview
            </button>
          )}
          {writable && (
            <button
              className={secondaryButtonClass}
              disabled={
                statusMutation.pending ||
                submitting ||
                draft.pending ||
                pendingCount > 0 ||
                !!content.trim()
              }
              onClick={() => void setStatus("completed")}
            >
              Finish interview
            </button>
          )}
        </div>
        <SaveFeedback {...statusMutation} />
      </div>
      <div className="flex gap-2 lg:hidden" aria-label="Interview views">
        <button
          className={
            view === "conversation" ? buttonClass : secondaryButtonClass
          }
          aria-pressed={view === "conversation"}
          onClick={() => setView("conversation")}
        >
          Conversation
        </button>
        <button
          className={view === "review" ? buttonClass : secondaryButtonClass}
          aria-pressed={view === "review"}
          onClick={() => setView("review")}
        >
          Review {pendingCount > 0 ? `(${pendingCount})` : ""}
        </button>
      </div>
      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section
          className={cn(
            "min-w-0 space-y-6 lg:block",
            view !== "conversation" && "hidden",
          )}
          aria-label="Saved conversation"
        >
          <div>
            <h2
              id="recollection-list-heading"
              tabIndex={-1}
              className="text-balance text-xl font-medium"
            >
              Room to remember
            </h2>
            <p className="mt-2 text-pretty leading-7 text-[#62685e]">
              Start anywhere. A name, a conversation, a detail you do not want
              to lose. Uncertain dates can stay uncertain.
            </p>
          </div>
          <InterviewAIControls
            ai={ai}
            revision={interview.revision}
            writable={writable}
            unsaved={!!content.trim()}
          />
          {!turns.length && (
            <p className="rounded-lg border border-dashed border-[#deded5] p-6 text-pretty leading-7 text-[#62685e]">
              Nothing saved yet. Write what comes to mind below; you do not need
              to organize it first.
            </p>
          )}
          <ol className="space-y-5">
            {turns.map((turn) => (
              <li
                id={`turn-${turn.id}`}
                key={turn.id}
                className={cn(
                  "scroll-mt-6 rounded-lg border p-5",
                  turn.role === "user"
                    ? "border-[#deded5] bg-white"
                    : "border-[#d5dfd0] bg-[#edf1e8]",
                )}
              >
                <p className="mb-3 text-sm font-medium text-[#62685e]">
                  {turn.role === "user"
                    ? "Your recollection"
                    : "Interview assistant"}{" "}
                  · <span className="tabular-nums">{turn.ordinal}</span>
                </p>
                <p className="whitespace-pre-wrap break-words text-pretty leading-7">
                  {turn.content}
                </p>
                {turn.role === "user" && (
                  <CorrectRecollection
                    interviewId={interview.id}
                    turnId={turn.id}
                    disabled={submitting || statusMutation.pending}
                    onSaved={receiveSnapshot}
                  />
                )}
              </li>
            ))}
          </ol>
          {writable ? (
            <form
              className="space-y-3"
              onSubmit={async (event) => {
                event.preventDefault();
                if (submitting || !content.trim()) return;
                setSubmitting(true);
                draft.hold();
                const savedDraft = await draft.flush();
                if (!savedDraft) {
                  setSubmitting(false);
                  draft.release();
                  return;
                }
                const words = savedDraft.content.trim();
                if (!words) {
                  setSubmitting(false);
                  draft.release();
                  return;
                }
                if (!request.current || request.current.content !== words)
                  request.current = {
                    key: crypto.randomUUID(),
                    content: words,
                    revision: latestRevision.current,
                  };
                const result = await turnMutation.save<{
                  interview: InterviewState;
                  turn: TurnView;
                }>(`/api/interviews/${interview.id}/turns`, "POST", {
                  requestKey: request.current.key,
                  revision: request.current.revision,
                  content: words,
                  draftRevision: savedDraft.revision,
                });
                if (result) {
                  latestRevision.current = result.interview.revision;
                  setInterview(result.interview);
                  setTurns((current) =>
                    current.some((turn) => turn.id === result.turn.id)
                      ? current
                      : [...current, result.turn],
                  );
                  draft.submitted(
                    {
                      content: result.interview.draftContent,
                      revision: result.interview.draftRevision,
                    },
                    words,
                  );
                  setSaved(true);
                  request.current = null;
                  if (ai.status.allowed) void ai.ask(result.interview.revision);
                }
                setSubmitting(false);
                draft.release();
              }}
            >
              <label className="block space-y-2">
                <span className="font-medium">
                  What would you like to remember?
                </span>
                <textarea
                  className={`${fieldClass} min-h-44`}
                  required
                  maxLength={12000}
                  value={content}
                  readOnly={submitting}
                  onChange={(event) => {
                    draft.edit(event.target.value);
                    setSaved(false);
                  }}
                  placeholder="We talked about…"
                />
              </label>
              <div
                className="space-y-2 text-sm text-[#62685e]"
                aria-label="Draft saving"
              >
                <p role="status">
                  {draft.pending
                    ? "Saving draft…"
                    : draft.dirty
                      ? "Changes waiting to save"
                      : content
                        ? "Draft saved privately"
                        : "Drafts save automatically as you write."}
                </p>
                <p>
                  Your draft enters the conversation when you save the
                  recollection. AI only receives submitted entries after you
                  allow it.
                </p>
                {draft.error && (
                  <p role="alert" className="text-red-800">
                    {draft.error}
                  </p>
                )}
                {draft.error && (
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    disabled={draft.pending || submitting}
                    onClick={() => void draft.flush()}
                  >
                    Retry draft save
                  </button>
                )}
              </div>
              <SaveFeedback {...turnMutation} />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  className={buttonClass}
                  disabled={
                    submitting || statusMutation.pending || !content.trim()
                  }
                >
                  {submitting ? "Saving your words…" : "Save recollection"}
                </button>
                <span role="status" className="text-sm text-[#43664F]">
                  {saved ? "Saved to your private notebook" : ""}
                </span>
              </div>
            </form>
          ) : (
            <p className="text-pretty leading-7 text-[#62685e]">
              {interview.status === "discarded"
                ? "This interview has been discarded."
                : "Your saved words are here when you return. Resume the interview to add more."}
            </p>
          )}
        </section>
        <section
          className={cn(
            "min-w-0 space-y-5 lg:block",
            view !== "review" && "hidden",
          )}
          aria-label="Memory review"
        >
          <div>
            <h2 className="text-balance text-xl font-medium">What to keep</h2>
            <p className="mt-2 text-pretty text-sm leading-6 text-[#62685e]">
              Check each person and supporting quote. Only the suggestions you
              accept become memories.
            </p>
          </div>
          {!proposals.length && (
            <div className="rounded-lg border border-dashed border-[#deded5] p-6">
              <p className="text-pretty leading-7 text-[#62685e]">
                No memory suggestions yet. Your saved words remain available
                here.
              </p>
              <Link className={`${secondaryButtonClass} mt-4`} href="/people">
                Add a note to someone
              </Link>
            </div>
          )}
          {proposals.map((proposal) => (
            <ProposalReview
              key={`${proposal.id}-${proposal.revision}`}
              proposal={proposal}
              people={people}
              circles={circles}
              onShowSource={() => setView("conversation")}
              disabled={interview.status === "discarded"}
              onReviewed={(_updated, snapshot) => receiveSnapshot(snapshot)}
            />
          ))}
        </section>
      </div>
    </div>
  );
}
