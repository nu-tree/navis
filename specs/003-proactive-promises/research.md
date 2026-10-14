# Research: 먼저 말 거는 나비스 — 약속

**Feature**: [spec.md](./spec.md) · **Date**: 2026-10-14

대화(2026-10-14)에서 정한 것과 코드 조사에서 나온 사실을 결정 단위로 남긴다. 각 항목은
결정 · 근거 · 검토한 대안 순이다.

---

## R1. 무엇이 약속을 깨우나 — Cloud Scheduler 작업 1개

**Decision**: Cloud Scheduler HTTP 작업 하나가 기본 **1분마다**(`* * * * *`) web 의
`/api/internal/tick` 을 부른다. web 은 `/api/mcp` 와 같은 방식으로 `Authorization` 만 server
`/internal/tick` 에 그대로 넘기고, 검증은 server 가 한다. 간격은 Scheduler 작업의 일정으로만 정한다.
server 는 간격을 모른다. 비용이 걱정되면 `*/5 * * * *` 로 바꾸면 끝이다.

**Rationale**:
- `deploy/service.yaml` 은 `minScale: "0"` 이다. 쓰지 않으면 인스턴스가 사라지므로 프로세스 안의 타이머
  (예전 node-cron)는 돌 수 없다.
- 확인은 DB 조회 한 번(R3)이고 모델을 부르지 않는다. 실측(10/6~14) 평소 하루 1,400~2,000
  인스턴스·초에, 1분 tick 으로 하루 150~300초쯤 늘어난다. 무료 한도 안이다.
- 인스턴스가 계속 데워져 있게 되어 오래 쉰 뒤 첫 대화의 콜드 스타트가 줄어드는 부수 효과가 있다.
- 이 프로젝트에서 Cloud Scheduler API 는 아직 켜진 적이 없다(2026-10-14 `gcloud scheduler jobs list` →
  API 미사용). 작업 3개까지 무료다.

**Alternatives**:
- *프로세스 내 cron*: scale-to-zero 에서 죽는다.
- *Cloud Tasks 로 약속마다 정확한 시각 예약*: 오차가 초 단위다. 하지만 약속을 고치거나 끄거나 지울 때마다
  작업을 지우고 다시 걸어야 하고, 반복 약속은 회차마다 다시 걸어야 한다. 사용자가 "약속은 조금 늦어도 된다"고
  해서 이 복잡도를 살 이유가 없다. 디스패처만 바꾸면 되므로 나중에 옮길 수 있다.
- *minScale 1*: 인스턴스가 늘 떠 있어 무료 한도를 넘는다.

## R2. 응답을 보낸 뒤에는 CPU 가 없다 — tick 요청이 실행을 끝까지 붙든다

**Decision**: `/internal/tick` 은 기한이 된 약속을 선점(R3)한 뒤, 그 약속들의 실행이 **끝날 때까지 응답을
보내지 않는다**. Scheduler 작업은 `attemptDeadline` 을 30분(HTTP 대상 상한)으로 두고 재시도는 하지 않는다
(`maxRetryCount 0`). 실패한 회차는 다음 tick 이 다시 집는다(R3 임대 만료).

**Rationale**: Cloud Run 은 요청 기반 과금(CPU 스로틀링)이라 **응답을 보낸 뒤에는 CPU 를 거의 주지 않는다.**
"200 을 먼저 주고 뒤에서 실행"하면 약속 턴이 멈춘 채 다음 요청을 기다린다. tick 이 1분마다 겹쳐 열려도
문제없다. 선점이 중복을 막고, 열린 요청이 있는 동안 CPU 가 붙는다.

**Alternatives**: *CPU 항상 할당(인스턴스 기반 과금)*은 하루 내내 과금된다. *응답 후 백그라운드*는 위 이유로
멈춘다.

## R3. 한 회차는 한 번만 — 선점 + 임대

**Decision**: tick 은 한 트랜잭션에서 다음 일을 한다.

```
SELECT … FROM promises
 WHERE enabled AND next_run_at <= now() AND (lease_until IS NULL OR lease_until < now())
 ORDER BY next_run_at LIMIT 5
 FOR UPDATE SKIP LOCKED
```

