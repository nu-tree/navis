CREATE TABLE "feedbacks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sender_id" uuid NOT NULL,
	"sender_label" text NOT NULL,
	"text" text NOT NULL,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "feedbacks_created_idx" ON "feedbacks" USING btree ("created_at" DESC NULLS LAST);