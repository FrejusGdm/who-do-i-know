import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  jsonb,
  integer,
  timestamp,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ── Better Auth tables ──────────────────────────────────────────────

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

// ── App tables ──────────────────────────────────────────────────────

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userEmail: text("user_email").notNull(),
  status: text("status").notNull().default("pending"),
  filterConfig: jsonb("filter_config"),
  contactCount: integer("contact_count"),
  blobUrl: text("blob_url"),
  errorMessage: text("error_message"),
  providerMode: text("provider_mode").notNull().default("cloud"),
  stripeSessionId: text("stripe_session_id"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  downloadedAt: timestamp("downloaded_at"),
});

export const people = pgTable(
  "people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    primaryEmail: text("primary_email").notNull(),
    name: text("name").notNull(),
    phone: text("phone"),
    linkedInUrl: text("linkedin_url"),
    instagramUrl: text("instagram_url"),
    twitterUrl: text("twitter_url"),
    websiteUrl: text("website_url"),
    organization: text("organization"),
    role: text("role"),
    relationshipType: text("relationship_type").notNull().default("unknown"),
    reviewStatus: text("review_status").notNull().default("new"),
    importanceScore: integer("importance_score").notNull().default(50),
    lastContactedAt: timestamp("last_contacted_at"),
    nextFollowUpAt: timestamp("next_follow_up_at"),
    source: text("source").notNull().default("gmail"),
    manualNotes: text("manual_notes"),
    archivedAt: timestamp("archived_at"),
    archivedReason: text("archived_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("people_user_primary_email_uidx").on(table.userId, table.primaryEmail),
    index("people_user_idx").on(table.userId),
    index("people_user_review_status_idx").on(table.userId, table.reviewStatus),
    index("people_last_contacted_idx").on(table.lastContactedAt),
  ],
);

export const contactMethods = pgTable(
  "contact_methods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    value: text("value").notNull(),
    label: text("label"),
    source: text("source").notNull().default("gmail"),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("contact_methods_person_type_value_uidx").on(table.personId, table.type, table.value),
    index("contact_methods_person_idx").on(table.personId),
  ],
);

export const emailThreads = pgTable(
  "email_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    gmailThreadId: text("gmail_thread_id").notNull(),
    subject: text("subject"),
    snippet: text("snippet"),
    participants: jsonb("participants").$type<string[]>().notNull().default([]),
    messageCount: integer("message_count").notNull().default(0),
    userReplied: boolean("user_replied").notNull().default(false),
    lastMessageAt: timestamp("last_message_at"),
    rawStored: boolean("raw_stored").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("email_threads_user_gmail_thread_uidx").on(table.userId, table.gmailThreadId),
    index("email_threads_user_idx").on(table.userId),
  ],
);

export const emailMessages = pgTable(
  "email_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => emailThreads.id, { onDelete: "cascade" }),
    gmailMessageId: text("gmail_message_id").notNull(),
    senderEmail: text("sender_email").notNull(),
    senderName: text("sender_name"),
    recipients: jsonb("recipients").$type<string[]>().notNull().default([]),
    subject: text("subject"),
    snippet: text("snippet"),
    body: text("body"),
    sentAt: timestamp("sent_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("email_messages_user_gmail_message_uidx").on(table.userId, table.gmailMessageId),
    index("email_messages_thread_idx").on(table.threadId),
  ],
);

export const personThreadLinks = pgTable(
  "person_thread_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => emailThreads.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("person_thread_links_person_thread_uidx").on(table.personId, table.threadId),
    index("person_thread_links_person_idx").on(table.personId),
  ],
);

export const aiThreadSummaries = pgTable(
  "ai_thread_summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => emailThreads.id, { onDelete: "cascade" }),
    summary: text("summary").notNull(),
    topics: jsonb("topics").$type<string[]>().notNull().default([]),
    decisions: text("decisions"),
    personalDetails: text("personal_details"),
    followUpSignals: text("follow_up_signals"),
    relationshipEvidence: jsonb("relationship_evidence").$type<string[]>().notNull().default([]),
    confidence: text("confidence").notNull().default("medium"),
    model: text("model").notNull().default("relationship-pipeline"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("ai_thread_summaries_thread_idx").on(table.threadId)],
);

export const aiPersonSummaries = pgTable(
  "ai_person_summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    summary: text("summary").notNull(),
    howYouKnowThem: text("how_you_know_them"),
    whyTheyMatter: text("why_they_matter"),
    naturalNextMessage: text("natural_next_message"),
    notableAdvice: text("notable_advice"),
    personalDetails: text("personal_details"),
    openLoops: text("open_loops"),
    mentorSignalScore: integer("mentor_signal_score").notNull().default(0),
    mentorSignalEvidence: jsonb("mentor_signal_evidence").$type<string[]>().notNull().default([]),
    needsReview: boolean("needs_review").notNull().default(false),
    classification: text("classification").notNull().default("unknown"),
    model: text("model").notNull().default("relationship-pipeline"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("ai_person_summaries_person_idx").on(table.personId)],
);

export const aiProcessingTasks = pgTable(
  "ai_processing_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    taskType: text("task_type").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    status: text("status").notNull().default("queued"),
    priority: integer("priority").notNull().default(50),
    attempts: integer("attempts").notNull().default(0),
    model: text("model"),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("ai_tasks_user_type_target_uidx").on(table.userId, table.taskType, table.targetId),
    index("ai_tasks_status_priority_idx").on(table.status, table.priority),
    index("ai_tasks_user_status_idx").on(table.userId, table.status),
  ],
);

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    followUpReason: text("follow_up_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("notes_person_idx").on(table.personId),
    index("notes_user_idx").on(table.userId),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("tags_user_name_uidx").on(table.userId, table.name)],
);

export const personTags = pgTable(
  "person_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("person_tags_person_tag_uidx").on(table.personId, table.tagId)],
);

export const outreachTasks = pgTable(
  "outreach_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    priority: integer("priority").notNull().default(50),
    status: text("status").notNull().default("queued"),
    reason: text("reason").notNull(),
    suggestedTone: text("suggested_tone"),
    draftMessage: text("draft_message"),
    dueAt: timestamp("due_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("outreach_tasks_user_status_idx").on(table.userId, table.status),
    index("outreach_tasks_person_idx").on(table.personId),
  ],
);

export const imports = pgTable("imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  status: text("status").notNull().default("pending"),
  sourceLabel: text("source_label"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const syncRuns = pgTable("sync_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("gmail"),
  status: text("status").notNull().default("pending"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  stats: jsonb("stats").$type<Record<string, unknown>>().notNull().default({}),
  errorMessage: text("error_message"),
});

export const peopleRelations = relations(people, ({ many, one }) => ({
  user: one(user, {
    fields: [people.userId],
    references: [user.id],
  }),
  contactMethods: many(contactMethods),
  notes: many(notes),
  summaries: many(aiPersonSummaries),
  outreachTasks: many(outreachTasks),
  threadLinks: many(personThreadLinks),
}));

export const emailThreadRelations = relations(emailThreads, ({ many, one }) => ({
  user: one(user, {
    fields: [emailThreads.userId],
    references: [user.id],
  }),
  messages: many(emailMessages),
  summaries: many(aiThreadSummaries),
  personLinks: many(personThreadLinks),
}));
