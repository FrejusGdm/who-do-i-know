"use client";
import { useId, useState } from "react";
import { fieldClass, secondaryButtonClass } from "./NetworkShell";
export type PersonOption = {
  id: string;
  name: string;
  primaryEmail?: string | null;
  organization?: string | null;
};

/** Explicit identity selection. A name search never silently resolves an identity. */
export function PersonPicker({
  selected,
  onChange,
  initial = [],
  multiple = false,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  initial?: PersonOption[];
  multiple?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function search() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(
        `/api/people?q=${encodeURIComponent(query)}`,
        {
          credentials: "same-origin",
          cache: "no-store",
          signal: AbortSignal.timeout(30_000),
        },
      );
      if (!response.ok)
        throw new Error("People could not be loaded. Please retry.");
      const result = (await response.json()) as { people: PersonOption[] };
      setOptions((current) => [
        ...new Map(
          [
            ...current.filter((person) => selected.includes(person.id)),
            ...result.people,
          ].map((person) => [person.id, person]),
        ).values(),
      ]);
    } catch {
      setError(
        "People could not be loaded. Your selection is still here; retry the search.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-sm font-medium">
        {multiple ? "People in this memory" : "Who is this about?"}
      </legend>
      <div className="flex gap-2">
        <label htmlFor={`${id}-search`} className="sr-only">
          Search by name
        </label>
        <input
          id={`${id}-search`}
          className={`${fieldClass} min-w-0`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={200}
          placeholder="Search your people"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void search();
            }
          }}
        />
        <button
          type="button"
          className={secondaryButtonClass}
          disabled={pending}
          onClick={() => void search()}
        >
          {pending ? "Finding…" : "Find"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      )}
      <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-[#deded5] p-2">
        {!options.length && (
          <p className="p-2 text-sm text-[#62685e]">
            Search for a saved person. If they are new, add them to People first
            or review a new-person suggestion.
          </p>
        )}
        {options.map((person) => (
          <label
            key={person.id}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded px-2 hover:bg-[#F7F5F0]"
          >
            <input
              type={multiple ? "checkbox" : "radio"}
              name={id}
              checked={selected.includes(person.id)}
              onChange={(event) =>
                onChange(
                  multiple
                    ? event.target.checked
                      ? [...selected, person.id]
                      : selected.filter((value) => value !== person.id)
                    : [person.id],
                )
              }
            />
            <span className="min-w-0 text-sm">
              <span className="block break-words">{person.name}</span>
              <span className="block break-words text-[#62685e]">
                {person.organization ||
                  person.primaryEmail ||
                  `No contact details · ${person.id.slice(0, 8)}`}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
