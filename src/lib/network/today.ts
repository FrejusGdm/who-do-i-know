import { todayInTimezone, visibleCheckInDate } from "./calendar";
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
