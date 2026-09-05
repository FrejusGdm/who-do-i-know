"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass, fieldClass } from "./NetworkShell";
import { SaveFeedback, useNetworkMutation } from "./useNetworkMutation";
export function LogContact({
  personId,
  today,
}: {
  personId: string;
  today: string;
}) {
  const [precision, setPrecision] = useState("unknown");
  const [saved, setSaved] = useState(false);
  const replay = useRef<{ body: string; key: string } | null>(null);
  const { save, pending, error } = useNetworkMutation();
  const router = useRouter();
  return (
    <section
      id="log-contact"
      className="rounded-lg border border-[#deded5] bg-white p-5"
    >
      <h2 className="text-xl font-medium text-balance">Record what happened</h2>
      <p className="mt-2 text-sm leading-6 text-[#62685e]">
        A conversation, a message you sent, or an exchange you want to remember.
      </p>
      <form
        className="mt-5 space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const element = event.currentTarget;
          const form = new FormData(element);
          const body = {
            body: form.get("body"),
            channel: form.get("channel"),
            direction: form.get("direction"),
            datePrecision: precision,
            occurredOn:
              precision === "day" || precision === "range"
                ? form.get("occurredOn") || null
                : null,
            occurredUntil:
              precision === "range" ? form.get("occurredUntil") || null : null,
            datePhrase:
              precision === "month" || precision === "range"
                ? form.get("datePhrase") || null
                : null,
            qualifiesForCadence: form.has("qualifiesForCadence"),
            shareInDrafts: form.has("shareInDrafts"),
          };
          const serialized = JSON.stringify(body);
          if (replay.current?.body !== serialized)
            replay.current = { body: serialized, key: crypto.randomUUID() };
          const result = await save(
            `/api/people/${personId}/interactions`,
            "POST",
            { ...body, requestKey: replay.current.key },
          );
          if (result) {
            replay.current = null;
            element.reset();
            setPrecision("unknown");
            setSaved(true);
            router.refresh();
          }
        }}
        onChange={() => setSaved(false)}
      >
        <label className="block space-y-2">
          <span>What would you like to remember?</span>
          <textarea
            className={fieldClass}
            name="body"
            required
            rows={4}
            maxLength={12000}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span>Channel</span>
            <select
              name="channel"
              className={fieldClass}
              defaultValue="in_person"
            >
              {["in_person", "email", "text", "call", "video", "other"].map(
                (channel) => (
                  <option key={channel} value={channel}>
                    {channel.replace("_", " ")}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="space-y-2">
            <span>Exchange</span>
            <select
              name="direction"
              className={fieldClass}
              defaultValue="mutual"
            >
              <option value="mutual">Two-way exchange</option>
              <option value="outbound">I reached out</option>
              <option value="inbound">They reached out</option>
            </select>
          </label>
        </div>
        <label className="block space-y-2">
          <span>When was it?</span>
          <select
            className={fieldClass}
            value={precision}
            onChange={(event) => setPrecision(event.target.value)}
          >
            <option value="unknown">I don’t remember the date</option>
            <option value="day">I know the date</option>
            <option value="month">An approximate month</option>
            <option value="range">A date range</option>
          </select>
        </label>
        {(precision === "day" || precision === "range") && (
          <label className="block space-y-2">
            <span>{precision === "range" ? "From" : "Actual date"}</span>
            <input
              name="occurredOn"
              className={fieldClass}
              type="date"
              max={today}
              required
            />
          </label>
        )}
        {precision === "range" && (
          <label className="block space-y-2">
            <span>Until</span>
            <input
              name="occurredUntil"
              className={fieldClass}
              type="date"
              max={today}
              required
            />
          </label>
        )}
        {(precision === "month" || precision === "range") && (
          <label className="block space-y-2">
            <span>The date in your own words</span>
            <input
              name="datePhrase"
              className={fieldClass}
              maxLength={200}
              required={precision === "month"}
              placeholder="Sometime in August"
            />
          </label>
        )}
        <label className="flex min-h-11 items-start gap-3 py-2">
          <input
            type="checkbox"
            name="qualifiesForCadence"
            defaultChecked
            className="mt-1 size-4 shrink-0 accent-[#43664F]"
          />
          <span>
            Count this toward our check-in rhythm
            <span className="mt-1 block text-sm text-[#62685e]">
              Only an exact date can move a reminder. An outgoing message does
              not imply a reply.
            </span>
          </span>
        </label>
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            name="shareInDrafts"
            className="size-4 accent-[#43664F]"
          />
          <span>Allow this context in future message drafts</span>
        </label>
        <SaveFeedback error={error} pending={pending} />
        {saved && (
          <p role="status" className="text-sm text-[#43664F]">
            Contact saved.
          </p>
        )}
        <button className={buttonClass} disabled={pending}>
          {pending ? "Saving…" : "Save contact"}
        </button>
      </form>
    </section>
  );
}
