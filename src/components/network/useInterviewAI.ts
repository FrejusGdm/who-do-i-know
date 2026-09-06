"use client";
import { useEffect, useRef, useState } from "react";
import type {
  InterviewAIStatus,
  InterviewJobView,
} from "@/lib/network/interview-jobs";
import type { InterviewSnapshot } from "./InterviewWorkspace";
import { useNetworkMutation } from "./useNetworkMutation";

export function useInterviewAI({
  id,
  initialStatus,
  initialJob,
  onSnapshot,
}: {
  id: string;
  initialStatus: InterviewAIStatus;
  initialJob: InterviewJobView | null;
  onSnapshot: (snapshot: InterviewSnapshot) => void;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [job, setJob] = useState(initialJob);
  const [pollError, setPollError] = useState("");
  const [pollKey, setPollKey] = useState(0);
  const consent = useNetworkMutation();
  const request = useNetworkMutation();
  const key = useRef<{ revision: number; requestKey: string } | null>(null);
  async function setAllowed(allowed: boolean) {
    const result = await consent.save<InterviewAIStatus>(
      "/api/interviews/ai-settings",
      "PUT",
      { allowed, configurationKey: status.configurationKey },
    );
    if (result) {
      setStatus(result);
      if (!allowed)
        setJob((current) =>
          current && ["queued", "processing"].includes(current.status)
            ? {
                ...current,
                status: "canceled",
                errorCategory: "consent_required",
              }
            : current,
        );
    }
  }
  async function ask(revision: number) {
    if (
      !key.current ||
      key.current.revision !== revision ||
      (job && ["failed", "canceled"].includes(job.status))
    )
      key.current = { revision, requestKey: crypto.randomUUID() };
    const result = await request.save<{ job: InterviewJobView }>(
      `/api/interviews/${id}/generation`,
      "POST",
      key.current,
    );
    if (result) {
      setJob(result.job);
      setPollError("");
      setPollKey((value) => value + 1);
    }
  }
  const jobId = job?.id;
  const jobStatus = job?.status;
  useEffect(() => {
    if (
      !jobId ||
      !jobStatus ||
      !["queued", "processing", "complete"].includes(jobStatus)
    )
      return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let polls = 0;
    async function poll() {
      try {
        const options = {
          credentials: "same-origin" as const,
          cache: "no-store" as const,
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(30_000),
          ]),
        };
        const response = await fetch(
          `/api/interviews/${id}/generation`,
          options,
        );
        if (!response.ok) throw new Error("Job status unavailable");
        const { job: next } = (await response.json()) as {
          job: InterviewJobView | null;
        };
        if (next?.status === "complete") {
          const saved = await fetch(`/api/interviews/${id}`, options);
          if (!saved.ok) throw new Error("Saved conversation unavailable");
          const snapshot = (await saved.json()) as InterviewSnapshot;
          if (controller.signal.aborted) return;
          onSnapshot(snapshot);
        }
        if (controller.signal.aborted) return;
        setJob(next);
        setPollError("");
        if (next && ["queued", "processing"].includes(next.status))
          timer = setTimeout(poll, ++polls > 20 ? 5000 : 1000);
      } catch {
        if (!controller.signal.aborted)
          setPollError(
            "The connection was interrupted. Your words and queued request are saved. Check again to load the answer.",
          );
      }
    }
    timer = setTimeout(poll, 500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [id, jobId, jobStatus, pollKey, onSnapshot]);
  return {
    status,
    job,
    consent,
    request,
    pollError,
    setAllowed,
    ask,
    checkAgain: () => {
      setPollError("");
      setPollKey((value) => value + 1);
    },
  };
}
