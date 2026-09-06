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
type InterviewState = Pick<
  typeof interviews.$inferSelect,
  "id" | "title" | "status" | "revision"
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
  const [content, setContent] = useState("");
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
  const writable = ["active", "reviewing"].includes(interview.status);
  const pendingCount = proposals.filter(
    (proposal) => proposal.status === "pending",
  ).length;
  async function setStatus(status: InterviewState["status"]) {
    const result = await statusMutation.save<{ interview: InterviewState }>(
      `/api/interviews/${interview.id}`,
      "PATCH",
      { revision: interview.revision, status },
    );
    if (result) {
      latestRevision.current = result.interview.revision;
      setInterview(result.interview);
    }
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
              disabled={statusMutation.pending || turnMutation.pending}
              onClick={() => void setStatus("paused")}
            >
              Pause interview
            </button>
          )}
          {["paused", "completed"].includes(interview.status) && (
            <button
              className={secondaryButtonClass}
              disabled={statusMutation.pending}
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
                turnMutation.pending ||
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
            <h2 className="text-balance text-xl font-medium">
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
              </li>
            ))}
          </ol>
          {writable ? (
            <form
              className="space-y-3"
              onSubmit={async (event) => {
                event.preventDefault();
                const words = content.trim();
                if (!words) return;
                if (!request.current || request.current.content !== words)
                  request.current = {
                    key: crypto.randomUUID(),
                    content: words,
                    revision: interview.revision,
                  };
                const result = await turnMutation.save<{
                  interview: InterviewState;
                  turn: TurnView;
                }>(`/api/interviews/${interview.id}/turns`, "POST", {
                  requestKey: request.current.key,
                  revision: request.current.revision,
                  content: words,
                });
                if (result) {
                  latestRevision.current = result.interview.revision;
                  setInterview(result.interview);
                  setTurns((current) =>
                    current.some((turn) => turn.id === result.turn.id)
                      ? current
                      : [...current, result.turn],
                  );
                  setContent((current) =>
                    current.trim() === words ? "" : current,
                  );
                  setSaved(true);
                  request.current = null;
                  if (ai.status.allowed) void ai.ask(result.interview.revision);
                }
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
                  onChange={(event) => {
                    setContent(event.target.value);
                    setSaved(false);
                  }}
                  placeholder="We talked about…"
                />
              </label>
              <p className="text-sm text-[#62685e]">
                Unsaved words stay in this open tab. Save before leaving.
              </p>
              <SaveFeedback {...turnMutation} />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  className={buttonClass}
                  disabled={
                    turnMutation.pending ||
                    statusMutation.pending ||
                    !content.trim()
                  }
                >
                  {turnMutation.pending
                    ? "Saving your words…"
                    : "Save recollection"}
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
              onReviewed={(updated) =>
                setProposals((current) =>
                  current.map((item) =>
                    item.id === updated.id ? updated : item,
                  ),
                )
              }
            />
          ))}
        </section>
      </div>
    </div>
  );
}
