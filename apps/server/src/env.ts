// 환경변수는 부팅 때 한 번 확인한다 — 첫 요청에서 500 으로 알게 되면 늦다.

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `환경변수 ${name} 가 없다. apps/server/.env 를 만들고 채울 것 (.env.example 참고).`,
    );
  }
  return v;
}

export const env = {
  /** 이 서버를 부를 클라이언트(web BFF, mobile)의 Bearer 토큰. */
  apiToken: required("API_TOKEN"),
  /**
   * 기억 임베딩(Voyage AI). 기억 저장·검색 양쪽에 필요하다.
   *
   * DATABASE_URL 은 여기서 검증하지 않는다 — @navis/db 가 첫 질의에서 지연 연결하고
   * 그 시점에 자기 오류를 던진다(packages/db/src/client.ts).
   */
  voyageApiKey: required("VOYAGE_API_KEY"),
};

// Agent SDK 는 process.env 에서 직접 집어가므로 여기서 값을 쓰진 않는다.
// 다만 없으면 첫 채팅에서야 실패하므로 부팅 때 미리 경고한다.
if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) {
  console.warn(
    "[server] CLAUDE_CODE_OAUTH_TOKEN 이 없다 — 채팅이 실패한다. `claude setup-token` 으로 발급할 것.",
  );
}
