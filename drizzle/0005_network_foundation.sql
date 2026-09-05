CREATE TABLE "check_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"plan_id" uuid NOT NULL,
	"cycle_key" text NOT NULL,
	"due_on" date NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"interaction_id" uuid,
	"decision" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "circle_members" (
	"user_id" text NOT NULL,
	"circle_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "circles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'circle' NOT NULL,
	"cohort_label" text,
	"expected_count" integer,
	"source_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interaction_participants" (
	"user_id" text NOT NULL,
	"interaction_id" uuid NOT NULL,
	"person_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"request_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"body" text NOT NULL,
	"channel" text NOT NULL,
	"direction" text DEFAULT 'mutual' NOT NULL,
	"date_precision" text DEFAULT 'unknown' NOT NULL,
	"occurred_on" date,
	"occurred_until" date,
	"date_phrase" text,
	"qualifies_for_cadence" boolean DEFAULT false NOT NULL,
	"share_in_drafts" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interactions_precision_check" CHECK ("interactions"."date_precision" in ('day', 'month', 'range', 'unknown')),
	CONSTRAINT "interactions_exact_check" CHECK ("interactions"."date_precision" <> 'day' OR "interactions"."occurred_on" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "keep_in_touch_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"person_id" uuid NOT NULL,
	"interval_count" integer DEFAULT 3 NOT NULL,
	"interval_unit" text DEFAULT 'months' NOT NULL,
	"timezone" text DEFAULT 'Asia/Shanghai' NOT NULL,
	"preferred_channel" text DEFAULT 'email' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"anchor_on" date NOT NULL,
	"next_due_on" date NOT NULL,
	"last_contact_on" date,
	"snoozed_until" date,
	"cycle_number" integer DEFAULT 1 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_interval_count_check" CHECK ("keep_in_touch_plans"."interval_count" between 1 and 120),
	CONSTRAINT "plans_interval_unit_check" CHECK ("keep_in_touch_plans"."interval_unit" in ('days', 'weeks', 'months'))
);
--> statement-breakpoint
CREATE TABLE "network_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"timezone" text DEFAULT 'Asia/Shanghai' NOT NULL,
	"cloud_processing_allowed" boolean DEFAULT false NOT NULL,
	"drafting_language" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "people" ALTER COLUMN "primary_email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "met_state" text DEFAULT 'needs_context' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "check_ins_cycle_uidx" ON "check_ins" USING btree ("plan_id","cycle_key");--> statement-breakpoint
CREATE UNIQUE INDEX "circle_members_unique" ON "circle_members" USING btree ("user_id","circle_id","person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "circles_id_owner_uidx" ON "circles" USING btree ("id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "circles_owner_name_uidx" ON "circles" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "interaction_participants_unique" ON "interaction_participants" USING btree ("user_id","interaction_id","person_id");--> statement-breakpoint
CREATE INDEX "interaction_participants_person_idx" ON "interaction_participants" USING btree ("user_id","person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "interactions_id_owner_uidx" ON "interactions" USING btree ("id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "interactions_owner_request_uidx" ON "interactions" USING btree ("user_id","request_key");--> statement-breakpoint
CREATE INDEX "interactions_owner_date_idx" ON "interactions" USING btree ("user_id","occurred_on");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_owner_person_uidx" ON "keep_in_touch_plans" USING btree ("user_id","person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_id_owner_uidx" ON "keep_in_touch_plans" USING btree ("id","user_id");--> statement-breakpoint
CREATE INDEX "plans_owner_due_idx" ON "keep_in_touch_plans" USING btree ("user_id","status","next_due_on");--> statement-breakpoint
CREATE UNIQUE INDEX "people_id_owner_uidx" ON "people" USING btree ("id","user_id");--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_plan_id_user_id_keep_in_touch_plans_id_user_id_fk" FOREIGN KEY ("plan_id","user_id") REFERENCES "public"."keep_in_touch_plans"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_interaction_id_user_id_interactions_id_user_id_fk" FOREIGN KEY ("interaction_id","user_id") REFERENCES "public"."interactions"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_members" ADD CONSTRAINT "circle_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_members" ADD CONSTRAINT "circle_members_circle_id_user_id_circles_id_user_id_fk" FOREIGN KEY ("circle_id","user_id") REFERENCES "public"."circles"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_members" ADD CONSTRAINT "circle_members_person_id_user_id_people_id_user_id_fk" FOREIGN KEY ("person_id","user_id") REFERENCES "public"."people"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interaction_participants" ADD CONSTRAINT "interaction_participants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interaction_participants" ADD CONSTRAINT "interaction_participants_interaction_id_user_id_interactions_id_user_id_fk" FOREIGN KEY ("interaction_id","user_id") REFERENCES "public"."interactions"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interaction_participants" ADD CONSTRAINT "interaction_participants_person_id_user_id_people_id_user_id_fk" FOREIGN KEY ("person_id","user_id") REFERENCES "public"."people"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keep_in_touch_plans" ADD CONSTRAINT "keep_in_touch_plans_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keep_in_touch_plans" ADD CONSTRAINT "keep_in_touch_plans_person_id_user_id_people_id_user_id_fk" FOREIGN KEY ("person_id","user_id") REFERENCES "public"."people"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_settings" ADD CONSTRAINT "network_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;