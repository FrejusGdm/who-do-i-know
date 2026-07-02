import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  jsonb,
  integer,
  bigint,
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

export const rawImportFiles = pgTable(
  "raw_import_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importId: uuid("import_id")
      .notNull()
      .references(() => imports.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    contentText: text("content_text"),
    contentSha256: text("content_sha256").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    rowCount: integer("row_count"),
    isParsed: boolean("is_parsed").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("raw_import_files_import_path_uidx").on(table.importId, table.path),
    index("raw_import_files_user_idx").on(table.userId),
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

export const linkedinConnections = pgTable(
  "linkedin_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importId: uuid("import_id")
      .notNull()
      .references(() => imports.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    personId: uuid("person_id").references(() => people.id, { onDelete: "set null" }),
    firstName: text("first_name"),
    lastName: text("last_name"),
    fullName: text("full_name").notNull(),
    profileUrl: text("profile_url"),
    emailAddress: text("email_address"),
    company: text("company"),
    position: text("position"),
    connectedOn: timestamp("connected_on"),
    matchMetadata: jsonb("match_metadata").$type<Record<string, unknown>>().notNull().default({}),
    rawRow: jsonb("raw_row").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("linkedin_connections_user_idx").on(table.userId),
    index("linkedin_connections_import_idx").on(table.importId),
    index("linkedin_connections_person_idx").on(table.personId),
  ],
);

export const linkedinConversations = pgTable(
  "linkedin_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importId: uuid("import_id")
      .notNull()
      .references(() => imports.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").notNull(),
    title: text("title"),
    folder: text("folder"),
    participantProfileUrls: jsonb("participant_profile_urls").$type<string[]>().notNull().default([]),
    messageCount: integer("message_count").notNull().default(0),
    firstMessageAt: timestamp("first_message_at"),
    lastMessageAt: timestamp("last_message_at"),
    source: text("source").notNull().default("linkedin"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("linkedin_conversations_import_conversation_uidx").on(table.importId, table.conversationId),
    index("linkedin_conversations_user_idx").on(table.userId),
  ],
);

export const linkedinMessages = pgTable(
  "linkedin_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importId: uuid("import_id")
      .notNull()
      .references(() => imports.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => linkedinConversations.id, { onDelete: "cascade" }),
    senderPersonId: uuid("sender_person_id").references(() => people.id, { onDelete: "set null" }),
    recipientPersonIds: jsonb("recipient_person_ids").$type<string[]>().notNull().default([]),
    linkedinConversationId: text("linkedin_conversation_id").notNull(),
    conversationTitle: text("conversation_title"),
    senderName: text("sender_name"),
    senderProfileUrl: text("sender_profile_url"),
    recipientNames: text("recipient_names"),
    recipientProfileUrls: jsonb("recipient_profile_urls").$type<string[]>().notNull().default([]),
    sentAt: timestamp("sent_at"),
    subject: text("subject"),
    content: text("content"),
    folder: text("folder"),
    attachments: text("attachments"),
    matchMetadata: jsonb("match_metadata").$type<Record<string, unknown>>().notNull().default({}),
    rawRow: jsonb("raw_row").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("linkedin_messages_user_idx").on(table.userId),
    index("linkedin_messages_import_idx").on(table.importId),
    index("linkedin_messages_conversation_idx").on(table.conversationId),
    index("linkedin_messages_sender_person_idx").on(table.senderPersonId),
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

export const googleArchiveJobs = pgTable(
  "google_archive_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    googleEmail: text("google_email"),
    status: text("status").notNull().default("pending"),
    mode: text("mode").notNull().default("archive"),
    localFolderPath: text("local_folder_path"),
    messageCountEstimate: integer("message_count_estimate").notNull().default(0),
    estimatedBytes: bigint("estimated_bytes", { mode: "number" }).notNull().default(0),
    messagesSeen: integer("messages_seen").notNull().default(0),
    messagesArchived: integer("messages_archived").notNull().default(0),
    attachmentsArchived: integer("attachments_archived").notNull().default(0),
    contactsArchived: integer("contacts_archived").notNull().default(0),
    otherContactsArchived: integer("other_contacts_archived").notNull().default(0),
    bytesArchived: bigint("bytes_archived", { mode: "number" }).notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    checkpoint: jsonb("checkpoint").$type<Record<string, unknown>>().notNull().default({}),
    stats: jsonb("stats").$type<Record<string, unknown>>().notNull().default({}),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("google_archive_jobs_user_idx").on(table.userId),
    index("google_archive_jobs_status_idx").on(table.status),
    index("google_archive_jobs_created_idx").on(table.createdAt),
  ],
);

export const googleMailMessages = pgTable(
  "google_mail_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    archiveJobId: uuid("archive_job_id")
      .notNull()
      .references(() => googleArchiveJobs.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    gmailMessageId: text("gmail_message_id").notNull(),
    gmailThreadId: text("gmail_thread_id"),
    historyId: text("history_id"),
    labelIds: jsonb("label_ids").$type<string[]>().notNull().default([]),
    internalDate: timestamp("internal_date"),
    headers: jsonb("headers").$type<Record<string, string>>().notNull().default({}),
    senderEmail: text("sender_email"),
    senderName: text("sender_name"),
    recipients: jsonb("recipients").$type<string[]>().notNull().default([]),
    subject: text("subject"),
    snippet: text("snippet"),
    sizeEstimate: integer("size_estimate"),
    rawBase64: text("raw_base64"),
    rawMime: text("raw_mime"),
    bodyText: text("body_text"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    localFilePath: text("local_file_path"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("google_mail_messages_user_gmail_uidx").on(table.userId, table.gmailMessageId),
    index("google_mail_messages_archive_idx").on(table.archiveJobId),
    index("google_mail_messages_user_idx").on(table.userId),
    index("google_mail_messages_thread_idx").on(table.gmailThreadId),
  ],
);

export const googleMailAttachments = pgTable(
  "google_mail_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    archiveJobId: uuid("archive_job_id")
      .notNull()
      .references(() => googleArchiveJobs.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    gmailMessageId: text("gmail_message_id").notNull(),
    attachmentId: text("attachment_id").notNull(),
    filename: text("filename"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    sha256: text("sha256"),
    dataBase64: text("data_base64"),
    localFilePath: text("local_file_path"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("google_mail_attachments_message_attachment_uidx").on(table.userId, table.gmailMessageId, table.attachmentId),
    index("google_mail_attachments_archive_idx").on(table.archiveJobId),
    index("google_mail_attachments_user_idx").on(table.userId),
    index("google_mail_attachments_message_idx").on(table.gmailMessageId),
  ],
);

export const googlePeopleContacts = pgTable(
  "google_people_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    archiveJobId: uuid("archive_job_id")
      .notNull()
      .references(() => googleArchiveJobs.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(),
    resourceName: text("resource_name").notNull(),
    etag: text("etag"),
    names: jsonb("names").$type<string[]>().notNull().default([]),
    emailAddresses: jsonb("email_addresses").$type<string[]>().notNull().default([]),
    phoneNumbers: jsonb("phone_numbers").$type<string[]>().notNull().default([]),
    organizations: jsonb("organizations").$type<string[]>().notNull().default([]),
    rawJson: jsonb("raw_json").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("google_people_contacts_user_source_resource_uidx").on(table.userId, table.sourceType, table.resourceName),
    index("google_people_contacts_archive_idx").on(table.archiveJobId),
    index("google_people_contacts_user_idx").on(table.userId),
  ],
);

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
  linkedinConnections: many(linkedinConnections),
  linkedinMessages: many(linkedinMessages),
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

export const googleArchiveJobRelations = relations(googleArchiveJobs, ({ many, one }) => ({
  user: one(user, {
    fields: [googleArchiveJobs.userId],
    references: [user.id],
  }),
  messages: many(googleMailMessages),
  attachments: many(googleMailAttachments),
  contacts: many(googlePeopleContacts),
}));

export const googleMailMessageRelations = relations(googleMailMessages, ({ one }) => ({
  archiveJob: one(googleArchiveJobs, {
    fields: [googleMailMessages.archiveJobId],
    references: [googleArchiveJobs.id],
  }),
  user: one(user, {
    fields: [googleMailMessages.userId],
    references: [user.id],
  }),
}));

export const googleMailAttachmentRelations = relations(googleMailAttachments, ({ one }) => ({
  archiveJob: one(googleArchiveJobs, {
    fields: [googleMailAttachments.archiveJobId],
    references: [googleArchiveJobs.id],
  }),
  user: one(user, {
    fields: [googleMailAttachments.userId],
    references: [user.id],
  }),
}));

export const googlePeopleContactRelations = relations(googlePeopleContacts, ({ one }) => ({
  archiveJob: one(googleArchiveJobs, {
    fields: [googlePeopleContacts.archiveJobId],
    references: [googleArchiveJobs.id],
  }),
  user: one(user, {
    fields: [googlePeopleContacts.userId],
    references: [user.id],
  }),
}));

export const importRelations = relations(imports, ({ many, one }) => ({
  user: one(user, {
    fields: [imports.userId],
    references: [user.id],
  }),
  rawFiles: many(rawImportFiles),
  linkedinConnections: many(linkedinConnections),
  linkedinConversations: many(linkedinConversations),
  linkedinMessages: many(linkedinMessages),
}));

export const rawImportFileRelations = relations(rawImportFiles, ({ one }) => ({
  import: one(imports, {
    fields: [rawImportFiles.importId],
    references: [imports.id],
  }),
  user: one(user, {
    fields: [rawImportFiles.userId],
    references: [user.id],
  }),
}));

export const linkedinConnectionRelations = relations(linkedinConnections, ({ one }) => ({
  import: one(imports, {
    fields: [linkedinConnections.importId],
    references: [imports.id],
  }),
  user: one(user, {
    fields: [linkedinConnections.userId],
    references: [user.id],
  }),
  person: one(people, {
    fields: [linkedinConnections.personId],
    references: [people.id],
  }),
}));

export const linkedinConversationRelations = relations(linkedinConversations, ({ many, one }) => ({
  import: one(imports, {
    fields: [linkedinConversations.importId],
    references: [imports.id],
  }),
  user: one(user, {
    fields: [linkedinConversations.userId],
    references: [user.id],
  }),
  messages: many(linkedinMessages),
}));

export const linkedinMessageRelations = relations(linkedinMessages, ({ one }) => ({
  import: one(imports, {
    fields: [linkedinMessages.importId],
    references: [imports.id],
  }),
  user: one(user, {
    fields: [linkedinMessages.userId],
    references: [user.id],
  }),
  conversation: one(linkedinConversations, {
    fields: [linkedinMessages.conversationId],
    references: [linkedinConversations.id],
  }),
  senderPerson: one(people, {
    fields: [linkedinMessages.senderPersonId],
    references: [people.id],
  }),
}));
