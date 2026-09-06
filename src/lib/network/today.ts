import {
  addCalendarInterval,
  todayInTimezone,
  visibleCheckInDate,
} from "./calendar";
import type { OpenLoopView } from "./open-loops";
type PlannedPerson = {
  id: string;
  name: string;
  plan: {
    status: string;
    timezone: string;
    nextDueOn: string;
    snoozedUntil: string | null;
    lastContactOn: string | null;
  };
};

export function duePeople<T extends PlannedPerson>(
  people: T[],
  now = new Date(),
): (T & { reason: string })[] {
  return people
    .filter(
      ({ plan }) =>
        plan.status === "active" &&
        visibleCheckInDate(plan.nextDueOn, plan.snoozedUntil) <=
          todayInTimezone(plan.timezone, now),
    )
    .sort(
      (a, b) =>
        a.plan.nextDueOn.localeCompare(b.plan.nextDueOn) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    )
    .map((person) => ({
      ...person,
      reason: person.plan.snoozedUntil
        ? `Snooze ended · originally due ${person.plan.nextDueOn}`
        : person.plan.lastContactOn
          ? `Your chosen rhythm · due ${person.plan.nextDueOn}`
          : `First check-in you chose · ${person.plan.nextDueOn}`,
    }));
}

type Reminder = {
  person: { id: string; name: string; relationshipType: string };
  loop: Omit<OpenLoopView, "sourceInterviewId">;
  lastContactOn: string | null;
};

/** Promises keep their own deadlines even when a routine plan is paused or snoozed. */
export function todayPeople<
  T extends PlannedPerson & { relationshipType: string },
>(planned: T[], reminders: Reminder[], timezone: string, now = new Date()) {
  type Entry = Reminder["person"] & {
    plan: T["plan"] | null;
    reason: string | null;
    lastContactOn: string | null;
    commitments: Reminder["loop"][];
  };
  const horizon = addCalendarInterval(todayInTimezone(timezone, now), {
    count: 7,
    unit: "days",
  });
  const grouped = new Map<string, Entry>();
  for (const person of duePeople(planned, now)) {
    grouped.set(person.id, {
      ...person,
      lastContactOn: person.plan.lastContactOn,
      commitments: [],
    });
  }
  for (const { person, loop, lastContactOn } of reminders) {
    if (loop.status !== "open" || !loop.dueOn || loop.dueOn > horizon) continue;
    const entry: Entry = grouped.get(person.id) ?? {
      ...person,
      plan: planned.find((row) => row.id === person.id)?.plan ?? null,
      reason: null,
      lastContactOn,
      commitments: [],
    };
    entry.commitments.push(loop);
    grouped.set(person.id, entry);
  }
  for (const entry of grouped.values())
    entry.commitments.sort(
      (a, b) => a.dueOn!.localeCompare(b.dueOn!) || a.id.localeCompare(b.id),
    );
  return [...grouped.values()].sort(
    (a, b) =>
      Number(Boolean(b.commitments.length)) -
        Number(Boolean(a.commitments.length)) ||
      (a.commitments[0]?.dueOn ?? a.plan!.nextDueOn).localeCompare(
        b.commitments[0]?.dueOn ?? b.plan!.nextDueOn,
      ) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  );
}
