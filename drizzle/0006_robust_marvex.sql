CREATE TABLE "confirmed_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"person_id" uuid NOT NULL,
	"proposal_id" uuid,
	"label" text NOT NULL,
	"body" text NOT NULL,
	"share_in_drafts" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_people" (
	"user_id" text NOT NULL,
	"interview_id" uuid NOT NULL,
	"person_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"interview_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"ordinal" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interview_turns_role_check" CHECK ("interview_turns"."role" in ('user', 'assistant'))
);
--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"request_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"title" text NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interviews_status_check" CHECK ("interviews"."status" in ('active', 'paused', 'reviewing', 'completed', 'discarded'))
);
--> statement-breakpoint
CREATE TABLE "memory_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"interview_id" uuid NOT NULL,
	"generation_key" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"sources" jsonb NOT NULL,
	"confidence" text DEFAULT 'low' NOT NULL,
	"uncertainty" text DEFAULT '' NOT NULL,
	"sensitive" boolean DEFAULT true NOT NULL,
	"identity_hints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unresolved_identity" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"source_revision" integer NOT NULL,
	"review_hash" text,
	"accepted_ref" jsonb,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "open_loops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"person_id" uuid NOT NULL,
	"proposal_id" uuid,
	"body" text NOT NULL,
	"due_on" date,
	"status" text DEFAULT 'open' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"proposal_id" uuid,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"happened_on" date,
	"allowed_person_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_circle_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "confirmed_facts_id_owner_uidx" ON "confirmed_facts" USING btree ("id","user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "interview_people_unique" ON "interview_people" USING btree ("interview_id","person_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "interview_turns_id_owner_uidx" ON "interview_turns" USING btree ("id","user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "interview_turns_request_uidx" ON "interview_turns" USING btree ("interview_id","request_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "interview_turns_ordinal_uidx" ON "interview_turns" USING btree ("interview_id","ordinal");
--> statement-breakpoint
CREATE UNIQUE INDEX "interviews_id_owner_uidx" ON "interviews" USING btree ("id","user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "interviews_owner_request_uidx" ON "interviews" USING btree ("user_id","request_key");
--> statement-breakpoint
CREATE INDEX "interviews_owner_updated_idx" ON "interviews" USING btree ("user_id","updated_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "memory_proposals_id_owner_uidx" ON "memory_proposals" USING btree ("id","user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "memory_proposals_generation_uidx" ON "memory_proposals" USING btree ("interview_id","generation_key","ordinal");
--> statement-breakpoint
CREATE INDEX "memory_proposals_owner_status_idx" ON "memory_proposals" USING btree ("user_id","status");
--> statement-breakpoint
CREATE INDEX "open_loops_owner_due_idx" ON "open_loops" USING btree ("user_id","status","due_on");
--> statement-breakpoint
ALTER TABLE "confirmed_facts" ADD CONSTRAINT "confirmed_facts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "confirmed_facts" ADD CONSTRAINT "confirmed_facts_person_id_user_id_people_id_user_id_fk" FOREIGN KEY ("person_id","user_id") REFERENCES "public"."people"("id","user_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "confirmed_facts" ADD CONSTRAINT "confirmed_facts_proposal_id_user_id_memory_proposals_id_user_id_fk" FOREIGN KEY ("proposal_id","user_id") REFERENCES "public"."memory_proposals"("id","user_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "interview_people" ADD CONSTRAINT "interview_people_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "interview_people" ADD CONSTRAINT "interview_people_interview_id_user_id_interviews_id_user_id_fk" FOREIGN KEY ("interview_id","user_id") REFERENCES "public"."interviews"("id","user_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "interview_people" ADD CONSTRAINT "interview_people_person_id_user_id_people_id_user_id_fk" FOREIGN KEY ("person_id","user_id") REFERENCES "public"."people"("id","user_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "interview_turns" ADD CONSTRAINT "interview_turns_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "interview_turns" ADD CONSTRAINT "interview_turns_interview_id_user_id_interviews_id_user_id_fk" FOREIGN KEY ("interview_id","user_id") REFERENCES "public"."interviews"("id","user_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "memory_proposals" ADD CONSTRAINT "memory_proposals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "memory_proposals" ADD CONSTRAINT "memory_proposals_interview_id_user_id_interviews_id_user_id_fk" FOREIGN KEY ("interview_id","user_id") REFERENCES "public"."interviews"("id","user_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "open_loops" ADD CONSTRAINT "open_loops_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "open_loops" ADD CONSTRAINT "open_loops_person_id_user_id_people_id_user_id_fk" FOREIGN KEY ("person_id","user_id") REFERENCES "public"."people"("id","user_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "open_loops" ADD CONSTRAINT "open_loops_proposal_id_user_id_memory_proposals_id_user_id_fk" FOREIGN KEY ("proposal_id","user_id") REFERENCES "public"."memory_proposals"("id","user_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "personal_updates" ADD CONSTRAINT "personal_updates_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "personal_updates" ADD CONSTRAINT "personal_updates_proposal_id_user_id_memory_proposals_id_user_id_fk" FOREIGN KEY ("proposal_id","user_id") REFERENCES "public"."memory_proposals"("id","user_id") ON DELETE no action ON UPDATE no action;
