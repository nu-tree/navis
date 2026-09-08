# namory monorepo

> 김남운의 제2의 뇌 시스템.

| 패키지 | 한 줄 요약 | 자세히 |
| --- | --- | --- |
| [`apps/web`](./apps/web) | **배포 단위** — Next.js. API 라우트 + (예정) 웹 UI | — |
| [`namory`](./packages/namory) | 기억 라이브러리 — Supabase Postgres + pgvector, Voyage 임베딩, MCP 도구 레지스트리 | [README](./packages/namory/README.md) |
| [`navis`](./packages/navis) | 에이전트 — Claude Agent SDK 두뇌 + HTTP 핸들러 | [README](./packages/navis/README.md) |
| [`app`](./packages/app) | 모바일 앱 (Expo, React Native) | — |

## 역할 분담

- **namory** = 장기 기억. "멍청한" 저장·벡터검색·집계만. 서버 LLM 호출 0.
- **navis** = 두뇌(에이전트). 사용자와 대화하고 namory에 저장·조회. 자동화(크론·다이제스트)도 여기서.
- **apps/web** = 이 둘을 묶어 실제로 배포되는 단위. 라우팅과 HTTP 경계만 담당.

```
[웹 UI (예정) / Expo 앱]
        ↓ HTTPS
   [apps/web — Next.js Route Handlers]
        ↓ 함수 호출 (같은 프로세스)
   [navis 두뇌] ──── Claude Agent SDK (구독 OAuth)
        ↓ in-process MCP
   [namory] ──── Supabase Postgres + pgvector
```

namory 는 별도 서비스가 아니라 라이브러리다. 에이전트가 기억 도구를 쓸 때 HTTP 왕복이
없다 — Agent SDK 의 in-process MCP 로 직접 붙는다. 외부 MCP 클라이언트(Claude 커스텀
커넥터 등)를 위해 `/api/mcp` 는 HTTP 로 열려 있고, 도구 정의는 양쪽이
`namory` 의 `MEMORY_TOOLS` 레지스트리 하나를 공유한다.

## 개발

```bash
pnpm install
pnpm --filter web dev        # http://localhost:3000
pnpm typecheck               # 전체 타입 검사
```

환경변수는 `apps/web/.env.local` 에 둔다 (`packages/navis/.env.example` 참고).

## 스키마 변경

마이그레이션은 배포와 분리된 명시적 단계다 — 서버리스 함수가 부팅 시 자동 실행하지 않는다
(콜드스타트마다 경쟁 + 지연).

```bash
pnpm db:generate    # schema.ts 변경 → SQL 마이그레이션 생성
pnpm db:migrate     # 적용
```

## 배포

Vercel 프로젝트 1개 (`apps/web`). 자세한 절차·환경변수·스케줄러 설정은
[DEPLOY.md](./DEPLOY.md).
