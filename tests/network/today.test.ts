import assert from "node:assert/strict";
import { test } from "node:test";
import { duePeople } from "../../src/lib/network/today";
test("Today derives due state without a worker and respects pauses, snoozes and plan timezones", () => {
  const now = new Date("2026-09-05T18:00:00Z");
  const base = {
    status: "active",
    timezone: "Asia/Shanghai",
    nextDueOn: "2026-09-06",
    snoozedUntil: null,
    lastContactOn: null,
  };
  const rows = [
    { id: "due", name: "Due fixture", plan: base },
    { id: "paused", name: "Paused", plan: { ...base, status: "paused" } },
    {
      id: "snoozed",
      name: "Snoozed",
      plan: { ...base, snoozedUntil: "2026-09-07" },
    },
    {
      id: "west",
      name: "West",
      plan: { ...base, timezone: "America/Los_Angeles" },
    },
    {
      id: "overdue",
      name: "Earlier",
      plan: { ...base, nextDueOn: "2026-09-01", lastContactOn: "2026-06-01" },
    },
  ];
  const result = duePeople(rows, now);
  assert.deepEqual(
    result.map((row) => row.id),
    ["overdue", "due"],
  );
  assert.match(result[1].reason, /First check-in you chose/);
});
