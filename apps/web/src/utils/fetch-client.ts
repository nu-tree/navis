// 브라우저 → BFF(/api/*) 호출 래퍼. 결과를 Result 로 돌려줘 호출부가 상태 코드별로 판단한다
// (예: 첫 메시지 전의 방은 404 가 정상이다).
//
// 브라우저는 /api/* 만 부른다 — apps/server 의 토큰은 Next 서버에만 있다.

export type FetchSuccess<T> = { ok: true; data: T; status: number };
export type FetchFailure = { ok: false; error: { message: string; status: number } };
export type FetchResult<T> = FetchSuccess<T> | FetchFailure;

type QueryValue = string | number | boolean | null | undefined;

type FetchOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  /** 쿼리스트링. undefined · null · "" 는 싣지 않는다 — "필터 없음"과 "빈 필터"를 같게 본다. */
  params?: Record<string, QueryValue>;
};

const withParams = (url: string, params?: Record<string, QueryValue>) => {
  if (!params) return url;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.append(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${url}?${qs}` : url;
};
type MethodOptions = Omit<FetchOptions, "method" | "body">;

export async function fetchClient<T>(url: string, options?: FetchOptions): Promise<FetchResult<T>> {
  const { body, headers, params, ...init } = options ?? {};
  const res = await fetch(withParams(url, params), {
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

export function fetchPatch<T>(url: string, body?: unknown, options?: MethodOptions): Promise<FetchResult<T>> {
  return fetchClient<T>(url, { ...options, method: "PATCH", body });
}

export function fetchDelete<T>(url: string, body?: unknown, options?: MethodOptions): Promise<FetchResult<T>> {
  return fetchClient<T>(url, { ...options, method: "DELETE", body });
}
