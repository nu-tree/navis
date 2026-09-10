// T024 — 기본 잠금 계약. app.ts 가 index.ts 와 분리된 목적이 이것이다(주석 참조).
//
// 이 파일이 지키는 것: `/health` 만 공개이고 **그 밖의 모든 경로**는 토큰 없이 401 이다.
// 보호할 경로를 나열하는 방식으로 바뀌면 라우트를 추가하다 하나 빠뜨리는 순간 공개되는데,
// 그걸 여기서 잡는다(헌장 보안 절).

import { beforeAll, describe, expect, it, vi } from "vitest";

const TOKEN = "test-token-do-not-use-in-prod";

// env.ts 는 부팅 때 환경변수를 확인한다 — 모듈을 import 하기 전에 채워야 한다.
vi.stubEnv("API_TOKEN", TOKEN);
vi.stubEnv("VOYAGE_API_KEY", "test-voyage-key");

let app: { fetch: (req: Request) => Response | Promise<Response> };

beforeAll(async () => {
  ({ app } = await import("./app"));
});

const get = (path: string, token?: string) =>
  app.fetch(
    new Request(`http://localhost${path}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
  );

describe("기본 잠금", () => {
  it("/health 는 토큰 없이 200", async () => {
    const res = await get("/health");
    expect(res.status).toBe(200);
  });

  // 아직 없는 경로까지 포함한다. 라우트가 붙는 순간 자동으로 보호되어야 한다.
  it.each([
    "/chat",
    "/chat/cancel",
    "/memories",
    "/memories/search",
    "/memories/export",
    "/conversations",
    "/settings/persona",
    "/does-not-exist-yet",
  ])("%s 는 토큰 없이 401", async (path) => {
    const res = await get(path);
    expect(res.status).toBe(401);
  });

  it("잘못된 토큰도 401", async () => {
    const res = await get("/memories", "wrong-token");
    expect(res.status).toBe(401);
  });

  it("올바른 토큰이면 401 이 아니다 (404 여도 통과 — 인증은 지났다)", async () => {
    const res = await get("/memories", TOKEN);
    expect(res.status).not.toBe(401);
  });

  it("/health 앞에 다른 경로를 붙여도 공개되지 않는다", async () => {
    // `/health` 정확 일치만 열려야 한다. startsWith 로 판정하면 여기서 새어나간다.
    const res = await get("/health/../memories");
    expect(res.status).not.toBe(200);
  });
});