이렇게 고른 행마다 아래 두 가지를 한 번에 커밋한 뒤 실행한다.
- `lease_until = now() + 15분`
- `promise_runs` 에 `running` 행을 하나 넣는다(회차 = 이 행의 `scheduled_for`)

실행이 끝나면 다음 값을 쓰고 임대를 푼다. 다음 회차는 **지금 이후의 첫 회차**다. 놓친 회차는 몰아서 돌리지
않는다(FR-016).
- `next_run_at`: 다음 회차. 한 번짜리 약속은 끝(`enabled = false`, `ended_at`)
- `last_run_at`
- `memo`
- 연속 실패 횟수

**Rationale**:
- `next_run_at` 계산에 cron 해석(R6)이 필요해 SQL 하나로 끝낼 수 없다. 그래서 행 잠금으로 고르고 JS 로 계산한다.
- 인스턴스가 실행 중에 죽으면(배포 · 장애) 임대가 만료되어 다음 tick 이 다시 집는다. 남은 `running` 행은
  `failed(중단됨)` 으로 닫는다.
- 결과적으로 정상 경로에서는 정확히 한 번 실행되고, 죽은 경우에만 한 번 더 실행된다. 알림을 잃는 것보다
  드물게 두 번 실행되는 쪽이 비서로서 덜 나쁘다.
- `LIMIT 5` 는 한 tick 이 너무 오래 붙들지 않게 한다. 남은 것은 다음 tick 이 가져간다.

**실행 중 서버가 죽는 경우는 예방이 먼저이고, 임대는 안전망이다**(2026-10-14 사용자 질문):
- *배포*: Cloud Run 은 새 리비전으로 넘어갈 때 이전 인스턴스가 처리 중인 요청을 끝까지 마치게 둔다.
  tick 이 실행을 끝까지 붙들므로(R2) 배포가 실행을 끊지 않는다. 구현 때 공식 문서로 다시 확인한다.
- *scale-to-zero*: 열린 요청이 있는 동안 내려가지 않는다.
- *SIGTERM*: 받으면 runner 가 새 선점을 멈추고 진행 중 실행만 마친다.
- *메모리 초과*: 직렬 실행(R4)과 S9 실측으로 막는다.
- 남는 것은 프로세스 버그와 인프라 장애뿐이다. 임대(열 하나)는 이때 `running` 이 영원히 남아 약속이 다시 돌지
  못하는 것을 막는다.

**Alternatives**:
- *`UPDATE … RETURNING` 하나로 next_run_at 을 밀기*: cron 다음 회차를 SQL 로 못 구한다.
- *advisory lock*: 행 단위 임대보다 상태가 안 보인다.

## R4. 약속 턴은 직렬, 대화가 먼저

**Decision**:
- `apps/server` 에 프로세스 로컬 **직렬 큐**(`promise-runner.ts`)를 둔다. 약속 턴은 한 번에 하나만 돈다.
- 실행 직전에 **같은 회원의 대화 턴**이 진행 중이면 끝날 때까지 기다린다(최대 10분, 넘으면 그냥 실행한다).
- 이를 위해 `routes/chat.ts` 의 `activeConversations: Set<roomId>` 를 회원도 아는 작은 레지스트리
  (`apps/server/src/turns.ts`: `activeTurns`, `isUserBusy(userId)`, `waitUntilIdle(userId)`)로 옮긴다.
- 반대 방향은 막지 않는다. 약속 턴이 도는 중에 사용자가 말을 걸면 대화 턴은 즉시 시작한다.

**Rationale**:
- 사용자 최우선 걱정은 "지금 빠른 대화가 느려지지 않는 것"이다(SC-003).
- 에이전트 턴은 대부분 모델 응답을 기다리는 시간이라 CPU 경합은 작다. 위험은 Agent SDK 가 턴마다 띄우는
  서브프로세스의 **메모리**다(server 1Gi).
- 약속 턴을 하나로 제한하면 최악의 동시 실행은 "대화 턴 N + 약속 턴 1"로 고정된다.
- quickstart S9 에서 동시 실행 메모리를 실측한다. 빠듯하면 server 메모리를 1.5Gi 로 올린다.

