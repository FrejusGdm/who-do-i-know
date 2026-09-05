import {
  and,
  asc,
  desc,
  eq,
  isNull,
  ne,
  or,
  ilike,
  exists,
  sql,
  getTableColumns,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  circleMembers,
  circles,
  interactionParticipants,
  interactions,
  keepInTouchPlans,
  networkSettings,
  notes,
  people,
} from "@/db/schema";
import { NetworkError } from "./store";

function contactDates(userId: string) {
  const latest = (direction: string) =>
    sql<string | null>`(${db
      .select({
        date: sql<string | null>`max(${interactions.occurredOn})::text`,
      })
      .from(interactions)
      .innerJoin(
        interactionParticipants,
        eq(interactionParticipants.interactionId, interactions.id),
      )
      .where(
        and(
          eq(interactionParticipants.personId, people.id),
          eq(interactionParticipants.userId, userId),
          eq(interactions.userId, userId),
          eq(interactions.datePrecision, "day"),
          eq(interactions.direction, direction),
        ),
      )})`;
  return { lastOutboundOn: latest("outbound"), lastMutualOn: latest("mutual") };
}

export async function networkPeople(
  userId: string,
  raw: {
    q?: string;
    circle?: string;
    type?: string;
    status?: string;
    page?: string;
    metState?: string;
  } = {},
) {
  const query = (raw.q ?? "").trim().slice(0, 200);
  const page = Math.max(
    1,
    Math.min(10000, Number.parseInt(raw.page ?? "1", 10) || 1),
  );
  const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  const filter = and(
    eq(people.userId, userId),
    raw.status === "archived"
      ? eq(people.reviewStatus, "archived")
      : and(isNull(people.archivedAt), ne(people.reviewStatus, "archived")),
    raw.type ? eq(people.relationshipType, raw.type.slice(0, 80)) : undefined,
    raw.metState ? eq(people.metState, raw.metState.slice(0, 80)) : undefined,
    raw.circle
      ? exists(
          db
            .select({ id: circleMembers.personId })
            .from(circleMembers)
            .where(
              and(
                eq(circleMembers.personId, people.id),
                eq(circleMembers.userId, userId),
                eq(circleMembers.circleId, z.string().uuid().parse(raw.circle)),
              ),
            ),
        )
      : undefined,
    query
      ? or(
          ilike(people.name, pattern),
          ilike(people.primaryEmail, pattern),
          ilike(people.organization, pattern),
          ilike(people.manualNotes, pattern),
          exists(
            db
              .select({ id: notes.id })
              .from(notes)
              .where(
                and(
                  eq(notes.personId, people.id),
                  eq(notes.userId, userId),
                  ilike(notes.body, pattern),
                ),
              ),
          ),
          exists(
            db
              .select({ id: interactions.id })
              .from(interactions)
              .innerJoin(
                interactionParticipants,
                eq(interactionParticipants.interactionId, interactions.id),
              )
              .where(
                and(
                  eq(interactions.userId, userId),
                  eq(interactionParticipants.userId, userId),
                  eq(interactionParticipants.personId, people.id),
                  ilike(interactions.body, pattern),
                ),
              ),
          ),
        )
      : undefined,
  );
  const rows = await db
    .select({
      id: people.id,
      name: people.name,
      primaryEmail: people.primaryEmail,
      organization: people.organization,
      relationshipType: people.relationshipType,
      metState: people.metState,
      reviewStatus: people.reviewStatus,
      plan: keepInTouchPlans,
      ...contactDates(userId),
    })
    .from(people)
    .leftJoin(
      keepInTouchPlans,
      and(
        eq(keepInTouchPlans.personId, people.id),
        eq(keepInTouchPlans.userId, userId),
      ),
    )
    .where(filter)
    .orderBy(asc(people.name), asc(people.id))
    .limit(51)
    .offset((page - 1) * 50);
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(people)
    .where(filter);
  return { people: rows.slice(0, 50), page, hasMore: rows.length > 50, total };
}

export async function networkPlannedPeople(userId: string) {
  return db
    .select({
      id: people.id,
      name: people.name,
      primaryEmail: people.primaryEmail,
      organization: people.organization,
      relationshipType: people.relationshipType,
      metState: people.metState,
      plan: keepInTouchPlans,
    })
    .from(people)
    .innerJoin(
      keepInTouchPlans,
      and(
        eq(keepInTouchPlans.personId, people.id),
        eq(keepInTouchPlans.userId, userId),
      ),
    )
    .where(
      and(
        eq(people.userId, userId),
        isNull(people.archivedAt),
        ne(people.reviewStatus, "archived"),
      ),
    )
    .orderBy(asc(people.name));
}

export async function networkCircles(userId: string) {
  const [rows, memberships] = await Promise.all([
    db
      .select()
      .from(circles)
      .where(eq(circles.userId, userId))
      .orderBy(asc(circles.name)),
    db
      .select({
        circleId: circleMembers.circleId,
        personId: circleMembers.personId,
      })
      .from(circleMembers)
      .innerJoin(
        people,
        and(eq(people.id, circleMembers.personId), eq(people.userId, userId)),
      )
      .where(
        and(
          eq(circleMembers.userId, userId),
          isNull(people.archivedAt),
          ne(people.reviewStatus, "archived"),
        ),
      ),
  ]);
  return rows.map((circle) => ({
    ...circle,
    personIds: memberships
      .filter((member) => member.circleId === circle.id)
      .map((member) => member.personId),
  }));
}

export async function networkPerson(userId: string, personId: string) {
  if (!z.string().uuid().safeParse(personId).success)
    throw new NetworkError(404, "Person not found");
  const [person] = await db
    .select({ ...getTableColumns(people), ...contactDates(userId) })
    .from(people)
    .where(and(eq(people.id, personId), eq(people.userId, userId)));
  if (!person) throw new NetworkError(404, "Person not found");
  const [plans, events, noteRows, circleRows] = await Promise.all([
    db
      .select()
      .from(keepInTouchPlans)
      .where(
        and(
          eq(keepInTouchPlans.personId, personId),
          eq(keepInTouchPlans.userId, userId),
        ),
      )
      .limit(1),
    db
      .select({ interaction: interactions })
      .from(interactions)
      .innerJoin(
        interactionParticipants,
        and(
          eq(interactionParticipants.interactionId, interactions.id),
          eq(interactionParticipants.userId, userId),
        ),
      )
      .where(
        and(
          eq(interactions.userId, userId),
          eq(interactionParticipants.personId, personId),
        ),
      )
      .orderBy(
        sql`${interactions.occurredOn} desc nulls last`,
        desc(interactions.createdAt),
      )
      .limit(100),
    db
      .select()
      .from(notes)
      .where(and(eq(notes.personId, personId), eq(notes.userId, userId)))
      .orderBy(desc(notes.createdAt))
      .limit(50),
    networkCircles(userId),
  ]);
  return {
    person,
    plan: plans[0] ?? null,
    interactions: events.map((event) => event.interaction),
    notes: noteRows,
    circles: circleRows,
  };
}

export async function ownerSettings(userId: string) {
  const [settings] = await db
    .select()
    .from(networkSettings)
    .where(eq(networkSettings.userId, userId));
  return (
    settings ?? {
      userId,
      timezone: "Asia/Shanghai",
      cloudProcessingAllowed: false,
      draftingLanguage: null,
    }
  );
}
