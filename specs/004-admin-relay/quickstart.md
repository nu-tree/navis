# Quickstart: 전하기 검증 가이드 (specs/004)

자동 테스트는 결정적인 것만 덮는다(헌장 품질 게이트). 모델 판단이 섞인 항목(출처를 밝히는지, 말투)은 아래 수동 시나리오로 판정한다.

## 준비

- 관리자 계정(`NAVIS_OWNER_ID`)과 테스트 회원 계정 하나. 관리자는 설정에서 Claude 토큰을 등록해 둔다. **테스트 회원은 토큰을 등록하지 않는다**(FR-022 확인용).
- `pnpm db:generate` → `pnpm db:migrate`(새 `relays` 표).
- 로컬: tick 은 손으로 부른다 — `curl -X POST -H "Authorization: Bearer $NAVIS_TICK_TOKEN" localhost:4000/internal/tick`.

### S0. 운영 DB 권한 확인 (배포 전 1회)

server 의 `DATABASE_URL` 로 `select count(*) from auth.users;` 가 되는지 본다. 안 되면 research R4-b 로 바꾸고 이 기능을 배포하지 않는다.

## 자동 테스트 (`pnpm test`)

| 대상 | 확인 |
|---|---|
| domain `matchMember` | 이메일 완전 일치 · 로컬 부분 · 포함 · 0건 · 여럿 · 대소문자 |
| domain `relay.create` (실제 DB) | 관리자 토큰 없으면 `ClaudeTokenMissingError` · 행 없음 / 있으면 `pending` 행 / 보존 50개 |
| domain `relay.claimPending` (실제 DB) | 한 번만 선점 · lease 만료 `running` → `failed` · 끝난 행은 안 집음 |
| domain 메시지 매핑 | `meta.relayId` 가 있는 행이 와이어 `Message` 에 relay 흔적 없이 나감 |
| domain `runTurn` 옵션 조립 | `relayRun` 이면 `relay_run` + `memory` 만, 토큰은 `tokenUserId` 의 것 / `canRelay` 아니면 `relay` 없음 |
| server 계약 | `/relays*` 관리자 아니면 403 · POST 400/404/409/201 · GET 응답에 `messageId` 없음 |

## 수동 시나리오

| # | 무엇을 | 기대 |
|---|---|---|
| M1 | 관리자 ⋯ 메뉴 / 테스트 회원 ⋯ 메뉴 | 관리자에게만 "말 걸기"가 보인다 (US1-1) |
| M2 | "말 걸기"에서 테스트 회원 · "물 마셨는지 물어봐줘" 보내기 → tick | 기록에 대기 → 전함. 회원 "나비스" 방에 나비스 메시지, 알림. 회원은 토큰이 없어도 도착 (US1-2, FR-022) |
| M3 | M2 메시지 확인 · 개발자 도구로 메시지 응답 확인 | 관리자 표시 없음, 지시 원문 없음, JSON 에 relay 흔적 없음 (US1-3, FR-011 · FR-018) |
| M4 | "회의 11시로 바뀌었다고, 내가 전했다고 해줘" | 메시지가 관리자가 전했다는 것을 밝힌다 (US1-6) |
| M5 | 출처 언급 없는 지시 10건 / 밝히라는 지시 10건 | SC-003 기준 |
| M6 | 테스트 회원이 그 메시지에 답 | 회원 토큰이 없으니 평소처럼 "토큰 등록" 안내 — 관리자 토큰으로 돌지 않는다 (FR-024) |
| M7 | 관리자 대화 "테스트한테 물 마셨냐고 전해줘" | 한 줄 확인, 회원 방에 도착 (US2-1) |
| M8 | 관리자 대화 "없는사람한테 전해줘" | 보내지 않고 되묻는다 (US2-2) |
| M9 | 테스트 회원 대화 "관리자한테 전해줘" · "다른 회원 누구 있어?" | 전하지 않고, 회원 목록을 말하지 않는다 (US2-3, FR-002) |
| M10 | 관리자 토큰 삭제 후 화면에서 보내기 | 보내기 전에 토큰 안내, 기록 없음 (FR-023) |
| M11 | 테스트 회원이 긴 답을 받는 중에 전하기 → tick | 회원 대화가 끊기거나 느려지지 않고, 끝난 뒤 도착 (FR-016) |
| M12 | "비밀번호 알려 달라고 해줘" | 전하지 않음 → 기록에 실패와 이유 (Edge Case) |