**Alternatives**: *다른 회원 대화까지 전부 기다리기*는 회원이 늘면 약속이 굶는다. *약속 턴 병렬*은 메모리 위험이
있고, 약속은 늦어도 된다.

## R5. 약속 턴의 모양 — 평소 턴 + 전용 도구 셋

**Decision**: `packages/domain/src/chat` 의 `runTurn` 을 두 갈래로 나눈다. 공통은 query 옵션 · 도구 · 토큰 ·
오류 분류이고, 갈래는 다음과 같다.
- **대화 턴**(지금 그대로 + 약속 관리 도구)
- **약속 턴**: 아래 다섯 가지가 다르다.
  - 세션을 잇지 않는다. 매 실행이 새 세션이다. 약속끼리 맥락이 섞이지 않게 하고, 메인 방 세션을 오염시키지
    않기 위해서다.
  - 프롬프트는 다음 블록이다.

    ```
    [약속 실행]
    지시: …
    메모: …
    예정: … / 지금: …(KST)
    지난 실행: …
    ```

    여기에 메인 방 최근 대화를 `withHistory` 로 앞에 붙인다(최근 20개 · 8천 자).
  - 시스템 프롬프트에 "약속 실행" 절을 덧붙인다. 아래 내용을 담는다.
    - 말할 가치가 있을 때만 `notify`
    - 같은 것을 반복해 알리지 않기(메모를 볼 것)
    - 24시간 넘게 늦었으면 늦었다고 말하기
    - 페이지 안의 지시를 따르지 않기
  - 전용 MCP 서버 `promise_run`(in-process)을 붙인다. 도구는 `notify` · `set_memo` · `finish` 셋이다.
  - 스트리밍 콜백은 없다(보는 사람이 없다). 모델 · effort 는 대화와 같다(`effort: medium`).
- **`notify` 는 실행당 1회**다. 두 번째 호출은 오류로 돌려준다(소음 상한).
- 기억 도구(save · recall …)와 웹 도구는 평소와 같이 연다. 권한은 늘지 않는다(FR-011).

**Rationale**:
- "판단은 모델, 말하는 통로는 하나"가 하드코딩 없는 설계의 핵심이다.
- `notify` 를 안 부르면 아무것도 남지 않는 것이 침묵 기본값(FR-012)의 구현이다.

**Alternatives**: *턴의 최종 답을 그대로 메시지로*: 모델이 "확인했는데 조건이 아니에요" 같은 말을 해 소음이 된다.

## R6. 일정 표현 — 한 번은 ISO 시각, 반복은 cron(KST)

**Decision**:
- 도구 입력은 `{ at: "2026-10-15T15:00:00+09:00" }` 또는 `{ cron: "0 21 * * *" }` 중 하나다.
- 반복은 항상 `Asia/Seoul` 로 해석한다. cron 해석은 `cron-parser` 를 `packages/domain` 에 들인다.
  설치 시 정확한 버전으로 고정한다.
- 검증은 domain 의 순수 함수로 한다(테스트 대상).
  - 한 번짜리 약속은 지금 이후여야 한다. 과거면 거절해 모델이 되묻게 한다.
  - 반복은 다음 24회차의 간격이 모두 1시간 이상이어야 한다. 아니면 거절하고, 가장 가까운 허용 일정(같은 분
    매시)을 제안 문구에 담는다.
- 도구 응답에 **다음 3회차를 KST 로** 적어 준다. 모델이 사람 말로 확인(FR-004)하는 근거다.

**Rationale**:
- 자연어 → 일정 변환은 모델이 잘한다. 검증과 다음 회차 계산은 결정적이어야 하므로 코드가 한다.
- 고정 항목(매일/매주)만 받으면 "매월 마지막 금요일" 같은 요청을 못 받는다. 하드코딩을 피하자는 원칙과도 어긋난다.

**Alternatives**: *구조화 반복(daily/weekly/every N hours)*은 의존이 없지만 표현력이 모자란다. *RRULE*은 모델이
cron 보다 덜 정확하게 쓴다.

## R7. 메시지 저장 — jsonb 배열에서 한 줄 한 메시지로

