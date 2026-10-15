CREATE TABLE "relays" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sender_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"recipient_label" text NOT NULL,
	"instruction" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"message_id" uuid,
	"lease_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "relays_pending_idx" ON "relays" USING btree ("created_at") WHERE "relays"."status" in ('pending', 'running');--> statement-breakpoint
CREATE INDEX "relays_sender_created_idx" ON "relays" USING btree ("sender_id","created_at" DESC NULLS LAST);