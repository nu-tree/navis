# namory monorepo

> 김남운의 제2의 뇌 시스템.

| 패키지 | 한 줄 요약 | 자세히 |
| --- | --- | --- |
| [`namory`](./packages/namory) | 기억 저장소 — Fastify + MCP 서버. Supabase Postgres + pgvector, Voyage 임베딩 | [README](./packages/namory/README.md) |
| [`navis`](./packages/navis) | 에이전트 — 앱 백엔드(HTTP 서버) + 터미널 CLI. Claude Agent SDK + namory MCP | [README](./packages/navis/README.md) |
| [`app`](./packages/app) | 모바일/웹 앱 (Expo, React Native). navis 와 대화하는 UI | — |
| [`desktop`](./packages/desktop) | 데스크톱 앱 (Electron). app 의 웹 빌드를 셸로 감쌈 | — |

## 역할 분담

- **namory** = 장기 기억 백엔드. "멍청한" 저장·벡터검색·집계만. 서버 LLM 호출 0.
- **navis** = 두뇌(에이전트). 사용자와 대화하고 namory에 저장·조회. 자동화(크론·다이제스트)도 여기서.

```
[앱(navis-app) / 터미널 CLI]
        ↓
     [navis] ─── Claude Agent SDK (OAuth)
        ↓ MCP
     [namory] ─── Supabase pgvector + Voyage
```

namory는 클라이언트가 navis 하나로 한정되지 않는다 — Claude Desktop/Web/Mobile에서도 같은 MCP 엔드포인트로 붙는다. 데스크톱 Claude는 직접, 앱/CLI에서는 navis를 거쳐 접근.

## 모노레포

- 패키지 매니저: `pnpm@11` (workspace)
- Node: `>=22` (process.loadEnvFile 사용)
- 빌드: `pnpm -r build` (전체) / 패키지별 `pnpm namory build` · `pnpm navis build`

## 빠른 시작

```bash
pnpm install

# namory(기억 서버) 로컬 띄우기
pnpm namory dev

# navis(앱 백엔드 HTTP 서버) 띄우기 — 새 터미널
pnpm navis dev

# 또는 CLI만 띄우기
pnpm navis cli
```

자세한 셋업은 각 패키지 README 참조.


<!-- Security scan triggered at 2026-08-31 17:16:56 -->