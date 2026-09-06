"use client";
import { useRef, useState } from "react";

/** Keep failed input in the form; never put private bodies into persistent browser storage. */
export function useNetworkMutation() {
  const running = useRef(false);
  const rejected = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save<T>(
    url: string,
    method: string,
    body: unknown,
  ): Promise<T | undefined> {
    if (running.current) return;
    running.current = true;
    rejected.current = false;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        rejected.current = response.status >= 400 && response.status < 500;
        const message =
          response.status === 401 || response.status === 403
            ? "Your session needs attention. Sign in again, then retry."
            : result?.error;
        const issue = result?.issues?.[0]?.message;
        throw new Error(
          [message || "This could not be saved.", issue]
            .filter(Boolean)
            .join(" "),
        );
      }
      if (!result)
        throw new Error("The save response was interrupted. Please retry.");
      return result as T;
    } catch (cause) {
      setError(
        cause instanceof Error &&
          cause.name !== "TimeoutError" &&
          cause.name !== "TypeError"
          ? cause.message
          : "Connection interrupted. Your input is still here; please retry.",
      );
    } finally {
      running.current = false;
      setPending(false);
    }
  }
  return { save, pending, error, rejected };
}

export function SaveFeedback({
  error,
  pending,
}: {
  error: string | null;
  pending: boolean;
}) {
  return (
    <>
      {error && (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      )}
      <span role="status" className="sr-only">
        {pending ? "Saving" : ""}
      </span>
    </>
  );
}
