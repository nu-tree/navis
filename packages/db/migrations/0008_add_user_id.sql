ALTER TABLE "conversations" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "user_id" uuid;--> statement-breakpoint
CREATE INDEX "conversations_user_updated_idx" ON "conversations" USING btree ("user_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "memories_user_created_idx" ON "memories" USING btree ("user_id","created_at" DESC NULLS LAST);