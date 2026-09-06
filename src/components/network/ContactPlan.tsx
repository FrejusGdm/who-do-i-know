"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { keepInTouchPlans } from "@/db/schema";
import { buttonClass, fieldClass, secondaryButtonClass } from "./NetworkShell";
import { SaveFeedback, useNetworkMutation } from "./useNetworkMutation";
type Plan = typeof keepInTouchPlans.$inferSelect;
export function ContactPlan({
  personId,
  plan,
  today,
  timezone,
}: {
  personId: string;
  plan: Plan | null;
  today: string;
  timezone: string;
}) {
  const { save, pending, error } = useNetworkMutation();
  const router = useRouter();
  const [action, setAction] = useState("");
  const url = `/api/people/${personId}/keep-in-touch`;
  return (
    <section
      id="contact-plan"
      className="rounded-lg border border-[#deded5] bg-white p-5"
    >
      <h2 className="text-xl font-medium text-balance">Your check-in rhythm</h2>
      <p className="mt-2 text-sm leading-6 text-[#62685e]">
        {plan
          ? `Last qualifying contact: ${plan.lastContactOn ?? "unknown"}. ${plan.status === "paused" ? "Reminders are paused." : plan.snoozedUntil ? `Snoozed to ${plan.snoozedUntil}.` : `Next check-in: ${plan.nextDueOn}.`}`
          : "No reminders yet. Choose when you’d like to check in first."}
      </p>
      {plan?.needsReview && (
        <p
          role="status"
          className="mt-4 rounded-lg border border-[#deded5] bg-[#efeee5] p-4 text-sm leading-6"
        >
          A source recollection changed. Review the remaining contact history
          and choose a check-in date before resuming reminders. Saving the
          rhythm confirms the settings; reminders stay paused until you resume.
        </p>
      )}
      <form
        key={plan?.revision ?? "new"}
        className="mt-5 space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const result = await save(url, "PUT", {
            nextDueOn: form.get("nextDueOn"),
            intervalCount: Number(form.get("intervalCount")),
            intervalUnit: form.get("intervalUnit"),
            preferredChannel: form.get("preferredChannel"),
            timezone: form.get("timezone"),
            revision: plan?.revision ?? null,
          });
          if (result) router.refresh();
        }}
      >
        <div className="grid grid-cols-[5rem_1fr] gap-3">
          <label className="space-y-2">
            <span>Every</span>
            <input
              className={fieldClass}
              name="intervalCount"
              type="number"
              required
              min={1}
              max={120}
              defaultValue={plan?.intervalCount ?? 3}
            />
          </label>
          <label className="space-y-2">
            <span>Unit</span>
            <select
              className={fieldClass}
              name="intervalUnit"
              defaultValue={plan?.intervalUnit ?? "months"}
            >
              <option value="months">Calendar months</option>
              <option value="weeks">Weeks</option>
              <option value="days">Days</option>
            </select>
          </label>
        </div>
        <label className="block space-y-2">
          <span>{plan ? "Next check-in" : "First check-in"}</span>
          <input
            className={fieldClass}
            name="nextDueOn"
            type="date"
            required
            defaultValue={plan?.nextDueOn ?? today}
          />
        </label>
        <label className="block space-y-2">
          <span>Preferred channel</span>
          <select
            className={fieldClass}
            name="preferredChannel"
            defaultValue={plan?.preferredChannel ?? "email"}
          >
            {["email", "text", "call", "in_person", "video", "other"].map(
              (channel) => (
                <option key={channel} value={channel}>
                  {channel.replace("_", " ")}
                </option>
              ),
            )}
          </select>
        </label>
        <label className="block space-y-2">
          <span>Timezone</span>
          <input
            className={fieldClass}
            name="timezone"
            required
            defaultValue={plan?.timezone ?? timezone}
            maxLength={100}
          />
        </label>
        <button disabled={pending} className={buttonClass}>
          {pending ? "Saving…" : plan ? "Save rhythm" : "Start reminders"}
        </button>
      </form>
      {plan && (
        <form
          className="mt-5 space-y-3 border-t border-[#deded5] pt-5"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const result = await save(url, "PATCH", {
              action,
              revision: plan.revision,
              ...(action === "snooze"
                ? { until: form.get("date") }
                : action === "resume"
                  ? { nextDueOn: form.get("date") }
                  : {}),
            });
            if (result) {
              setAction("");
              router.refresh();
            }
          }}
        >
          <label className="block space-y-2">
            <span>Adjust reminders</span>
            <select
              className={fieldClass}
              value={action}
              onChange={(event) => setAction(event.target.value)}
              required
            >
              <option value="">Choose an action</option>
              {plan.status === "paused" ? (
                <option value="resume">Resume reminders</option>
              ) : (
                <>
                  <option value="snooze">Snooze this check-in</option>
                  <option value="skip">Skip this cycle</option>
                  <option value="pause">Pause reminders</option>
                </>
              )}
            </select>
          </label>
          {(action === "snooze" || action === "resume") && (
            <label className="block space-y-2">
              <span>
                {action === "snooze"
                  ? "Show it again on"
                  : "Next check-in date"}
              </span>
              <input
                type="date"
                name="date"
                className={fieldClass}
                required
                defaultValue={action === "resume" ? plan.nextDueOn : undefined}
                min={action === "snooze" ? today : undefined}
              />
            </label>
          )}
          {action && (
            <>
              <p className="text-sm leading-6 text-[#62685e]">
                {action === "skip"
                  ? "This closes the current cycle and moves to the next future occurrence. It does not record contact."
                  : action === "pause"
                    ? "Recurring check-ins stay hidden until you resume. Contact history stays available."
                    : action === "snooze"
                      ? "Only this reminder moves. Your contact history and rhythm stay the same."
                      : "Keep the previous due date or choose a new one above."}
              </p>
              <button className={secondaryButtonClass} disabled={pending}>
                Apply change
              </button>
            </>
          )}
        </form>
      )}
      <div className="mt-3">
        <SaveFeedback error={error} pending={pending} />
      </div>
    </section>
  );
}
