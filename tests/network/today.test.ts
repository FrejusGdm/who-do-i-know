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

test("Today groups independent deadlines, puts commitments first, and uses seven local calendar days", async () => {
  const { todayPeople } = await import("../../src/lib/network/today");
  const now = new Date("2026-09-05T18:00:00Z");
  const plan = {
    status: "active",
    timezone: "Asia/Shanghai",
    nextDueOn: "2026-09-01",
    snoozedUntil: null,
    lastContactOn: null,
  };
  const planned = ["routine", "both", "paused", "snoozed"].map((id) => ({
    id,
    name: id,
    relationshipType: "mentor",
    plan: {
      ...plan,
      status: id === "paused" ? "paused" : "active",
      snoozedUntil: id === "snoozed" ? "2027-01-01" : null,
    },
  }));
  const reminder = (
    personId: string,
    dueOn: string | null,
    status: "open" | "done" | "dismissed" = "open",
    id = personId,
  ) => ({
    person: { id: personId, name: personId, relationshipType: "mentor" },
    loop: {
      id,
      personId,
      dueOn,
      status,
      body: "Synthetic promise",
      revision: 1,
      interactionId: null,
    },
    lastContactOn: null,
  });
  const reminders = [
    reminder("both", "2026-09-08"),
    reminder("both", "2026-09-07", "open", "second"),
    reminder("paused", "2026-08-01"),
    reminder("snoozed", "2026-09-13"),
    reminder("future", "2026-09-14"),
    reminder("undated", null),
    reminder("done", "2026-09-01", "done"),
    reminder("dismissed", "2026-09-01", "dismissed"),
  ];
  const result = todayPeople(planned, reminders, "Asia/Shanghai", now);
  assert.deepEqual(
    result.map((row) => row.id),
    ["paused", "both", "snoozed", "routine"],
  );
  assert.equal(result[0].reason, null);
  assert.equal(result[2].reason, null);
  assert.equal(result[1].commitments.length, 2);
  assert.match(result[1].reason!, /2026-09-01/);
  assert.equal(result[1].commitments[0].dueOn, "2026-09-07");
  assert.equal(
    todayPeople(
      [],
      [reminder("west", "2026-09-13")],
      "America/Los_Angeles",
      now,
    ).length,
    0,
  );
  const unplanned = todayPeople(
    [],
    [reminder("no-plan", "2026-09-06")],
    "Asia/Shanghai",
    now,
  )[0];
  assert.equal(unplanned.plan, null);
  assert.equal(unplanned.lastContactOn, null);
});
