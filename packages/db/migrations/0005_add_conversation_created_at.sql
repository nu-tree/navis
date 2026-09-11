ALTER TABLE "crons" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profile" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "crons" CASCADE;--> statement-breakpoint
DROP TABLE "profile" CASCADE;--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "kind" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "messages" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "unread" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "unread" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "hidden" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "hidden" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "conversations_updated_at_idx" ON "conversations" USING btree ("updated_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "memories" DROP COLUMN "source";