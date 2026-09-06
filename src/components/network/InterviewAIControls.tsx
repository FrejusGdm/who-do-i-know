"use client";
import { buttonClass, secondaryButtonClass } from "./NetworkShell";
import { SaveFeedback } from "./useNetworkMutation";
import type { useInterviewAI } from "./useInterviewAI";
const messages: Record<string, string> = {
  consent_required:
    "AI processing is off. You can continue keeping notes privately.",
  source_changed:
    "Your words or interview changed while the answer was being prepared. Ask again using the latest saved context.",
  daily_limit:
    "Today’s AI request limit has been reached. It resets at midnight UTC; manual capture still works.",
  attempt_limit:
    "The interviewer could not finish after three attempts. You can retry when the provider is available.",
  configuration:
    "The AI provider rejected the request. Check the configured key, model and provider access before retrying.",
  context_limit:
    "This conversation is too large to process. Start another interview; your saved words remain here.",
  invalid_output:
    "The answer could not be validated against your saved words. Nothing from that answer was added.",
  timeout:
    "The interviewer took too long to answer. Your saved words are ready for another attempt.",
  unavailable:
    "The AI provider is unavailable. Your saved words are ready for another attempt.",
  rate_limit:
    "The provider is busy. Retry shortly; your saved words are still here.",
};
export function InterviewAIControls({
  ai,
  revision,
  writable,
  unsaved,
}: {
  ai: ReturnType<typeof useInterviewAI>;
  revision: number;
  writable: boolean;
  unsaved: boolean;
}) {
  const busy = !!ai.job && ["queued", "processing"].includes(ai.job.status);
  if (!ai.status.configured)
    return (
      <div className="rounded-lg border border-[#deded5] bg-white p-4 text-sm leading-6 text-[#62685e]">
        AI conversation is not configured yet. Your entries save privately, and
        manual notes and reminders remain available.
      </div>
    );
  return (
    <section
      aria-label="AI interviewer"
      className="space-y-3 rounded-lg border border-[#deded5] bg-white p-5"
    >
      <h3 className="text-balance font-medium">A question at a time</h3>
      <p className="break-words text-sm text-[#62685e]">
        {ai.status.provider} · {ai.status.model}
      </p>
      {ai.status.allowed ? (
        <>
          <p className="text-pretty text-sm leading-6 text-[#62685e]">
            AI is on. Saving a recollection asks the interviewer for a follow-up
            question and memory suggestions. Every suggestion still needs your
            review.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={
                !writable ||
                unsaved ||
                busy ||
                ai.request.pending ||
                ai.consent.pending
              }
              onClick={() => void ai.ask(revision)}
            >
              {busy
                ? "Preparing a question…"
                : ai.job?.status === "failed" || ai.job?.status === "canceled"
                  ? "Retry interviewer"
                  : "Ask the interviewer"}
            </button>
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={ai.consent.pending}
              onClick={() => void ai.setAllowed(false)}
            >
              Turn AI off
            </button>
          </div>
          {busy && (
            <p role="status" className="text-sm text-[#62685e]">
              {ai.job?.status === "queued"
                ? "Your request is saved and waiting for the interviewer. You can leave and return."
                : "The interviewer is reading your saved context."}
            </p>
          )}
          {unsaved && (
            <p className="text-sm text-[#62685e]">
              Save your current words before asking for another question.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-pretty text-sm leading-6 text-[#62685e]">
            To interview you, this provider receives your saved conversation,
            relevant names and reviewed context. The app requests routes with
            zero data retention. This permission is separate from allowing a
            detail in an outreach draft.
          </p>
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={ai.consent.pending}
            onClick={() => void ai.setAllowed(true)}
          >
            Allow AI interviews with this provider
          </button>
        </>
      )}
      {ai.job?.errorCategory && !busy && (
        <p
          role="status"
          className="text-pretty text-sm leading-6 text-[#62685e]"
        >
          {messages[ai.job.errorCategory] ??
            "The interviewer could not finish. Your saved words are still available."}
        </p>
      )}
      {ai.pollError && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-red-800">
            {ai.pollError}
          </p>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={ai.checkAgain}
          >
            Check for the answer
          </button>
        </div>
      )}
      <SaveFeedback {...ai.consent} />
      <SaveFeedback {...ai.request} />
      <p className="text-sm text-[#62685e]">
        Up to {ai.status.dailyLimit} requests per day, including retries.
        Turning AI off cancels queued work; an already-sent request may finish
        at the provider, but its answer will not be saved.
      </p>
    </section>
  );
}
