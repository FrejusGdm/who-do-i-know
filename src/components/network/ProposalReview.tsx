"use client";
import { useState, type ReactNode } from "react";
import type { memoryProposals } from "@/db/schema";
import type { ProposalPayload } from "@/lib/network/interview-input";
import { buttonClass, fieldClass, secondaryButtonClass } from "./NetworkShell";
import { SaveFeedback, useNetworkMutation } from "./useNetworkMutation";
import { PersonPicker, type PersonOption } from "./PersonPicker";

export type ProposalView = Pick<
  typeof memoryProposals.$inferSelect,
  | "id"
  | "interviewId"
  | "payload"
  | "sources"
  | "confidence"
  | "uncertainty"
  | "sensitive"
  | "unresolvedIdentity"
  | "identityHints"
  | "status"
  | "revision"
  | "acceptedRef"
>;
type CircleOption = { id: string; name: string };
const labels: Record<ProposalPayload["kind"], string> = {
  new_person: "New person",
  note: "Private note",
  profile_fact: "Relationship detail",
  interaction: "An interaction",
  plan: "Keep-in-touch plan",
  circle_membership: "Circle membership",
  open_loop: "Something to follow up on",
  personal_update: "Your personal update",
};
const channels = ["email", "text", "call", "in_person", "video", "other"];
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm">{label}</span>
      {children}
    </label>
  );
}
function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}
function summary(payload: ProposalPayload) {
  if (payload.kind === "new_person") return payload.values.name;
  if (payload.kind === "plan")
    return `Every ${payload.values.intervalCount} ${payload.values.intervalUnit}, first check-in ${payload.values.nextDueOn}`;
  if (payload.kind === "circle_membership")
    return "Add this person to a circle";
  if (payload.kind === "interaction") return payload.values.body;
  return payload.body;
}

