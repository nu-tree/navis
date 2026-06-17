import { config } from "./config.js";
import { namoryFetch } from "./namory-client.js";

// 봇 성격(시스템 프롬프트)을 namory(DB)에서 읽고 쓴다. 우선순위: DB → env(SYSTEM_PROMPT) →
// 내장 기본값. 앱 설정에서 편집하거나, 대화 중 navis 가 update_system_prompt 도구로 바꾼다.
// 매 턴 호출되므로 짧게 캐시(쓰기 시 즉시 갱신).

const KEY = "system_prompt";
const TTL_MS = 60_000;
const DEFAULT_PROMPT =
  "너는 사용자의 개인 비서 '나비스(navis)'다. 사용자의 제2의 뇌(namory)를 활용해 맥락을 기억하고, 한국어로 간결하고 정확하게 돕는다.";

let cache: { at: number; value: string } | undefined;

export async function getSystemPrompt(): Promise<string> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  let value = "";
  try {
    const res = await namoryFetch(`/settings/${KEY}`);
    if (res.ok) {
      const data = (await res.json()) as { value?: string | null };
      value = (data.value ?? "").trim();
    }
  } catch (err) {
    console.error("[system-prompt] 조회 실패(무시):", err);
  }
  // DB 비어있으면 env, 그것도 없으면 내장 기본값.
  if (!value) value = (config.systemPrompt ?? "").trim() || DEFAULT_PROMPT;
  cache = { at: Date.now(), value };
  return value;
}

export async function setSystemPrompt(value: string): Promise<void> {
  const res = await namoryFetch(`/settings/${KEY}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) throw new Error(`시스템 프롬프트 저장 실패: ${res.status}`);
  cache = { at: Date.now(), value }; // 즉시 반영(다음 턴부터 새 프롬프트)
}
