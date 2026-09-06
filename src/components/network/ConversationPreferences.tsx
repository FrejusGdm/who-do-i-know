"use client";
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PreferenceView } from "@/lib/network/conversation-preferences";
import { buttonClass, fieldClass, secondaryButtonClass } from "./NetworkShell";
import { SaveFeedback, useNetworkMutation } from "./useNetworkMutation";

const formats: Record<string, string> = {
  short_text: "Short text",
  email: "Email",
  photo: "Photo with a caption",
  question: "A question",
  article: "Useful article",
  call: "Call",
  in_person: "Meet in person",
};
const textFields = [
  {
    key: "intention",
    label: "What you want to maintain",
    max: 1000,
    placeholder: "A close mentorship, shared curiosity, a friendship…",
  },
  {
    key: "topics",
    label: "Topics that feel natural",
    max: 2000,
    placeholder:
      "Life updates, a shared interest, a question you are thinking about…",
  },
  {
    key: "draftExclusions",
    label: "Topics to avoid in drafts",
    max: 2000,
    placeholder: "Anything you would rather leave out",
  },
] as const;
const empty: PreferenceView = {
  intention: "",
  topics: "",
  preferredFormats: [],
  language: "",
  draftExclusions: "",
  revision: 0,
};

export function ConversationPreferences({
  personId,
  preferences,
  archived,
}: {
  personId: string;
  preferences: PreferenceView | null;
  archived: boolean;
}) {
  const id = useId();
  const router = useRouter();
  const mutation = useNetworkMutation();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(preferences ?? empty);
  const [frozen, setFrozen] = useState(false);
  const request = useRef<object | null>(null);
  const saved = preferences ?? empty;
  const hasContent =
    saved.intention ||
    saved.topics ||
    saved.draftExclusions ||
    saved.language ||
    saved.preferredFormats.length;
  function close() {
    setValue(saved);
    setEditing(false);
  }
  return (
    <section
      aria-label="Conversation preferences"
      className="rounded-lg border border-[#deded5] bg-white p-5"
    >
      <h2 className="text-xl font-medium text-balance">
        How you stay in touch
      </h2>
      <p className="mt-2 text-sm leading-6 text-[#62685e]">
        What feels right with this person? A professional connection can welcome
        a personal update, too.
      </p>
      {editing ? (
        <form
          className="mt-4 space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            request.current ??= {
              ...value,
              revision: saved.revision,
              requestKey: crypto.randomUUID(),
            };
            setFrozen(true);
            const result = await mutation.save<{ preferences: PreferenceView }>(
              `/api/people/${personId}/preferences`,
              "PUT",
              request.current,
            );
            if (result) {
              request.current = null;
              setFrozen(false);
              setEditing(false);
              router.refresh();
            } else if (mutation.rejected.current) {
              request.current = null;
              setFrozen(false);
            }
          }}
        >
          {textFields.map(({ key, label, max, placeholder }) => (
            <div key={key}>
              <label htmlFor={`${id}-${key}`} className="mb-1 block text-sm">
                {label}
              </label>
              <textarea
                id={`${id}-${key}`}
                className={`${fieldClass} min-h-24`}
                value={value[key]}
                placeholder={placeholder}
                maxLength={max}
                disabled={mutation.pending || frozen}
                onChange={(event) =>
                  setValue({ ...value, [key]: event.target.value })
                }
              />
            </div>
          ))}
          <fieldset disabled={mutation.pending || frozen}>
            <legend className="mb-1 text-sm">Formats you like</legend>
            <div className="grid sm:grid-cols-2">
              {Object.entries(formats).map(([key, label]) => (
                <label
                  key={key}
                  className="flex min-h-11 items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-[#43664F]"
                    checked={value.preferredFormats.includes(key)}
                    onChange={(event) =>
                      setValue({
                        ...value,
                        preferredFormats: event.target.checked
                          ? [...value.preferredFormats, key]
                          : value.preferredFormats.filter(
                              (format) => format !== key,
                            ),
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor={`${id}-language`} className="mb-1 block text-sm">
              Preferred language (optional)
            </label>
            <input
              id={`${id}-language`}
              className={fieldClass}
              value={value.language}
              maxLength={80}
              disabled={mutation.pending || frozen}
              onChange={(event) =>
                setValue({ ...value, language: event.target.value })
              }
            />
          </div>
          <p className="text-sm leading-6 text-[#62685e]">
            Private guidance for this relationship. Clear a field to remove it.
            Saving does not record contact or change your check-in rhythm.
          </p>
          <SaveFeedback {...mutation} />
          {mutation.error && frozen && (
            <p className="text-sm text-[#62685e]">
              Retry to confirm this save before making another change.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button className={buttonClass} disabled={mutation.pending}>
              {mutation.error ? "Retry preferences" : "Save preferences"}
            </button>
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={mutation.pending || frozen}
              onClick={close}
            >
              Cancel
            </button>
            {mutation.error && !frozen && (
              <button
                type="button"
                className="min-h-11 text-sm underline"
                onClick={() => router.refresh()}
              >
                Reload saved preferences
              </button>
            )}
          </div>
        </form>
      ) : (
        <>
          {hasContent ? (
            <dl className="mt-4 space-y-4 text-sm">
              {textFields.map(
                ({ key, label }) =>
                  saved[key] && (
                    <div key={key}>
                      <dt className="font-medium">{label}</dt>
                      <dd className="mt-1 whitespace-pre-wrap break-words leading-6 text-[#62685e]">
                        {saved[key]}
                      </dd>
                    </div>
                  ),
              )}
              {!!saved.preferredFormats.length && (
                <div>
                  <dt className="font-medium">Formats you like</dt>
                  <dd className="mt-1 leading-6 text-[#62685e]">
                    {saved.preferredFormats
                      .map((key) => formats[key] ?? key)
                      .join(" · ")}
                  </dd>
                </div>
              )}
              {saved.language && (
                <div>
                  <dt className="font-medium">Preferred language</dt>
                  <dd className="mt-1 break-words text-[#62685e]">
                    {saved.language}
                  </dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="mt-4 text-sm leading-6 text-[#62685e]">
              Nothing chosen yet. Leave room for both shared interests and
              everyday life.
            </p>
          )}
          {!archived && (
            <button
              className={`${secondaryButtonClass} mt-4`}
              onClick={() => {
                setValue(saved);
                setEditing(true);
              }}
            >
              Edit preferences
            </button>
          )}
        </>
      )}
    </section>
  );
}
