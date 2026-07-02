CREATE TABLE "google_archive_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"google_email" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"mode" text DEFAULT 'archive' NOT NULL,
	"local_folder_path" text,
	"message_count_estimate" integer DEFAULT 0 NOT NULL,
	"estimated_bytes" bigint DEFAULT 0 NOT NULL,
	"messages_seen" integer DEFAULT 0 NOT NULL,
	"messages_archived" integer DEFAULT 0 NOT NULL,
	"attachments_archived" integer DEFAULT 0 NOT NULL,
	"contacts_archived" integer DEFAULT 0 NOT NULL,
	"other_contacts_archived" integer DEFAULT 0 NOT NULL,
	"bytes_archived" bigint DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"checkpoint" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_mail_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"archive_job_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"gmail_message_id" text NOT NULL,
	"attachment_id" text NOT NULL,
	"filename" text,
	"mime_type" text,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"sha256" text,
	"data_base64" text,
	"local_file_path" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_mail_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"archive_job_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"gmail_message_id" text NOT NULL,
	"gmail_thread_id" text,
	"history_id" text,
	"label_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"internal_date" timestamp,
	"headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sender_email" text,
	"sender_name" text,
	"recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject" text,
	"snippet" text,
	"size_estimate" integer,
	"raw_base64" text,
	"raw_mime" text,
	"body_text" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"local_file_path" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_people_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"archive_job_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"source_type" text NOT NULL,
	"resource_name" text NOT NULL,
	"etag" text,
	"names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"email_addresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"phone_numbers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"organizations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw_json" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "google_archive_jobs" ADD CONSTRAINT "google_archive_jobs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_mail_attachments" ADD CONSTRAINT "google_mail_attachments_archive_job_id_google_archive_jobs_id_fk" FOREIGN KEY ("archive_job_id") REFERENCES "public"."google_archive_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_mail_attachments" ADD CONSTRAINT "google_mail_attachments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_mail_messages" ADD CONSTRAINT "google_mail_messages_archive_job_id_google_archive_jobs_id_fk" FOREIGN KEY ("archive_job_id") REFERENCES "public"."google_archive_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_mail_messages" ADD CONSTRAINT "google_mail_messages_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_people_contacts" ADD CONSTRAINT "google_people_contacts_archive_job_id_google_archive_jobs_id_fk" FOREIGN KEY ("archive_job_id") REFERENCES "public"."google_archive_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_people_contacts" ADD CONSTRAINT "google_people_contacts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "google_archive_jobs_user_idx" ON "google_archive_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "google_archive_jobs_status_idx" ON "google_archive_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "google_archive_jobs_created_idx" ON "google_archive_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "google_mail_attachments_message_attachment_uidx" ON "google_mail_attachments" USING btree ("user_id","gmail_message_id","attachment_id");--> statement-breakpoint
CREATE INDEX "google_mail_attachments_archive_idx" ON "google_mail_attachments" USING btree ("archive_job_id");--> statement-breakpoint
CREATE INDEX "google_mail_attachments_user_idx" ON "google_mail_attachments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "google_mail_attachments_message_idx" ON "google_mail_attachments" USING btree ("gmail_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "google_mail_messages_user_gmail_uidx" ON "google_mail_messages" USING btree ("user_id","gmail_message_id");--> statement-breakpoint
CREATE INDEX "google_mail_messages_archive_idx" ON "google_mail_messages" USING btree ("archive_job_id");--> statement-breakpoint
CREATE INDEX "google_mail_messages_user_idx" ON "google_mail_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "google_mail_messages_thread_idx" ON "google_mail_messages" USING btree ("gmail_thread_id");--> statement-breakpoint
CREATE UNIQUE INDEX "google_people_contacts_user_source_resource_uidx" ON "google_people_contacts" USING btree ("user_id","source_type","resource_name");--> statement-breakpoint
CREATE INDEX "google_people_contacts_archive_idx" ON "google_people_contacts" USING btree ("archive_job_id");--> statement-breakpoint
CREATE INDEX "google_people_contacts_user_idx" ON "google_people_contacts" USING btree ("user_id");