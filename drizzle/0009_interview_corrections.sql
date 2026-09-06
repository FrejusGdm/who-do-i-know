CREATE TABLE "interview_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"interview_id" uuid NOT NULL,
	"turn_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"action" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "keep_in_touch_plans" ADD COLUMN "needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "interview_corrections" ADD CONSTRAINT "interview_corrections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_corrections" ADD CONSTRAINT "interview_corrections_interview_id_user_id_interviews_id_user_id_fk" FOREIGN KEY ("interview_id","user_id") REFERENCES "public"."interviews"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_corrections" ADD CONSTRAINT "interview_corrections_turn_id_user_id_interview_turns_id_user_id_fk" FOREIGN KEY ("turn_id","user_id") REFERENCES "public"."interview_turns"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "interview_corrections_owner_request_uidx" ON "interview_corrections" USING btree ("user_id","request_key");