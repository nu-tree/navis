CREATE TABLE IF NOT EXISTS "turn_signals" (
	"turn_id" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "turn_signals_turn_id_kind_pk" PRIMARY KEY("turn_id","kind")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "turn_signals_created_at_idx" ON "turn_signals" USING btree ("created_at");