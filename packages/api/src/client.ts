import type { ChatEvent } from "@navis/validation";
import { parseChatEvents } from "./sse";

// ── apps/server 를 부르는 타입 있는 클라이언트 ───────────────────────────────
// 소비자 둘: apps/web 의 **서버 사이드**(BFF), 그리고 나중의 apps/mobile.
//
// ★ 브라우저에서 직접 쓰지 않는다. 웹은 브라우저 → (세션 쿠키) → Next 서버 →
//   (서버가 쥔 토큰) → apps/server 로 흐른다. 토큰을 브라우저 번들에 넣으면
//   그건 공개된 비밀이다 — 예전 Expo 앱이 EXPO_PUBLIC_* 로 그렇게 하고 있었다.
//
// validation 외에 아무것도 의존하지 않는다(fetch 는 web·RN 양쪽에 다 있다).

export type ClientOptions = {
  baseUrl: string;
  token: string;
  /** 기본 타임아웃(ms). 채팅 스트림에는 적용하지 않는다 — 분 단위로 갈 수 있다. */
  timeoutMs?: number;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function createClient(opts: ClientOptions) {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const timeoutMs = opts.timeoutMs ?? 15_000;

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${opts.token}`,
        ...init?.headers,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      throw new ApiError(res.status, await res.text().catch(() => res.statusText));
    }
    return (await res.json()) as T;
  }

  return {
    request,

    /**
     * 채팅 스트림. SSE 프레임을 파싱해 타입 있는 이벤트로 흘려보낸다.
     *
     * 중지는 이 제너레이터를 버리는 것만으로는 안 된다 — 서버는 연결이 끊겨도
     * 생성을 계속한다(백그라운드 완주). `POST /chat/cancel` 을 함께 불러야 한다.
     */
    async *chatStream(
      body: unknown,
      signal?: AbortSignal,
    ): AsyncGenerator<ChatEvent> {
      const res = await fetch(`${base}/chat`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${opts.token}`,
          accept: "text/event-stream",
        },
        body: JSON.stringify(body),
        signal,
      });
      if (!res.ok || !res.body) {
        throw new ApiError(res.status, await res.text().catch(() => res.statusText));
      }

      yield* parseChatEvents(res.body);
    },
  };
}

export type ApiClient = ReturnType<typeof createClient>;
