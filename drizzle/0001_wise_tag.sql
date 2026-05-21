CREATE TABLE "ai_processing_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"task_type" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"priority" integer DEFAULT 50 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"model" text,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_person_summaries" ADD COLUMN "notable_advice" text;--> statement-breakpoint
ALTER TABLE "ai_person_summaries" ADD COLUMN "personal_details" text;--> statement-breakpoint
ALTER TABLE "ai_person_summaries" ADD COLUMN "open_loops" text;--> statement-breakpoint
ALTER TABLE "ai_person_summaries" ADD COLUMN "mentor_signal_score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_person_summaries" ADD COLUMN "mentor_signal_evidence" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_person_summaries" ADD COLUMN "needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_thread_summaries" ADD COLUMN "relationship_evidence" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_thread_summaries" ADD COLUMN "confidence" text DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_processing_tasks" ADD CONSTRAINT "ai_processing_tasks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_tasks_user_type_target_uidx" ON "ai_processing_tasks" USING btree ("user_id","task_type","target_id");--> statement-breakpoint
CREATE INDEX "ai_tasks_status_priority_idx" ON "ai_processing_tasks" USING btree ("status","priority");--> statement-breakpoint
CREATE INDEX "ai_tasks_user_status_idx" ON "ai_processing_tasks" USING btree ("user_id","status");