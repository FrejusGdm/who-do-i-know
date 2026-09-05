"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass, fieldClass } from "@/components/network/NetworkShell";
import {
  SaveFeedback,
  useNetworkMutation,
} from "@/components/network/useNetworkMutation";
export function NoteComposer({ personId }: { personId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const { save, pending, error } = useNetworkMutation();
  return (
    <form
      className="space-y-4 rounded-lg border border-[#deded5] bg-white p-5"
      onSubmit={async (event) => {
        event.preventDefault();
        const result = await save(`/api/people/${personId}/notes`, "POST", {
          body,
          tags: tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        });
        if (result) {
          setBody("");
          setTags("");
          router.refresh();
        }
      }}
    >
      <h2 className="text-xl font-medium text-balance">Add private context</h2>
      <label className="block space-y-2">
        <span>Your note</span>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={5}
          required
          maxLength={12000}
          className={fieldClass}
        />
      </label>
      <label className="block space-y-2">
        <span>
          Tags <span className="text-sm text-[#62685e]">comma separated</span>
        </span>
        <input
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          maxLength={1000}
          className={fieldClass}
        />
      </label>
      <p className="text-sm leading-6 text-[#62685e]">
        Saving a note does not record contact or move a reminder.
      </p>
      <SaveFeedback error={error} pending={pending} />
      <button disabled={!body.trim() || pending} className={buttonClass}>
        {pending ? "Saving…" : "Save private note"}
      </button>
    </form>
  );
}
