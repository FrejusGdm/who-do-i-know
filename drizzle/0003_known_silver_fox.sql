CREATE TABLE "linkedin_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"person_id" uuid,
	"first_name" text,
	"last_name" text,
	"full_name" text NOT NULL,
	"profile_url" text,
	"email_address" text,
	"company" text,
	"position" text,
	"connected_on" timestamp,
	"match_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"raw_row" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linkedin_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"title" text,
	"folder" text,
	"participant_profile_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"first_message_at" timestamp,
	"last_message_at" timestamp,
	"source" text DEFAULT 'linkedin' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linkedin_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_person_id" uuid,
	"recipient_person_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"linkedin_conversation_id" text NOT NULL,
	"conversation_title" text,
	"sender_name" text,
	"sender_profile_url" text,
	"recipient_names" text,
	"recipient_profile_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sent_at" timestamp,
	"subject" text,
	"content" text,
	"folder" text,
	"attachments" text,
	"match_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"raw_row" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_import_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"path" text NOT NULL,
	"content_text" text,
	"content_sha256" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"row_count" integer,
	"is_parsed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "linkedin_connections" ADD CONSTRAINT "linkedin_connections_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_connections" ADD CONSTRAINT "linkedin_connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_connections" ADD CONSTRAINT "linkedin_connections_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_conversations" ADD CONSTRAINT "linkedin_conversations_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_conversations" ADD CONSTRAINT "linkedin_conversations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_messages" ADD CONSTRAINT "linkedin_messages_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_messages" ADD CONSTRAINT "linkedin_messages_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_messages" ADD CONSTRAINT "linkedin_messages_conversation_id_linkedin_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."linkedin_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_messages" ADD CONSTRAINT "linkedin_messages_sender_person_id_people_id_fk" FOREIGN KEY ("sender_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_import_files" ADD CONSTRAINT "raw_import_files_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_import_files" ADD CONSTRAINT "raw_import_files_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "linkedin_connections_user_idx" ON "linkedin_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "linkedin_connections_import_idx" ON "linkedin_connections" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX "linkedin_connections_person_idx" ON "linkedin_connections" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "linkedin_conversations_import_conversation_uidx" ON "linkedin_conversations" USING btree ("import_id","conversation_id");--> statement-breakpoint
CREATE INDEX "linkedin_conversations_user_idx" ON "linkedin_conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "linkedin_messages_user_idx" ON "linkedin_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "linkedin_messages_import_idx" ON "linkedin_messages" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX "linkedin_messages_conversation_idx" ON "linkedin_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "linkedin_messages_sender_person_idx" ON "linkedin_messages" USING btree ("sender_person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_import_files_import_path_uidx" ON "raw_import_files" USING btree ("import_id","path");--> statement-breakpoint
CREATE INDEX "raw_import_files_user_idx" ON "raw_import_files" USING btree ("user_id");