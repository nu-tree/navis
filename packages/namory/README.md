# namory — 나모리

> 개인용 제2의 뇌 — 기억 저장·벡터검색 **라이브러리** + MCP 도구 레지스트리.
> Claude(데스크톱·웹·모바일) 어디서나 커넥터로 붙여 대화 자동 저장/검색, 패턴 분석,
> 자기 이해 누적.

- 남운(Nam) + Memory · 읽기 "나모리" · 의미 "나의 기억"
- 태그라인: *"My memory, my way"*

> **이 패키지는 서버가 아니다.** 예전에는 Fastify 서버(`listen` + REST 14개 + `/mcp`)로
> 따로 떠 있었고 navis 가 HTTP 로 호출했다. 지금은 함수를 내보내는 라이브러리이고,
> HTTP 경계는 `apps/web` 이 갖는다. 이유는 루트 [README](../../README.md) 참조.

## 아키텍처

```
소비자가 둘이고, 둘 다 같은 도구 레지스트리(MEMORY_TOOLS)를 쓴다.

[navis 에이전트]                 [Claude Desktop / iOS / 외부 MCP 클라이언트]
      │ in-process MCP                        │ HTTPS (MCP Streamable HTTP)
      │ (HTTP 왕복 없음)                        ↓
      │                            [apps/web: /api/mcp 라우트]
      └────────────┬───────────────────────────┘
                   ↓
        [tools/registry.ts — MEMORY_TOOLS 단일 정의]
                   ↓  save / recall / recent / pattern / profile / todos / graphify
        [tools/*.ts — 순수 함수]
                   ↓ Drizzle ORM
        [Supabase Postgres + pgvector]
                   ↓ HTTPS
             [Voyage AI: 임베딩]
```

**설계 원칙:** 서버는 "멍청하게" — 저장·벡터검색·집계만. 패턴 해석/프로파일 작성 등 *지능*은 Claude(클라이언트)가 수행 → 서버 LLM 호출 0, 추가 비용 0.

## 핵심 도구 (MCP)

| 도구 | 용도 |
| --- | --- |
| `save` | 기억 저장 (category: decision / learning / idea / feeling / people / todo) |
| `recall` | 의미 검색 (시간 가중치 + 벡터 유사도 합성) |
| `recent` | 최근 N일 기억 |
| `pattern` | 기간·카테고리 묶음 |
| `todos` | 미완료 할 일 목록 |
| `profile_show` / `profile_update` | 자기이해 프로필 조회/갱신 |
| `update` / `delete` | 기억 수정/삭제 |

## 기술 스택

| 레이어 | 선택 | 비고 |
| --- | --- | --- |
| 언어 | TypeScript + Node.js | |
| MCP | `@modelcontextprotocol/sdk` | transport: Streamable HTTP |
| ORM | **Drizzle ORM** | Supabase 친화, pgvector `vector`/`cosineDistance` 기본 지원 |
| DB | Supabase Postgres + pgvector | 도쿄 `ap-northeast-1`, HNSW 인덱스 |
| 임베딩 | Voyage AI `voyage-3-large` | 1024차원, 한국어 학습 포함 |
| 호스팅 | Vercel (`apps/web` 경유) | 이 패키지 자체는 배포 단위가 아니다 |
| 인증 | 단일 시크릿 토큰 1개 | 단일 사용자, MCP 엔드포인트 보호용 |

## 프로젝트 구조

```
src/
├─ index.ts          # 라이브러리 배럴 (함수 export — 서버가 아니다)
├─ mcp.ts            # 레지스트리 → McpServer 어댑터 (공개 /mcp 용)
├─ tools/registry.ts # 도구 단일 정의 (이름·설명·스키마·핸들러)
├─ db/
│  ├─ schema.ts       # memories / profile + vector(1024), HNSW 인덱스
│  └─ client.ts       # postgres-js + drizzle 인스턴스
├─ embedding.ts       # Voyage 래퍼 (document/query input_type 구분)
└─ tools/             # save · recall · recent · pattern · profile
drizzle.config.ts     # drizzle-kit 마이그레이션 설정
```

## 셋업

라이브러리라 자체 실행이 없다 — 레포 루트에서 웹 앱을 띄운다.

```bash
pnpm install
# 환경변수는 apps/web/.env.local 에 둔다 (DATABASE_URL / VOYAGE_API_KEY / ...)

# Supabase에서 pgvector 확장 1회 활성화: create extension if not exists vector;
pnpm db:generate              # 스키마 → 마이그레이션 생성
pnpm db:migrate               # Supabase에 적용

pnpm --filter web dev         # 전체 API 로컬 실행
```

## 비용

| 항목 | 비용 |
| --- | --- |
| Supabase | $0 (무료 티어 500MB, pgvector 포함) |
| 호스팅 | Vercel Hobby 제약(함수 300초, 크론 하루 1회) — [DEPLOY.md](../../DEPLOY.md) |
| Voyage AI | 사실상 $0 (월 60만 토큰 ≈ $0.11) |
| **추가 비용** | **≈ $0/월** |

## 결정 기록

- **2026-05-18**: 초기 스택을 Python+Chroma+Ollama 로컬 → TypeScript+Supabase+Voyage 원격으로 전환. 사유: 멀티 디바이스 동시 사용이 핵심 요구사항.
- **2026-05-18**: 임베딩은 Voyage-3-large (재구축 비용 커서 처음부터 상위 모델).
- **2026-05-18**: 프레임워크 Express → **Fastify**, DB 접근 raw → **Drizzle ORM** 채택.
- **2026-09-08**: Fastify 서버 → **라이브러리**. navis 와 한 Vercel 배포로 합쳐 HTTP 홉 제거, 도구 정의를 `tools/registry.ts` 로 단일화.

## 참고

- [MCP 문서](https://modelcontextprotocol.io/docs) · [MCP TS SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Supabase pgvector](https://supabase.com/docs/guides/ai/vector-columns) · [Drizzle + Supabase](https://orm.drizzle.team/docs/get-started/supabase-new)
- [Voyage AI](https://docs.voyageai.com/) · [Claude Custom Connectors](https://support.claude.com/en/articles/11175166)
