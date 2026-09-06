CREATE TABLE "open_loop_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"person_id" uuid NOT NULL,
	"loop_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "open_loops" ADD COLUMN "interaction_id" uuid;--> statement-breakpoint
ALTER TABLE "open_loop_requests" ADD CONSTRAINT "open_loop_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_loop_requests" ADD CONSTRAINT "open_loop_requests_person_id_user_id_people_id_user_id_fk" FOREIGN KEY ("person_id","user_id") REFERENCES "public"."people"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "open_loop_requests_owner_key_uidx" ON "open_loop_requests" USING btree ("user_id","request_key");--> statement-breakpoint
ALTER TABLE "open_loops" ADD CONSTRAINT "open_loops_interaction_id_user_id_interactions_id_user_id_fk" FOREIGN KEY ("interaction_id","user_id") REFERENCES "public"."interactions"("id","user_id") ON DELETE no action ON UPDATE no action;