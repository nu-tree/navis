# navis

> 제2의 뇌 — 기억하고 대화한다.

핵심 기능은 둘이다: **기억 저장 / 기억 불러오기**, 그리고 그걸 쓰는 **대화**.
그 외의 것은 의도적으로 없다.

## 구조

```
apps/
├── web/            Next.js — UI + BFF(브라우저에 토큰을 노출하지 않는 중계)
├── server/         Hono — 유일하게 DB·Agent SDK 를 아는 배포 단위
└── mobile/         (미래) React Native
packages/
├── validation/     zod 스키마 + 타입. zod 외에 아무것도 의존하지 않는다
├── db/             drizzle 스키마 + 지연 연결 클라이언트
├── domain/         비즈니스 로직 (기억·대화·설정·에이전트 턴)
├── api/            server 를 부르는 타입 있는 클라이언트
└── config/         공용 tsconfig 베이스
```

의존 방향 — 위에서 아래로만 흐른다.

```
                    validation          ← zod 하나만. 최하단
                   ↗     ↑     ↖
                 db   domain   api
                        ↑        ↑
                     server   web · mobile
```

**규칙 하나**: `validation` 에 zod 외의 의존을 추가하지 않는다. drizzle·Agent SDK·React 가
들어가는 순간 React Native 번들에서 못 쓰게 되고, 이 패키지가 분리된 이유가 사라진다.

### 왜 server 를 web 과 분리했나

- **mobile 이 HTTP 를 필요로 한다** — Server Action 을 못 쓴다.
- **에이전트 턴이 분 단위로 갈 수 있다.** Agent SDK 가 서브프로세스를 띄우고, 도구 루프가
  길어지면 한 턴이 수 분이다. 서버리스 함수 실행시간 상한(Vercel Hobby 300초)과 싸운다.
  상주 프로세스가 이걸 자연스럽게 받고, 진행 중인 턴의 AbortController 도 들고 있을 수 있다.

브라우저에 API 토큰을 노출하지 않는다: 브라우저 → (세션 쿠키) → web 서버 → (서버가 쥔 토큰)
→ server. `@navis/api` 는 web 의 **서버 사이드**에서만 쓴다.

## 개발

```bash
pnpm install
pnpm typecheck            # 전체
pnpm dev                  # web + server 동시 (turbo)

pnpm --filter @navis/web dev      # 웹만  → localhost:3000
pnpm --filter @navis/server dev   # 서버만 → localhost:4000
```

환경변수는 `apps/server/.env` (예시는 `.env.example`).

## 스키마 변경

```bash
pnpm db:generate    # schema.ts 변경 → SQL 마이그레이션 생성
pnpm db:migrate     # 적용
```

부팅 시 자동 마이그레이션은 하지 않는다 — 배포와 분리된 명시적 단계다.

## 규약

- 파일·폴더명은 **kebab-case** (`use-send-message.ts`)
- relative import 는 **확장자 없이** (`./schema`, not `./schema.js`)
  → NodeNext 규약을 쓰면 번들러가 그 매핑을 몰라 Next 쪽에 우회를 박아야 한다


<!-- Security scan triggered at 2026-09-10 04:08:31 -->

<!-- Security scan triggered at 2026-09-11 07:26:05 -->