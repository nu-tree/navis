CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "messages_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"conversation_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promise_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"promise_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"error" text,
	"message_id" uuid
);
--> statement-breakpoint
CREATE TABLE "promises" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"instruction" text NOT NULL,
	"label" text NOT NULL,
	"schedule_kind" text NOT NULL,
	"run_at" timestamp with time zone,
	"cron" text,
	"memo" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"lease_until" timestamp with time zone,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"origin_conversation_id" text,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promises_schedule_check" CHECK (("promises"."schedule_kind" = 'once' and "promises"."run_at" is not null and "promises"."cron" is null)
       or ("promises"."schedule_kind" = 'cron' and "promises"."cron" is not null and "promises"."run_at" is null))
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "session_turns" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "is_main" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promise_runs" ADD CONSTRAINT "promise_runs_promise_id_promises_id_fk" FOREIGN KEY ("promise_id") REFERENCES "public"."promises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_conversation_seq_idx" ON "messages" USING btree ("conversation_id","seq" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "promise_runs_promise_started_idx" ON "promise_runs" USING btree ("promise_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "promises_due_idx" ON "promises" USING btree ("next_run_at") WHERE "promises"."enabled";--> statement-breakpoint
CREATE INDEX "promises_user_idx" ON "promises" USING btree ("user_id","next_run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_user_main_idx" ON "conversations" USING btree ("user_id") WHERE "conversations"."is_main";--> statement-breakpoint
-- 기존 대화를 messages 표로 옮긴다(specs/003 R7). 배열 순서(ordinality)가 곧 seq 순서다.
-- id 가 uuid 가 아닌 옛 메시지는 새 uuid 를 받는다. images 는 원래 저장하지 않으므로 버린다.
-- conversations.messages 는 여기서 지우지 않는다 — 대조(quickstart S0) 뒤 0012 에서 지운다.
-- 이 마이그레이션과 새 코드 배포 사이에 옛 코드가 jsonb 에 쓴 메시지는 배포 뒤 같은 INSERT 를
-- 한 번 더 돌려 따라잡는다(ON CONFLICT 로 중복 없음, quickstart 운영 순서).
INSERT INTO "messages" ("id", "conversation_id", "user_id", "role", "text", "meta", "created_at")
SELECT
  CASE WHEN e.m->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       THEN (e.m->>'id')::uuid ELSE gen_random_uuid() END,
  c."id",
  c."user_id",
  e.m->>'role',
  coalesce(e.m->>'text', ''),
  jsonb_strip_nulls(jsonb_build_object('toolsUsed', e.m->'toolsUsed', 'saved', e.m->'saved')),
  coalesce((e.m->>'createdAt')::timestamptz, c."created_at")
FROM "conversations" c
CROSS JOIN LATERAL jsonb_array_elements(c."messages") WITH ORDINALITY AS e(m, ord)
ORDER BY c."id", e.ord
ON CONFLICT ("id") DO NOTHING;
