import {
  pgTable,
  uuid,
  text,
  jsonb,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";

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
