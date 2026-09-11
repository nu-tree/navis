-- 데이터 정리. 앞 마이그레이션이 created_at 을 추가했고, 다음 마이그레이션이
-- 레거시 컬럼(kind·unread·hidden·deleted_at)을 지운다. 그 사이에 와야 한다.

-- 1) created_at 백필.
--    앞 마이그레이션의 DEFAULT now() 가 기존 행 전부에 "지금"을 박아넣었다.
--    실제 생성 시각을 알 길이 없으므로 updated_at 으로 되돌린다 — 정확하진 않지만
--    "전부 오늘 만들어짐" 보다는 참에 가깝고, 목록 정렬이 updated_at 기준이라
--    화면에도 모순이 없다.
UPDATE conversations SET created_at = updated_at;
--> statement-breakpoint

-- 2) 툼스톤 실제 삭제.
--    deleted_at 은 기기 간 Last-Write-Wins 동기화용 소프트 삭제였다. 클라이언트가
--    하나가 되면서 그 동기화를 가져오지 않기로 했고(STRUCTURE.md 4항), 다음
--    마이그레이션이 이 컬럼을 지운다.
--
--    ★ 지우기 전에 행을 실제로 삭제해야 한다. 컬럼만 없애면 사용자가 삭제한 대화가
--      전부 목록에 되살아난다.
DELETE FROM conversations WHERE deleted_at IS NOT NULL;
