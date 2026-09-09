# 골격 현황과 이관 지도

`b5f05b2` 이전의 구현(Expo 앱 · Electron 데스크톱 · 터미널 CLI · 크론 · 다이제스트 ·
구글 캘린더 · 동적 MCP 커넥터 · 자기수정 파이프라인 · iOS 사이드로드 배포)을 전부 걷어내고
모노레포 골격만 남긴 상태다. 지금 있는 것은 **동작하는 뼈대**이고, 비즈니스 로직은
아직 이관되지 않았다.

## 지금 동작하는 것

| 확인 | 방법 |
| --- | --- |
| 6개 패키지 타입 통과 | `pnpm typecheck` |
| 웹 프로덕션 빌드 | `pnpm --filter @navis/web build` |
| 서버 기동 + `/health` | `pnpm --filter @navis/server dev` → `curl localhost:4000/health` |

## 이관 지도

`packages/domain/src/*/index.ts` 각 배럴에 **무엇이 어디서 오는지, 이관하면서 무엇을 고쳐야
하는지**가 주석으로 적혀 있다. 원본은 git 이력에 있다.

```bash
# 원본 열람 (b5f05b2 = 정리 직전 커밋)
git show b5f05b2:packages/namory/src/tools/save.ts
git show b5f05b2:packages/navis/src/claude/ask/ask-claude.ts

# 통째로 꺼내 참고
git archive b5f05b2 packages/navis/src | tar -x -C /tmp/old-navis
```

이관 대상 요약:

| 새 위치 | 원본 (`b5f05b2:`) |
| --- | --- |
| `domain/memory/` | `packages/namory/src/tools/{save,recall,recent,update,remove,todos,graphify,filter,project-normalize}.ts`, `src/embedding.ts` |
| `domain/chat/` | `packages/navis/src/claude/{ask/*,allowed-tools,images,mcp,nudge,query-options,tool-status,types}.ts` |
| `domain/conversation/` | `packages/namory/src/tools/conversations.ts` |
| `domain/settings/` | `packages/navis/src/{system-prompt,settings-kv}.ts` |
| `apps/server/src/routes/` | `packages/navis/src/http/chat*.ts` (Node http → Hono 재작성) |

## 웹 UI 에 건져 쓸 자산

Expo 앱에서 뷰 계층이 아니라 그대로 옮겨지는 것들. **디자인 토큰이 가장 값지다** —
`"R G B"` 채널 + CSS 변수 기반이라 이식성이 높다. 단 새 웹은 **Tailwind v4** 라
`tailwind.config.js`(v3) 대신 CSS 의 `@theme` 로 옮겨야 한다.

```bash
git show b5f05b2:packages/app/src/lib/theme.ts        # 다크/라이트 토큰 값
git show b5f05b2:packages/app/global.css              # :root 기본값
git show b5f05b2:packages/app/src/lib/text-animator.ts # 타이핑 애니메이션
git show b5f05b2:packages/app/src/api/chat.ts         # SSE 종료 조건 3개의 근거가 주석에 있다
```

## 이관하면서 반드시 반영할 것

옛 구현에서 확인된 것들. 그대로 옮기면 같은 문제를 물려받는다.

1. **기억 MCP 는 in-process 로 붙인다.** 예전엔 HTTP MCP 라 매 턴 자기 자신에게 왕복했고,
   부수 도구까지 합쳐 MCP 서버 6개를 핸드셰이크했다. 코드 주석이 이걸 "첫 토큰 ~1.6초
   바닥(모델 무관)"의 원인으로 지목한다. 지금은 기억 하나뿐이다.
2. **파일·셸 도구 자동승인을 가져오지 않는다.** `Read/Write/Edit/Bash` 가 화이트리스트에
   있었고 `/api/chat` 은 토큰 하나로만 보호됐다 — 토큰이 새면 임의 명령 실행이 된다.
   서버에 소스 트리가 없어 얻는 것도 없다.
3. **사후 큐레이터를 가져오지 않는다.** 매 턴 뒤 Haiku 를 한 번 더 돌렸다. save 너지로 충분하다.
4. **기기 간 LWW 동기화를 가져오지 않는다.** 클라이언트가 하나면 서버가 권위다.
   시계 왜곡 방어(`Math.max(Date.now(), priorMaxMs + 1000)`)·툼스톤·스냅샷 업로드가
   전부 불필요하고, 거기 있던 버그도 함께 사라진다.
5. **메시지 id 는 `randomUUID()`.** `a${Date.now()}` 는 같은 ms 안에서 충돌한다.
6. **대화 목록은 `messages` 를 반환하지 않는다.** 옛 `listConversations` 는 `SELECT *` 로
   모든 방의 messages jsonb 를 다 실었다.
7. **없는 id 에 대한 에러는 타입 있는 에러로.** 예전엔 한국어 메시지 문자열
   (`msg.startsWith("해당 id의")`)로 HTTP status 를 결정했다 — 문구를 다듬으면 404 가 500 이 된다.
8. **`embed()` 의 `json.data[0].embedding` 은 무가드 인덱싱.** 200 + 빈 `data` 면
   TypeError 가 save/recall 밖으로 튄다.
