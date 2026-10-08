// 환경변수는 부팅 때 한 번 확인한다 — 첫 요청에서 500 으로 알게 되면 늦다.

import { randomBytes } from "node:crypto";
import { parseKey } from "@navis/domain/settings";

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
  /**
   * 외부 MCP(`/mcp`, Claude Code)의 Bearer 토큰. API_TOKEN 과 다른 값이어야 한다.
   * 없으면 `/mcp` 는 닫힌다(404) — MCP 를 쓰지 않는 환경을 막지 않는다.
   */
  mcpToken: process.env.NAVIS_MCP_TOKEN || null,
  /**
   * 설정(Claude 토큰) 암호화 키 — 32바이트 base64(FR-055). DB 가 새도 토큰이 새지 않게 키는
   * 이 컨테이너 환경에만 있다. 없으면 토큰을 저장도 사용도 못 하므로 부팅을 막는다.
   */
  settingsKey: required("NAVIS_SETTINGS_KEY"),
  /**
   * 관리자(Owner) 회원 uuid — Supabase 대시보드 → Users 의 UID(specs/002 research R2).
   * 외부 MCP(`/mcp`)로 들어오는 기억과 다중 사용자 전환 전의 기존 데이터가 이 회원의 것이다.
   * 모르면 MCP 기억을 아무 계정에나 넣게 되므로 부팅을 막는다.
   */
  ownerId: required("NAVIS_OWNER_ID"),
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!UUID.test(env.ownerId)) {
  throw new Error("NAVIS_OWNER_ID 는 회원 uuid 여야 한다(Supabase 대시보드 → Users 의 UID).");
}

// 길이가 틀린 키는 첫 턴이 아니라 지금 알아야 한다.
try {
  parseKey(env.settingsKey);
} catch {
  throw new Error(
    `NAVIS_SETTINGS_KEY 는 32바이트 base64 여야 한다. 예: ${randomBytes(32).toString("base64")} ` +
      "(openssl rand -base64 32)",
  );
}

if (env.mcpToken && env.mcpToken === env.apiToken) {
  // 같은 값이면 분리한 의미가 없다 — Claude Code 쪽 자격이 새면 대화 API 까지 열린다.
  throw new Error("NAVIS_MCP_TOKEN 은 API_TOKEN 과 달라야 한다.");
}

// Claude 토큰은 환경변수가 아니라 설정 화면에서 등록한다(US5) — 여기서 확인하지 않는다.
