"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass, fieldClass } from "./NetworkShell";
import { SaveFeedback, useNetworkMutation } from "./useNetworkMutation";

export function CreatePersonForm({
  circles,
}: {
  circles: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { save, pending, error } = useNetworkMutation();
  const [name, setName] = useState("");
  return (
    <form
      className="max-w-2xl space-y-5 rounded-lg border border-[#deded5] bg-white p-5 sm:p-7"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const response = await save<{ person: { id: string } }>(
          "/api/people",
          "POST",
          {
            name,
            primaryEmail: form.get("email") || null,
            organization: form.get("organization") || null,
            relationshipType: form.get("relationshipType"),
            metState: form.get("metState"),
            circleIds: form.getAll("circleIds"),
          },
        );
        if (response) {
          router.push(`/people/${response.person.id}`);
        }
      }}
    >
      <label className="block space-y-2">
        <span>Name</span>
        <input
          autoComplete="off"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={200}
          className={fieldClass}
        />
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block space-y-2">
          <span>
            Email <span className="text-sm text-[#62685e]">optional</span>
          </span>
          <input
            name="email"
            type="email"
            maxLength={320}
            className={fieldClass}
          />
        </label>
        <label className="block space-y-2">
          <span>
            Organization{" "}
            <span className="text-sm text-[#62685e]">optional</span>
          </span>
          <input name="organization" maxLength={200} className={fieldClass} />
        </label>
        <label className="block space-y-2">
          <span>Relationship</span>
          <select
            name="relationshipType"
            defaultValue="unknown"
            className={fieldClass}
          >
            {[
              "unknown",
              "mentor",
              "friend",
              "classmate",
              "colleague",
              "family",
              "other",
            ].map((value) => (
              <option key={value} value={value}>
                {value === "unknown"
                  ? "Still getting to know them"
                  : value.charAt(0).toUpperCase() + value.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-2">
          <span>Have you met?</span>
          <select
            name="metState"
            className={fieldClass}
            defaultValue="needs_context"
          >
            <option value="needs_context">Needs context</option>
            <option value="not_met">Not met</option>
            <option value="met">Met</option>
          </select>
        </label>
      </div>
      {circles.length > 0 && (
        <fieldset>
          <legend className="mb-2">Add to circles</legend>
          <div className="flex flex-wrap gap-x-5">
            {circles.map((circle) => (
              <label
                key={circle.id}
                className="flex min-h-11 items-center gap-2"
              >
                <input
                  type="checkbox"
                  name="circleIds"
                  value={circle.id}
                  className="size-4 accent-[#43664F]"
                />
                {circle.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <p className="text-sm leading-6 text-[#62685e]">
        You can add their story and choose a check-in rhythm next. Creating a
        person does not start reminders.
      </p>
      <SaveFeedback error={error} pending={pending} />
      <button className={buttonClass} disabled={pending || !name.trim()}>
        {pending ? "Saving person…" : "Add person"}
      </button>
    </form>
  );
}
