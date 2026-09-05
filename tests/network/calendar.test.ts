import assert from "node:assert/strict";
import { test } from "node:test";
import { addCalendarInterval, contactAdvancesPlan, isCalendarDate, nextOccurrenceAfter, todayInTimezone, visibleCheckInDate } from "../../src/lib/network/calendar";

const quarterly = { count: 3, unit: "months" } as const;
test("quarterly means calendar months, not ninety days", () => {
  assert.equal(addCalendarInterval("2026-09-05", quarterly), "2026-12-05");
  assert.equal(addCalendarInterval("2026-11-30", quarterly), "2027-02-28");
  assert.equal(addCalendarInterval("2023-11-30", quarterly), "2024-02-29");
});
test("skipping overdue cycles preserves the original month-end anchor", () => {
  const monthly = { count: 1, unit: "months" } as const;
  assert.equal(nextOccurrenceAfter("2026-01-31", monthly, "2026-02-28"), "2026-03-31");
  assert.equal(nextOccurrenceAfter("2025-11-30", quarterly, "2026-09-06"), "2026-11-30");
  assert.equal(nextOccurrenceAfter("2026-09-20", quarterly, "2026-09-06"), "2026-09-20");
});
test("days and weeks cross year boundaries without DST arithmetic", () => {
  assert.equal(addCalendarInterval("2026-12-31", { count: 1, unit: "days" }), "2027-01-01");
  assert.equal(addCalendarInterval("2026-03-01", { count: 2, unit: "weeks" }), "2026-03-15");
});
test("invalid dates and intervals fail instead of silently rolling forward", () => {
  for (const date of ["2026-02-29", "2024-13-01", "2026-09-31", "yesterday", "0001-01-01"]) {
    assert.equal(isCalendarDate(date), false);
    assert.throws(() => addCalendarInterval(date, quarterly));
  }
  assert.throws(() => addCalendarInterval("2026-09-05", { count: 0, unit: "months" }));
  assert.throws(() => addCalendarInterval("2026-09-05", quarterly, -1));
});
test("notes, uncertain dates, duplicate dates and historical backfills cannot advance a plan", () => {
  assert.equal(contactAdvancesPlan(null, null, true), false);
  assert.equal(contactAdvancesPlan(null, "2026-09-05", false), false);
  assert.equal(contactAdvancesPlan("2026-09-05", "2026-09-05", true), false);
  assert.equal(contactAdvancesPlan("2026-09-05", "2026-06-01", true), false);
  assert.equal(contactAdvancesPlan("2026-09-05", "2026-09-06", true), true);
});
test("due dates use the owner's timezone even across midnight", () => {
  const now = new Date("2026-09-05T18:00:00Z");
  assert.equal(todayInTimezone("Asia/Shanghai", now), "2026-09-06");
  assert.equal(todayInTimezone("America/New_York", now), "2026-09-05");
});
test("snooze postpones presentation without altering the due date", () => {
  assert.equal(visibleCheckInDate("2026-09-05", "2026-09-12"), "2026-09-12");
  assert.equal(visibleCheckInDate("2026-09-05", "2026-09-01"), "2026-09-05");
});
