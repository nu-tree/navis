import { namoryFetch } from "../namory-client.js";
import type { Connector } from "./types.js";

// 커넥터 목록을 namory(DB)의 settings KV 한 칸(key="connectors")에 JSON 배열로 보관한다.
// namory 스키마를 건드리지 않고(전용 테이블/엔드포인트 불필요) "DB 등록만으로 붙였다 빼기"
// 를 만족시키는 가장 단순한 경로. system-prompt.ts 와 동일한 settings 패턴 + 짧은 캐시.

const KEY = "connectors";
const TTL_MS = 30_000;

let cache: { at: number; value: Connector[] } | undefined;

// 슬러그 검증 — MCP 서버 이름으로 안전한 문자만(도구 네임스페이스 mcp__<id>__* 가 됨).
const ID_RE = /^[a-z0-9_]{1,40}$/;

// ask.ts 가 쓰는 내장 MCP 서버 키. 커넥터가 같은 id 로 이들을 덮어쓰지 못하게 예약.
const RESERVED_IDS = new Set([
  "namory",
  "cron",
  "repo",
  "self_modify",
  "settings",
  "google",
]);

export function isValidConnectorId(id: string): boolean {
  return ID_RE.test(id) && !RESERVED_IDS.has(id);
}

// 저장된 raw JSON 을 Connector[] 로 안전 파싱. 깨진 항목은 조용히 버린다(반쪽 설정으로
// 전체가 죽지 않게). 알 수 없는 필드는 무시.
function parseConnectors(raw: string): Connector[] {
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out: Connector[] = [];
  for (const item of arr) {
    const c = normalize(item);
    if (c) out.push(c);
  }
  return out;
}

// 임의 객체 → Connector(유효하면). 필수 필드 누락·형식 오류면 undefined.
export function normalize(item: unknown): Connector | undefined {
  if (!item || typeof item !== "object") return undefined;
  const o = item as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const url = typeof o.url === "string" ? o.url.trim() : "";
  if (!isValidConnectorId(id)) return undefined;
  if (!/^https?:\/\//.test(url)) return undefined;
  const auth = normalizeAuth(o.auth);
  if (!auth) return undefined;
  return {
    id,
    label: typeof o.label === "string" && o.label.trim() ? o.label.trim() : id,
    url,
    auth,
    enabled: o.enabled !== false, // 기본 활성
    alwaysLoad: o.alwaysLoad !== false, // 기본 항상 로드
  };
}

// apikey 인증의 헤더/값 규칙을 한 곳에서 정한다 — store(저장 정규화)와 mcp(요청 헤더 생성)
// 양쪽이 이 함수만 호출하게 해서 두 경로의 기본값/포맷이 절대 갈라지지 않게 한다.
//   - 기본 헤더: Authorization (입력에서 비었거나 공백이면 채워 넣는다)
//   - 값에 스킴(Bearer/Basic/...)이 이미 있으면 원문 보존(예: "Bearer xxx" 그대로)
//   - Authorization 헤더에 스킴 없는 원문 키만 들어오면 "Bearer " 프리픽스를 자동 보정해
//     사용자가 raw 키만 넣어도 401 로 조용히 실패하지 않게 한다. 커스텀 헤더(예: X-API-Key)
//     에는 손대지 않는다 — 그쪽은 값 형식이 제공자마다 달라 일률적 보정이 위험.
export function resolveApikeyAuth(auth: { header?: string; value: string }): {
  header: string;
  value: string;
} {
  const header = auth.header?.trim() || "Authorization";
  let value = auth.value;
  if (header.toLowerCase() === "authorization" && !/^[A-Za-z][A-Za-z0-9-]*\s+\S/.test(value)) {
    value = `Bearer ${value}`;
  }
  return { header, value };
}

function normalizeAuth(raw: unknown): Connector["auth"] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const a = raw as Record<string, unknown>;
  if (a.type === "none") return { type: "none" };
  if (a.type === "apikey") {
    const value = typeof a.value === "string" ? a.value : "";
    if (!value) return undefined;
    const header = typeof a.header === "string" && a.header.trim() ? a.header.trim() : undefined;
    return header ? { type: "apikey", header, value } : { type: "apikey", value };
  }
  if (a.type === "oauth") {
    const token = typeof a.token === "string" ? a.token : "";
    if (!token) return undefined;
    const clientAuth =
      a.clientAuth === "basic" || a.clientAuth === "body" || a.clientAuth === "none"
        ? a.clientAuth
        : undefined;
    // 공개 클라이언트(clientAuth === "none") 는 정의상 clientSecret 이 없어야 한다.
    // 잘못 저장됐거나 토큰 응답에 우연히 섞여 들어온 비밀값은 여기서 일관되게 떨어뜨려
    // refresh 요청 본문에도 절대 실리지 않게 한다(DCR 공개 클라이언트 secret 영속 차단).
    const acceptSecret = clientAuth !== "none";
    return {
      type: "oauth",
      token,
      ...(typeof a.refreshToken === "string" ? { refreshToken: a.refreshToken } : {}),
      ...(typeof a.tokenUrl === "string" ? { tokenUrl: a.tokenUrl } : {}),
      ...(typeof a.clientId === "string" ? { clientId: a.clientId } : {}),
      ...(acceptSecret && typeof a.clientSecret === "string"
        ? { clientSecret: a.clientSecret }
        : {}),
      ...(typeof a.resource === "string" ? { resource: a.resource } : {}),
      ...(clientAuth ? { clientAuth } : {}),
      ...(a.bodyFormat === "form" || a.bodyFormat === "json" ? { bodyFormat: a.bodyFormat } : {}),
      ...(typeof a.expiresAt === "number" ? { expiresAt: a.expiresAt } : {}),
      ...(a.needsReauth === true ? { needsReauth: true } : {}),
    };
  }
  return undefined;
}

