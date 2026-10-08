// 브라우저 → BFF(/api/*) 호출 래퍼. 결과를 Result 로 돌려줘 호출부가 상태 코드별로 판단한다
// (예: 첫 메시지 전의 방은 404 가 정상이다).
//
// 브라우저는 /api/* 만 부른다 — apps/server 의 토큰은 Next 서버에만 있다.

export type FetchSuccess<T> = { ok: true; data: T; status: number };
export type FetchFailure = { ok: false; error: { message: string; status: number } };
export type FetchResult<T> = FetchSuccess<T> | FetchFailure;

type FetchOptions = Omit<RequestInit, "body"> & { body?: unknown };
type MethodOptions = Omit<FetchOptions, "method" | "body">;

export async function fetchClient<T>(url: string, options?: FetchOptions): Promise<FetchResult<T>> {
  const { body, headers, ...init } = options ?? {};
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const message = await res.text().catch(() => "");
    return { ok: false, error: { message: message || res.statusText, status: res.status } };
  }

  // 본문이 없는 응답(204 · 빈 200)도 성공이다.
  const text = await res.text();
  return { ok: true, data: (text ? JSON.parse(text) : undefined) as T, status: res.status };
}

export function fetchGet<T>(url: string, options?: MethodOptions): Promise<FetchResult<T>> {
  return fetchClient<T>(url, { ...options, method: "GET" });
}

export function fetchPost<T>(url: string, body?: unknown, options?: MethodOptions): Promise<FetchResult<T>> {
  return fetchClient<T>(url, { ...options, method: "POST", body });
}

export function fetchDelete<T>(url: string, body?: unknown, options?: MethodOptions): Promise<FetchResult<T>> {
  return fetchClient<T>(url, { ...options, method: "DELETE", body });
}