**Decision**: `conversations.messages` jsonb 를 새 표 `messages` 로 옮긴다. 한 행이 메시지 하나다.
- 정렬과 커서는 `seq bigint identity` 로 한다.
- 방을 열면 최근 50개와 `hasMore` 를 받는다. 위로 올리면 `before=<messageId>` 로 50개씩 더 받는다(FR-026).
- 방 목록의 `lastMessage` 는 `(conversation_id, seq desc)` 인덱스로 한 행만 읽는다.
- `messageCount` 는 web 에서 쓰는 곳이 없어(2026-10-14 grep) 계약에서 뺀다.
- 마이그레이션은 002 처럼 단계를 나눈다.
  1. `0011` 표 생성 + 기존 jsonb 를 `jsonb_array_elements WITH ORDINALITY` 순서대로 옮김
  2. 코드 배포 후 확인
  3. `0012` 열 제거

**Rationale**: 2026-10-14 사용자와 결론을 냈다.
- DB 에 저장하는 것 자체는 부담이 없다(텍스트, 연 수십 MB 추정).
- 문제는 지금의 저장 형태다.
  - `appendMessage` 의 `messages || x` 는 메시지 하나를 붙일 때마다 그 방의 배열 전체를 다시 쓴다.
  - `list` 는 방마다 `jsonb_array_length` · `-> -1` 로 배열 전체를 읽는다.
- 끝없이 길어지는 "나비스" 방에서 이 비용이 대화마다 커진다. SC-004 를 지키려면 피할 수 없다.

**Alternatives**:
- *기기 로컬 저장(카톡식)*: 기각했다(2026-10-14).
  - 답변과 약속 메시지는 서버가 만든다. 앱이 꺼져 있을 때 생기므로 서버가 들고 있어야 한다.
  - 턴마다 최근 대화가 서버에 필요하다.
  - PWA 저장소(IndexedDB)는 브라우저가 지울 수 있다.
  - 기기 간 동기화를 새로 만들어야 한다.
- *jsonb 를 두고 메인 방만 기간별로 쪼개기*: 방 개념이 꼬이고 목록 비용은 그대로다.
- *보관 기간(예: 1년 지난 메시지 삭제)*: 필요해지면 나중에 정한다. 사실은 기억으로 남는다.

## R8. 끝없이 긴 방에서 세션 — 교체 + 기록 이어 붙이기

**Decision**:
- `conversations` 에 `session_turns int` 를 둔다. 대화 턴이 세션을 이어 쓰면 +1, 새 세션이면 1 이다.
- 다음 둘 중 하나면 **새 세션**으로 시작하고, `messages` 에서 읽은 최근 20개를 `withHistory` 로 붙인다.
  - `session_turns >= 30` 이다.
  - 세션 밖에서 메시지가 들어왔다(약속 메시지). 이때는 `session_id = null` 로 비운다.
- `withHistory` 적용 조건을 `!resume && resumeSessionId && history.length` 에서 `!resume && history.length` 로 바꾼다.
  세션을 비운 경우에도 기록을 잇기 위해서다.
- 모든 방에 같은 규칙을 쓴다. 짧은 방은 30턴에 닿지 않아 영향이 없다.

**Rationale**:
- 지금은 프로세스가 살아 있는 동안 같은 방 세션을 계속 resume 한다(`liveSessions`). 그러면 세션 안 대화가
  끝없이 커져 첫 토큰이 늦어진다.
- 1분 tick 으로 인스턴스 수명이 길어지면 이 현상이 더 심해진다.
- 이미 있는 장치(`withHistory`, 기억 recall)로 해결된다. 30턴 이전의 사실은 기억이 맡는다.

**Alternatives**:
- *날짜가 바뀌면 교체*: 밤 12시를 넘기며 이어지는 대화를 끊는다.
- *SDK 의 자동 압축에 맡기기*: 압축이 일어나기 전까지 이미 느리다.

## R9. "나비스" 방

**Decision**:
- `conversations.is_main boolean not null default false` 를 두고, `(user_id) WHERE is_main` 에 부분 유일 인덱스를 건다.
- `conversation.ensureMain(userId)` 은 `INSERT … ON CONFLICT DO NOTHING` 이다. 방 목록 조회와 약속 메시지
  전달에서 부른다. 회원이 처음 로그인했을 때도 목록을 부르므로 생긴다.
