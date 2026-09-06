CREATE TABLE "network_ai_usage" (
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_processing_tasks" ADD COLUMN "source_revision" integer;--> statement-breakpoint
ALTER TABLE "ai_processing_tasks" ADD COLUMN "generation_key" uuid;--> statement-breakpoint
ALTER TABLE "ai_processing_tasks" ADD COLUMN "lease_token" uuid;--> statement-breakpoint
ALTER TABLE "ai_processing_tasks" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_processing_tasks" ADD COLUMN "available_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_processing_tasks" ADD COLUMN "error_category" text;--> statement-breakpoint
ALTER TABLE "network_settings" ADD COLUMN "ai_configuration_key" text;--> statement-breakpoint
ALTER TABLE "network_ai_usage" ADD CONSTRAINT "network_ai_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "network_ai_usage_owner_day_uidx" ON "network_ai_usage" USING btree ("user_id","day");