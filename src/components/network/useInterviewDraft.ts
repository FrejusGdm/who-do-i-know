"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { InterviewDraft } from "@/lib/network/interviews";

type DraftRequest = { requestKey: string; revision: number; content: string };

/** Serialize autosaves, preserving the exact request key after an uncertain response. */
export function useInterviewDraft(
  id: string,
  initial: InterviewDraft,
  writable: boolean,
) {
  const [content, setContent] = useState(initial.content);
  const [saved, setSaved] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const latest = useRef(initial.content);
  const acknowledged = useRef(initial);
  const request = useRef<DraftRequest | null>(null);
  const running = useRef<Promise<InterviewDraft | undefined> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const held = useRef(false);

  const flush = useCallback((): Promise<InterviewDraft | undefined> => {
    if (running.current) return running.current;
    const execute = async () => {
      setError("");
      setPending(true);
      try {
        while (
          request.current ||
          latest.current !== acknowledged.current.content
        ) {
          request.current ??= {
            requestKey: crypto.randomUUID(),
            revision: acknowledged.current.revision,
            content: latest.current,
          };
          controller.current = new AbortController();
          const response = await fetch(`/api/interviews/${id}/draft`, {
            method: "PUT",
            credentials: "same-origin",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request.current),
            signal: AbortSignal.any([
              controller.current.signal,
              AbortSignal.timeout(30_000),
            ]),
          });
          if (!response.ok) {
            if (response.status === 409)
              throw new Error(
                "The saved draft changed or this interview was paused. Your words are still here. Open the interview in another tab to compare before continuing.",
              );
            if ([401, 403].includes(response.status))
              throw new Error(
                "Sign in again to save this draft. Your words are still in this tab.",
              );
            throw new Error(
              "Draft could not be saved. Your words are still in this tab; retry before leaving.",
            );
          }
          const result = (await response.json()) as InterviewDraft;
          if (
            typeof result.content !== "string" ||
            !Number.isSafeInteger(result.revision) ||
            result.revision !== request.current.revision + 1 ||
            result.content !== request.current.content
          )
            throw new Error(
              "The save acknowledgment was interrupted. Retry before leaving.",
            );
          acknowledged.current = result;
          request.current = null;
          if (!mounted.current) return;
          setSaved(result);
        }
        return acknowledged.current;
      } catch (cause) {
        if (mounted.current)
          setError(
            cause instanceof Error && cause.name === "Error"
              ? cause.message
              : "Connection interrupted. Your words are still in this tab; retry before leaving.",
          );
      } finally {
        if (mounted.current) setPending(false);
        running.current = null;
      }
    };
    // Defer execution so even an already-saved draft clears the running reference in finally.
    running.current = Promise.resolve().then(execute);
    return running.current;
  }, [id]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!writable || held.current || error || content === saved.content) return;
    const timer = setTimeout(() => {
      if (!held.current) void flush();
    }, 800);
    return () => clearTimeout(timer);
  }, [content, saved.content, writable, error, retryKey, flush]);

  const dirty = content !== saved.content || !!request.current;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return {
    content,
    pending,
    error,
    dirty,
    flush,
    edit(value: string) {
      latest.current = value;
      setContent(value);
    },
    hold() {
      held.current = true;
    },
    release() {
      held.current = false;
      setRetryKey((key) => key + 1);
    },
    submitted(next: InterviewDraft, words: string) {
      acknowledged.current = next;
      request.current = null;
      setSaved(next);
      if (latest.current.trim() === words) {
        latest.current = next.content;
        setContent(next.content);
      }
      setError("");
    },
  };
}
