CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_person_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"summary" text NOT NULL,
	"how_you_know_them" text,
	"why_they_matter" text,
	"natural_next_message" text,
	"classification" text DEFAULT 'unknown' NOT NULL,
	"model" text DEFAULT 'relationship-pipeline' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_thread_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"summary" text NOT NULL,
	"topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"decisions" text,
	"personal_details" text,
	"follow_up_signals" text,
	"model" text DEFAULT 'relationship-pipeline' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"type" text NOT NULL,
	"value" text NOT NULL,
	"label" text,
	"source" text DEFAULT 'gmail' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"thread_id" uuid NOT NULL,
	"gmail_message_id" text NOT NULL,
	"sender_email" text NOT NULL,
	"sender_name" text,
	"recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject" text,
	"snippet" text,
	"body" text,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"gmail_thread_id" text NOT NULL,
	"subject" text,
	"snippet" text,
	"participants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"user_replied" boolean DEFAULT false NOT NULL,
	"last_message_at" timestamp,
	"raw_stored" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source_label" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_email" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"filter_config" jsonb,
	"contact_count" integer,
	"blob_url" text,
	"error_message" text,
	"provider_mode" text DEFAULT 'cloud' NOT NULL,
	"stripe_session_id" text,
	"created_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	"downloaded_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"body" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"follow_up_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"priority" integer DEFAULT 50 NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"reason" text NOT NULL,
	"suggested_tone" text,
	"draft_message" text,
	"due_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"primary_email" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"linkedin_url" text,
	"instagram_url" text,
	"twitter_url" text,
	"website_url" text,
	"organization" text,
	"role" text,
	"relationship_type" text DEFAULT 'unknown' NOT NULL,
	"importance_score" integer DEFAULT 50 NOT NULL,
	"last_contacted_at" timestamp,
	"next_follow_up_at" timestamp,
	"source" text DEFAULT 'gmail' NOT NULL,
	"manual_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_thread_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" text DEFAULT 'gmail' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_person_summaries" ADD CONSTRAINT "ai_person_summaries_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_thread_summaries" ADD CONSTRAINT "ai_thread_summaries_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_methods" ADD CONSTRAINT "contact_methods_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_tasks" ADD CONSTRAINT "outreach_tasks_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_tasks" ADD CONSTRAINT "outreach_tasks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_tags" ADD CONSTRAINT "person_tags_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_tags" ADD CONSTRAINT "person_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_thread_links" ADD CONSTRAINT "person_thread_links_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_thread_links" ADD CONSTRAINT "person_thread_links_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_person_summaries_person_idx" ON "ai_person_summaries" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "ai_thread_summaries_thread_idx" ON "ai_thread_summaries" USING btree ("thread_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_methods_person_type_value_uidx" ON "contact_methods" USING btree ("person_id","type","value");--> statement-breakpoint
CREATE INDEX "contact_methods_person_idx" ON "contact_methods" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_messages_user_gmail_message_uidx" ON "email_messages" USING btree ("user_id","gmail_message_id");--> statement-breakpoint
CREATE INDEX "email_messages_thread_idx" ON "email_messages" USING btree ("thread_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_threads_user_gmail_thread_uidx" ON "email_threads" USING btree ("user_id","gmail_thread_id");--> statement-breakpoint
CREATE INDEX "email_threads_user_idx" ON "email_threads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notes_person_idx" ON "notes" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "notes_user_idx" ON "notes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "outreach_tasks_user_status_idx" ON "outreach_tasks" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "outreach_tasks_person_idx" ON "outreach_tasks" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "people_user_primary_email_uidx" ON "people" USING btree ("user_id","primary_email");--> statement-breakpoint
CREATE INDEX "people_user_idx" ON "people" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "people_last_contacted_idx" ON "people" USING btree ("last_contacted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "person_tags_person_tag_uidx" ON "person_tags" USING btree ("person_id","tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "person_thread_links_person_thread_uidx" ON "person_thread_links" USING btree ("person_id","thread_id");--> statement-breakpoint
CREATE INDEX "person_thread_links_person_idx" ON "person_thread_links" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_user_name_uidx" ON "tags" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");