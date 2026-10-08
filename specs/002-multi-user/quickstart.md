# Quickstart — 여러 사람이 쓰는 나비스 검증

스펙: [spec.md](./spec.md) · 계약: [contracts/identity.md](./contracts/identity.md) ·
데이터: [data-model.md](./data-model.md)

## S0 — 준비 (운영)

1. Supabase 대시보드 → Authentication → **"Allow new users to sign up" 끄기**(research R9).
2. 관리자 uuid 확인: 대시보드 → Users → 지금 쓰는 계정의 UID. Secret Manager 에
   `navis-owner-id` 로 만들고 server 컨테이너에만 주입(`deploy/service.yaml`).
3. 운영 DB 의 pgvector 버전: `select extversion from pg_extension where extname = 'vector'` — **0.8 이상**
   이어야 `hnsw.iterative_scan` 을 쓴다(research R5).
4. 전환 전 건수를 적어 둔다: `select count(*) from memories` · `conversations` · `settings`.

## S1 — 전환 (research R4, SC-103)

```bash
DATABASE_URL=<운영> pnpm db:migrate                                   # 0008
DATABASE_URL=<운영> NAVIS_OWNER_ID=<uuid> pnpm --filter @navis/db assign-owner
DATABASE_URL=<운영> pnpm db:migrate                                   # 0009
git push origin main                                                  # 트리거가 배포
```

**기대**: assign-owner 가 출력한 테이블별 건수 = S0-4 의 건수. 0009 가 오류 없이 끝난다(= null 0건).
관리자로 로그인해 기억 · 방 · 설정(등록된 토큰의 끝 4자리)이 그대로인지 본다.

## S2 — 분리 (US1, SC-101)

1. 대시보드에서 회원 B 를 만든다. B 로 로그인 → 빈 나비스, 설정에 "등록되지 않음".
2. B 가 자기 토큰을 등록하고 "점심은 파스타"를 말한다. 관리자는 "점심은 국밥"을 말한다.
3. 관리자로: "내 점심 메뉴 뭐였지?" → 국밥만. 기억 화면 목록 · 검색("점심") · 할 일 · 프로젝트
   목록 · 비슷한 기억 · 내보내기 파일 어디에도 파스타가 없다.
4. B 로 반대로 확인한다.

## S3 — 남의 식별자 (SC-102)

관리자의 기억 id · 방 id 를 하나씩 적어 두고 B 의 세션으로 BFF 를 직접 부른다.

```bash
# 브라우저 개발자 도구에서 B 로 로그인한 상태
fetch("/api/memories/<관리자 기억 id>", { method: "DELETE" })       // → 404
fetch("/api/memories/<관리자 기억 id>/neighbors")                  // → 404
fetch("/api/conversations/<관리자 방 id>")                         // → 404
fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ conversationId: "<관리자 방 id>", text: "x", turnId: crypto.randomUUID() }) }) // → 404
```

**기대**: 전부 404 이고 관리자 쪽 데이터는 그대로. `x-navis-user` 헤더를 직접 붙여 보내도 결과가 같다
(BFF 가 넘기지 않는다).

## S4 — 토큰 (US3)

B 의 토큰을 지운 뒤 B 로 질문 → 토큰 등록 안내. 관리자의 대화는 그대로 된다.

## S5 — Claude Code (US5)

Claude Code 의 navis MCP 로 기억을 하나 저장 → 관리자 기억 화면에 보이고 B 에는 없다. Claude Code 로
"파스타" 검색 → 결과 없음.

## S6 — 속도 (SC-105)

기억 목록 · 검색 · 방 목록을 전환 전후로 각 5회 재서 중앙값을 비교한다. 두 배 이내.
