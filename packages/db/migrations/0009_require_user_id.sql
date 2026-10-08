-- 다중 사용자 전환 3단계(specs/002 research R4). 운영은 2026-10-08 에 기존 행을 관리자로 채운 뒤
-- 적용했다(채우기 스크립트는 그 뒤 지웠다 — 커밋 ea7d4e0 이력). 새로 만드는 빈 DB 는 null 이 없어
-- 0008 과 함께 그대로 적용된다. null 이 남아 있으면 SET NOT NULL 이 실패한다 — 주인 없는 행이 남지
-- 않는다는 보증이다.
-- 목록은 언제나 회원으로 먼저 좁혀지므로 단일 열 인덱스는 (user_id, …) 복합 인덱스로 대체한다.
DROP INDEX "conversations_updated_at_idx";--> statement-breakpoint
DROP INDEX "memories_created_at_idx";--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "memories" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
-- settings 의 PK: (key) → (user_id, key). 회원마다 같은 키를 하나씩 갖는다.
-- 이름이 다르면(직접 만든 DB 등) 아래 ADD 가 "multiple primary keys" 로 실패한다 — 그때는
-- information_schema.table_constraints 에서 이름을 확인해 이 줄을 고친다.
ALTER TABLE "settings" DROP CONSTRAINT "settings_pkey";--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_user_id_key_pk" PRIMARY KEY("user_id","key");
