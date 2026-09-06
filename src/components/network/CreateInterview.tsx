"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass, fieldClass } from "./NetworkShell";
import { SaveFeedback, useNetworkMutation } from "./useNetworkMutation";
import { PersonPicker, type PersonOption } from "./PersonPicker";
export const interviewModes = {
  keep_close: "People I want to stay close to",
  just_met: "Someone I just met",
  debrief: "Debrief a conversation",
  weekly: "Catch up on my week",
};
export function CreateInterview({ people }: { people: PersonOption[] }) {
  const router = useRouter();
  const mutation = useNetworkMutation();
  const [personIds, setPersonIds] = useState<string[]>([]);
  const request = useRef<{ key: string; hash: string } | null>(null);
  return (
    <form
      className="space-y-5 rounded-lg border border-[#deded5] bg-white p-5 md:p-6"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const values = {
          title: form.get("title"),
          mode: form.get("mode"),
          personIds,
        };
        const hash = JSON.stringify(values);
        if (!request.current || request.current.hash !== hash)
          request.current = { key: crypto.randomUUID(), hash };
        const result = await mutation.save<{ interview: { id: string } }>(
          "/api/interviews",
          "POST",
          { ...values, requestKey: request.current.key },
        );
        if (result) router.push(`/interviews/${result.interview.id}`);
      }}
    >
      <h2 className="text-xl font-medium">Start with what you remember</h2>
      <label className="block space-y-2">
        <span className="text-sm">Conversation title</span>
        <input
          className={fieldClass}
          name="title"
          required
          maxLength={160}
          placeholder="A conversation to remember"
          defaultValue="A conversation to remember"
        />
      </label>
      <label className="block space-y-2">
        <span className="text-sm">What would you like to reflect on?</span>
        <select className={fieldClass} name="mode" defaultValue="debrief">
          {Object.entries(interviewModes).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <details>
        <summary className="min-h-11 cursor-pointer text-sm">
          Choose people now (optional)
        </summary>
        <PersonPicker
          selected={personIds}
          onChange={setPersonIds}
          initial={people}
          multiple
        />
      </details>
      <SaveFeedback {...mutation} />
      <button className={buttonClass} disabled={mutation.pending}>
        {mutation.pending ? "Starting…" : "Start a conversation"}
      </button>
    </form>
  );
}
