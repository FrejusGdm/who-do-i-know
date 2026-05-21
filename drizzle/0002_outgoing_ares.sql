ALTER TABLE "people" ADD COLUMN "review_status" text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "archived_reason" text;--> statement-breakpoint
CREATE INDEX "people_user_review_status_idx" ON "people" USING btree ("user_id","review_status");