export function ProposalReview({
  proposal,
  people,
  circles,
  onReviewed,
  onShowSource,
  disabled = false,
}: {
  proposal: ProposalView;
  people: PersonOption[];
  circles: CircleOption[];
  onReviewed: (proposal: ProposalView) => void;
  onShowSource: () => void;
  disabled?: boolean;
}) {
  const [payload, setPayload] = useState(proposal.payload);
  const [sensitive, setSensitive] = useState(proposal.sensitive);
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const mutation = useNetworkMutation();
  const pending = proposal.status === "pending";
  function change(key: string, value: unknown) {
    setPayload(
      (previous) => ({ ...previous, [key]: value }) as ProposalPayload,
    );
  }
  function changeValues(key: string, value: unknown) {
    setPayload((previous) =>
      "values" in previous
        ? ({
            ...previous,
            values: { ...previous.values, [key]: value },
          } as ProposalPayload)
        : previous,
    );
  }
  async function review(action: "accept" | "reject") {
    const result = await mutation.save<{ proposal: ProposalView }>(
      `/api/interviews/${proposal.interviewId}/proposals/${proposal.id}`,
      "PATCH",
      {
        revision: proposal.revision,
        action,
        ...(action === "accept"
          ? { payload, sensitive, identityConfirmed }
          : {}),
      },
    );
    if (result) onReviewed(result.proposal);
  }
  return (
    <article
      className="space-y-4 rounded-lg border border-[#deded5] bg-white p-5"
      aria-label={`${labels[proposal.payload.kind]} suggestion`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-medium">{labels[proposal.payload.kind]}</h3>
        <span className="text-sm capitalize text-[#62685e]">
          {pending ? "For your review" : proposal.status}
        </span>
      </div>
      <p className="whitespace-pre-wrap break-words text-pretty text-sm leading-6">
        {summary(proposal.payload)}
      </p>
      {proposal.uncertainty && (
        <p className="text-sm text-[#62685e]">
          Needs checking: {proposal.uncertainty}
        </p>
      )}
      <details open={pending} className="text-sm">
        <summary className="min-h-11 cursor-pointer text-[#62685e]">
          From your words · {proposal.confidence} confidence
        </summary>
        {proposal.sources.map((source, index) => (
          <blockquote
            key={`${source.turnId}-${index}`}
            className="mb-2 whitespace-pre-wrap break-words border-l-2 border-[#a4b69c] pl-3 leading-6"
          >
            <a
              className="underline decoration-[#a4b69c] underline-offset-4"
              href={`#turn-${source.turnId}`}
              onClick={onShowSource}
            >
              {source.quote}
            </a>
          </blockquote>
        ))}
      </details>
      {pending && (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void review("accept");
          }}
        >
          <fieldset
            disabled={disabled || mutation.pending}
            className="min-w-0 space-y-4 disabled:opacity-60"
          >
            {proposal.unresolvedIdentity && (
              <div className="space-y-2 rounded-md bg-[#F7F5F0] p-3 text-sm">
                <p>
                  Choose who this belongs to before saving.
                  {proposal.identityHints.length
                    ? ` Mentioned: ${proposal.identityHints.join(", ")}.`
                    : ""}
                </p>
              </div>
            )}
            {"personId" in payload && (
              <PersonPicker
                selected={payload.personId ? [payload.personId] : []}
                onChange={(ids) => change("personId", ids[0] ?? null)}
                initial={people}
              />
            )}
            {payload.kind === "new_person" && (
              <>
                <Field label="Name">
                  <input
                    className={fieldClass}
                    required
                    maxLength={200}
                    value={payload.values.name}
                    onChange={(event) =>
                      changeValues("name", event.target.value)
                    }
                  />
                </Field>
                <Field label="Email (optional)">
                  <input
                    className={fieldClass}
                    type="email"
                    maxLength={320}
                    value={payload.values.primaryEmail ?? ""}
                    onChange={(event) =>
                      changeValues("primaryEmail", event.target.value || null)
                    }
                  />
                </Field>
                <Field label="Organization (optional)">
                  <input
                    className={fieldClass}
                    maxLength={200}
                    value={payload.values.organization ?? ""}
                    onChange={(event) =>
                      changeValues("organization", event.target.value || null)
                    }
                  />
                </Field>
                <Field label="Relationship">
                  <select
                    className={fieldClass}
                    value={payload.values.relationshipType}
                    onChange={(event) =>
                      changeValues("relationshipType", event.target.value)
                    }
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
                        {value}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Have you met?">
                  <select
                    className={fieldClass}
                    value={payload.values.metState}
                    onChange={(event) =>
                      changeValues("metState", event.target.value)
                    }
                  >
                    <option value="needs_context">Needs context</option>
                    <option value="not_met">Not met</option>
                    <option value="met">Met</option>
                  </select>
                </Field>
                {!!circles.length && (
                  <fieldset>
                    <legend className="text-sm">Circles</legend>
                    {circles.map((circle) => (
                      <Check
                        key={circle.id}
                        label={circle.name}
                        checked={payload.values.circleIds.includes(circle.id)}
                        onChange={(checked) =>
                          changeValues(
                            "circleIds",
                            checked
                              ? [...payload.values.circleIds, circle.id]
                              : payload.values.circleIds.filter(
                                  (id) => id !== circle.id,
                                ),
                          )
                        }
                      />
                    ))}
                  </fieldset>
                )}
              </>
            )}
            {payload.kind === "profile_fact" && (
              <Field label="Detail label">
                <input
                  className={fieldClass}
                  required
                  maxLength={120}
                  value={payload.label}
                  onChange={(event) => change("label", event.target.value)}
                />
              </Field>
            )}
            {payload.kind === "personal_update" && (
              <Field label="Update title">
                <input
                  className={fieldClass}
                  required
                  maxLength={160}
                  value={payload.title}
                  onChange={(event) => change("title", event.target.value)}
                />
              </Field>
            )}
            {"body" in payload && (
              <Field label="Memory to save">
                <textarea
                  className={`${fieldClass} min-h-28`}
                  required
                  maxLength={payload.kind === "note" ? 12000 : 4000}
                  value={payload.body}
                  onChange={(event) => change("body", event.target.value)}
                />
              </Field>
            )}
            {payload.kind === "open_loop" && (
              <Field label="Follow-up date (optional)">
                <input
                  className={fieldClass}
                  type="date"
                  value={payload.dueOn ?? ""}
                  onChange={(event) =>
                    change("dueOn", event.target.value || null)
                  }
                />
              </Field>
            )}
            {payload.kind === "personal_update" && (
              <Field label="Update date (optional)">
                <input
                  className={fieldClass}
                  type="date"
                  value={payload.happenedOn ?? ""}
                  onChange={(event) =>
                    change("happenedOn", event.target.value || null)
                  }
                />
              </Field>
            )}
            {payload.kind === "circle_membership" && (
              <Field label="Circle">
                <select
                  className={fieldClass}
                  required
                  value={payload.circleId}
                  onChange={(event) => change("circleId", event.target.value)}
                >
                  <option value="">Choose a circle</option>
                  {circles.map((circle) => (
                    <option key={circle.id} value={circle.id}>
                      {circle.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {payload.kind === "interaction" && (
              <>
                <PersonPicker
                  selected={payload.values.personIds}
                  onChange={(ids) => changeValues("personIds", ids)}
                  initial={people}
                  multiple
                />
                <Field label="What happened?">
                  <textarea
                    className={`${fieldClass} min-h-28`}
                    required
                    maxLength={12000}
                    value={payload.values.body}
                    onChange={(event) =>
                      changeValues("body", event.target.value)
                    }
                  />
                </Field>
                <Field label="Channel">
                  <select
                    className={fieldClass}
                    value={payload.values.channel}
                    onChange={(event) =>
                      changeValues("channel", event.target.value)
                    }
                  >
                    {channels.map((value) => (
                      <option key={value} value={value}>
                        {value.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Exchange">
                  <select
                    className={fieldClass}
                    value={payload.values.direction}
                    onChange={(event) =>
                      changeValues("direction", event.target.value)
                    }
                  >
                    <option value="mutual">
                      We exchanged messages or spoke
                    </option>
                    <option value="outbound">I reached out</option>
                    <option value="inbound">They reached out</option>
                  </select>
                </Field>
                <Field label="How certain is the date?">
                  <select
                    className={fieldClass}
                    value={payload.values.datePrecision}
                    onChange={(event) => {
                      changeValues("datePrecision", event.target.value);
                      if (
                        event.target.value === "unknown" ||
                        event.target.value === "month"
                      ) {
                        changeValues("occurredOn", null);
                        changeValues("occurredUntil", null);
                      }
                    }}
                  >
                    <option value="unknown">I do not know</option>
                    <option value="month">An approximate month</option>
                    <option value="range">A date range</option>
                    <option value="day">An exact day</option>
                  </select>
                </Field>
                {["day", "range"].includes(payload.values.datePrecision) && (
                  <Field label="Occurrence date">
                    <input
                      required
                      type="date"
                      className={fieldClass}
                      value={payload.values.occurredOn ?? ""}
                      onChange={(event) =>
                        changeValues("occurredOn", event.target.value || null)
                      }
                    />
                  </Field>
                )}
                {payload.values.datePrecision === "range" && (
                  <Field label="Latest possible date">
                    <input
                      required
                      type="date"
                      className={fieldClass}
                      value={payload.values.occurredUntil ?? ""}
                      onChange={(event) =>
                        changeValues(
                          "occurredUntil",
                          event.target.value || null,
                        )
                      }
                    />
                  </Field>
                )}
                <Field label="Date in your words">
                  <input
                    className={fieldClass}
                    required={payload.values.datePrecision === "month"}
                    maxLength={200}
                    value={payload.values.datePhrase ?? ""}
                    onChange={(event) =>
                      changeValues("datePhrase", event.target.value || null)
                    }
                  />
                </Field>
                <Check
                  label="Count as meaningful contact for reminders"
                  checked={payload.values.qualifiesForCadence}
                  onChange={(checked) =>
                    changeValues("qualifiesForCadence", checked)
                  }
                />
                {payload.values.datePrecision !== "day" && (
                  <p className="text-sm text-[#62685e]">
                    An approximate date preserves the memory without moving a
                    reminder.
                  </p>
                )}
              </>
            )}
            {payload.kind === "plan" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Every">
                    <input
                      className={fieldClass}
                      required
                      type="number"
                      min={1}
                      max={120}
                      value={payload.values.intervalCount}
                      onChange={(event) =>
                        changeValues(
                          "intervalCount",
                          Number(event.target.value),
                        )
                      }
                    />
                  </Field>
                  <Field label="Unit">
                    <select
                      className={fieldClass}
                      value={payload.values.intervalUnit}
                      onChange={(event) =>
                        changeValues("intervalUnit", event.target.value)
                      }
                    >
                      <option value="months">Calendar months</option>
                      <option value="weeks">Weeks</option>
                      <option value="days">Days</option>
                    </select>
                  </Field>
                </div>
                <Field label="First check-in">
                  <input
                    type="date"
                    required
                    className={fieldClass}
                    value={payload.values.nextDueOn}
                    onChange={(event) =>
                      changeValues("nextDueOn", event.target.value)
                    }
                  />
                </Field>
                <Field label="Timezone">
                  <input
                    className={fieldClass}
                    required
                    maxLength={100}
                    value={payload.values.timezone}
                    onChange={(event) =>
                      changeValues("timezone", event.target.value)
                    }
                  />
                </Field>
                <Field label="Preferred channel">
                  <select
                    className={fieldClass}
                    value={payload.values.preferredChannel}
                    onChange={(event) =>
                      changeValues("preferredChannel", event.target.value)
                    }
                  >
                    {channels.map((value) => (
                      <option key={value} value={value}>
                        {value.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </Field>
                <p className="text-sm text-[#62685e]">
                  A plan does not record a conversation or imply that you last
                  spoke today.
                </p>
              </>
            )}
            <Check
              label="Sensitive — keep private"
              checked={sensitive}
              onChange={(checked) => {
                setSensitive(checked);
                if (checked) {
                  if ("shareInDrafts" in payload)
                    change("shareInDrafts", false);
                  if (payload.kind === "interaction")
                    changeValues("shareInDrafts", false);
                  if (payload.kind === "personal_update") {
                    change("allowedPersonIds", []);
                    change("allowedCircleIds", []);
                  }
                }
              }}
            />
            {!sensitive && "shareInDrafts" in payload && (
              <Check
                label="Allow this memory in outreach drafts"
                checked={payload.shareInDrafts}
                onChange={(checked) => change("shareInDrafts", checked)}
              />
            )}
            {!sensitive && payload.kind === "interaction" && (
              <Check
                label="Allow this interaction in outreach drafts"
                checked={payload.values.shareInDrafts}
                onChange={(checked) => changeValues("shareInDrafts", checked)}
              />
            )}
            {!sensitive && payload.kind === "personal_update" && (
              <fieldset className="space-y-3">
                <legend className="mb-2 text-sm">
                  Allow this update in drafts for
                </legend>
                <PersonPicker
                  selected={payload.allowedPersonIds}
                  onChange={(ids) => change("allowedPersonIds", ids)}
                  initial={people}
                  multiple
                />
                {circles.map((circle) => (
                  <Check
                    key={circle.id}
                    label={circle.name}
                    checked={payload.allowedCircleIds.includes(circle.id)}
                    onChange={(checked) =>
                      change(
                        "allowedCircleIds",
                        checked
                          ? [...payload.allowedCircleIds, circle.id]
                          : payload.allowedCircleIds.filter(
                              (id) => id !== circle.id,
                            ),
                      )
                    }
                  />
                ))}
              </fieldset>
            )}
            {proposal.unresolvedIdentity && (
              <Check
                label="I have checked the identity above"
                checked={identityConfirmed}
                onChange={setIdentityConfirmed}
              />
            )}
            <SaveFeedback {...mutation} />
            <div className="flex flex-wrap gap-2">
              <button
                className={buttonClass}
                disabled={proposal.unresolvedIdentity && !identityConfirmed}
              >
                {mutation.pending ? "Saving…" : "Save this memory"}
              </button>
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => void review("reject")}
              >
                Reject suggestion
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {proposal.status === "accepted" && (
        <p className="text-sm text-[#43664F]">
          Saved to your notebook. No message was sent.
        </p>
      )}
      {proposal.status === "stale" && (
        <p className="text-sm text-[#62685e]">
          The source changed or this interview was discarded. Review a fresh
          suggestion before saving.
        </p>
      )}
    </article>
  );
}
