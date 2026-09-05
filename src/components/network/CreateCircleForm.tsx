"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass, fieldClass } from "./NetworkShell";
import { SaveFeedback, useNetworkMutation } from "./useNetworkMutation";
export function CreateCircleForm() {
  const [kind, setKind] = useState("circle");
  const { save, pending, error } = useNetworkMutation();
  const router = useRouter();
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const result = await save<{ circle: { id: string } }>(
          "/api/circles",
          "POST",
          {
            name: form.get("name"),
            kind,
            cohortLabel:
              kind === "cohort" ? form.get("cohortLabel") || null : null,
            expectedCount:
              kind === "cohort" && form.get("expectedCount")
                ? Number(form.get("expectedCount"))
                : null,
          },
        );
        if (result) {
          router.push(`/circles/${result.circle.id}`);
        }
      }}
    >
      <label className="block space-y-2">
        <span>Circle name</span>
        <input
          className={fieldClass}
          name="name"
          required
          maxLength={120}
          placeholder="Dartmouth mentors"
        />
      </label>
      <label className="block space-y-2">
        <span>Kind</span>
        <select
          className={fieldClass}
          value={kind}
          onChange={(event) => setKind(event.target.value)}
        >
          <option value="circle">Circle</option>
          <option value="cohort">Program cohort</option>
        </select>
      </label>
      {kind === "cohort" && (
        <>
          <label className="block space-y-2">
            <span>Class label</span>
            <input
              className={fieldClass}
              name="cohortLabel"
              maxLength={120}
              placeholder="Class of 2027 · Cohort 11"
            />
          </label>
          <label className="block space-y-2">
            <span>
              Expected people{" "}
              <span className="text-sm text-[#62685e]">optional</span>
            </span>
            <input
              className={fieldClass}
              name="expectedCount"
              type="number"
              min={1}
              max={10000}
            />
          </label>
        </>
      )}
      <p className="text-sm leading-6 text-[#62685e]">
        Circles help you find people. They do not start or change anyone’s
        reminders.
      </p>
      <SaveFeedback error={error} pending={pending} />
      <button className={buttonClass} disabled={pending}>
        {pending ? "Creating…" : "Create circle"}
      </button>
    </form>
  );
}
