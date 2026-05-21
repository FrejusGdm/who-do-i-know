"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

const ACTIONS = [
  { action: "mentor", label: "Mentor", tone: "dark" },
  { action: "friend", label: "Friend", tone: "light" },
  { action: "not_mentor", label: "Not a mentor", tone: "light" },
  { action: "needs_review", label: "Needs review", tone: "light" },
  { action: "archived", label: "Archive", tone: "quiet" },
];

export function OutreachActions({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const updateStatus = (action: string) => {
    startTransition(async () => {
      const res = await fetch(`/api/outreach/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) router.refresh();
    });
  };

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {ACTIONS.map((action) => (
        <button
          key={action.action}
          disabled={isPending}
          onClick={() => updateStatus(action.action)}
          className={
            action.tone === "dark"
              ? "bg-neutral-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              : action.tone === "quiet"
                ? "border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:border-neutral-400 hover:text-neutral-700 disabled:opacity-50"
                : "border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-neutral-950 hover:text-neutral-950 disabled:opacity-50"
          }
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
