ALTER TABLE "interviews" ADD COLUMN "draft_content" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN "draft_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN "draft_request_key" uuid;