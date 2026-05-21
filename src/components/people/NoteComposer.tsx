"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NoteComposer({ personId }: { personId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [isPending, startTransition] = useTransition();

  const saveNote = () => {
    startTransition(async () => {
      const res = await fetch(`/api/people/${personId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          tags: tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        }),
      });
      if (res.ok) {
        setBody("");
        setTags("");
        router.refresh();
      }
    });
  };

  return (
    <div className="border border-neutral-200 p-5">
      <div className="mb-4 flex items-center gap-2">
        <NotebookPen className="h-4 w-4" />
        <h2 className="text-lg font-semibold">Add private context</h2>
      </div>
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={5}
        placeholder="Who this person is, how you met, why they matter, mentor context, advice they gave, things email does not show..."
        className="w-full resize-none border border-neutral-300 p-3 text-sm outline-none focus:border-neutral-950"
      />
      <input
        value={tags}
        onChange={(event) => setTags(event.target.value)}
        placeholder="Tags, comma separated"
        className="mt-3 h-10 w-full border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-950"
      />
      <Button
        onClick={saveNote}
        disabled={!body.trim() || isPending}
        className="mt-4 rounded-md bg-neutral-950 text-white hover:bg-neutral-800"
      >
        {isPending ? "Saving..." : "Save and queue summary refresh"}
      </Button>
    </div>
  );
}