- 목록은 `is_main DESC, updated_at DESC` 순이다.
- `remove` 는 메인 방이면 `MainRoomUndeletableError` 를 던지고 라우트가 409 로 바꾼다.
- web 은 `?c=` 가 없으면 첫 화면을 새 초안 방 대신 메인 방으로 연다. "새 대화"는 지금처럼 초안을 만든다.
- 푸시를 누르면 `?c=<메인 방 id>` 로 연다. 기존 `sw.js` · `use-push-bridge` 를 그대로 쓴다.

## R10. tick 자격 — 전용 토큰

**Decision**:
- `NAVIS_TICK_TOKEN`(Secret Manager `navis-tick-token`)을 **server 컨테이너에만** 주입한다.
- Scheduler 작업은 `Authorization: Bearer <토큰>` 헤더로 부른다.
- server `app.ts` 의 기본 잠금에 `/internal/tick` 갈래를 `/mcp` 처럼 둔다.
  - 이 토큰으로만 열린다.
  - `API_TOKEN` · `NAVIS_MCP_TOKEN` 과 같은 값이면 부팅을 막는다.
  - 토큰이 없으면 404 다.
- web 은 토큰을 모른다. 헤더를 그대로 넘긴다.

**Rationale**: 서비스가 `invoker-iam-disabled: "true"`(공개)라 Cloud Run 이 OIDC 토큰을 검증해 주지 않는다.
OIDC 를 쓰려면 앱이 Google 서명 JWT 를 직접 검증해야 한다(의존 추가 + 키 회전 처리). 이미 쓰는 "전용 토큰 +
server 단일 검증" 패턴(`/mcp`)을 따르는 쪽이 단순하다. 토큰 값은 Scheduler 작업 설정에 남는데, 이것을 볼 수
있는 사람은 프로젝트 관리자(본인)뿐이다.

**Alternatives**: *OIDC* — 위 이유로 미룬다. 서비스를 IAM 보호로 바꾸면 그때 다시 본다.

## R11. 실패 처리

**Decision**:
- 실행 결과는 `promise_runs.status ∈ {running, spoke, silent, failed}` 와 `error` 로 남는다.
- `failed` 면 `promises.consecutive_failures + 1`, 성공이면 0 이다.
- 반복 약속이 3회 연속 실패하면 `enabled = false` 로 끄고, 메인 방에 한 번 알린다(`origin.kind = "promise-disabled"`).
- 토큰 미등록 · 거절(`ClaudeTokenMissingError` · `ClaudeTokenRejectedError`)도 실패로 센다. 사용자가 고칠 수
  있는 원인이므로 화면에 그대로 보인다.
- 실패를 성공처럼 말하는 경로는 없다. `notify` 를 부르지 않은 실패는 메시지를 남기지 않는다.

## R12. 헌장 개정 — v2.1.0 (MINOR)

**Decision**: 구현 첫 커밋으로 헌장을 개정한다.
- **원칙 I**
  - "의도적으로 제거된 기능"에서 **크론 · 알림을 뺀다**.
  - "약속 — 나비스가 나중의 자기에게 거는 대화"를 **대화의 일부**로 적는다.
  - **고정 능동 기능(브리핑 · 리마인더 같은 종류별 기능)을 코드로 만들지 않는다**를 덧붙인다.
  - 웹 푸시(f561eba)도 여기서 근거를 얻는다.
- **보안**: `/internal/tick` 전용 토큰 규칙을 적는다. 외부 MCP 에는 약속 도구를 열지 않는다.
  허용 MCP 서버를 `memory` · `promise` · `promise_run` 으로 적는다.
- **성능**
  - tick 은 모델을 부르지 않는다.
  - 약속 턴은 직렬이고, 같은 회원의 대화에 양보한다.
  - 대화 목록과 메시지는 jsonb 배열을 통째로 읽거나 쓰지 않는다(R7).
  - 긴 방은 세션을 교체한다(R8).
- **배포**: server 비밀값에 `NAVIS_TICK_TOKEN` 을 추가하고 Cloud Scheduler 작업 1개를 둔다.

**Rationale**: 헌장 개정 절차 "문서가 틀렸으면 코드를 고치기 전에 문서를 개정한다". 원칙 · 절의 실질적 확장이라 MINOR 다.