// 전체 커넥터 목록(캐시). 조회 실패·미설정 시 빈 배열(연동 없음으로 안전 동작).
export async function listConnectors(): Promise<Connector[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  let value: Connector[] = [];
  try {
    const res = await namoryFetch(`/settings/${KEY}`);
    if (res.ok) {
      const data = (await res.json()) as { value?: string | null };
      if (data.value) value = parseConnectors(data.value);
    }
  } catch (err) {
    console.error("[connectors] 목록 조회 실패(빈 목록으로 진행):", err);
  }
  cache = { at: Date.now(), value };
  return value;
}

// 단건 조회(id 기준). 없으면 undefined.
export async function getConnector(id: string): Promise<Connector | undefined> {
  return (await listConnectors()).find((c) => c.id === id);
}

// 전체 목록을 통째로 저장(KV 한 칸이라 read-modify-write). 즉시 캐시 갱신.
async function saveAll(list: Connector[]): Promise<void> {
  const res = await namoryFetch(`/settings/${KEY}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: JSON.stringify(list) }),
  });
  if (!res.ok) throw new Error(`커넥터 저장 실패: ${res.status}`);
  cache = { at: Date.now(), value: list };
}

// 커넥터 1개 추가/수정(id 기준 upsert). 정규화 실패 시 throw.
export async function upsertConnector(input: unknown): Promise<Connector> {
  const c = normalize(input);
  if (!c) throw new Error("커넥터 형식 오류: id(슬러그)/url/auth 를 확인하세요.");
  const list = await listConnectors();
  const next = list.filter((x) => x.id !== c.id);
  next.push(c);
  await saveAll(next);
  return c;
}

// 커넥터 삭제. 존재하지 않으면 false.
export async function removeConnector(id: string): Promise<boolean> {
  const list = await listConnectors();
  const next = list.filter((x) => x.id !== id);
  if (next.length === list.length) return false;
  await saveAll(next);
  return true;
}
