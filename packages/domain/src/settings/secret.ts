// 설정 값 암호화 — AES-256-GCM(FR-055, data-model.md 설정 절).
//
// 형식: `v1.<iv>.<tag>.<ciphertext>` (각 base64url). IV 는 암호화할 때마다 새로 뽑는다 — 같은
// 토큰을 두 번 저장해도 암호문이 다르다. 태그 검증이 실패하면(변조 · 다른 키) **던진다** —
// 조용히 "없음"으로 보이면 원인을 못 찾는다.
//
// 키는 인자로 받는다. 전역 env 를 여기서 읽지 않는다 — 테스트가 키를 주입한다.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // GCM 권장 길이
const KEY_BYTES = 32;

/** 키가 올바르지 않거나 암호문이 깨졌다. 메시지에 평문 · 키를 싣지 않는다. */
export class SecretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretError";
  }
}

/** base64 로 받은 키 → 32바이트. 길이가 틀리면 부팅 때 알게 던진다. */
export const parseKey = (base64: string): Buffer => {
  const key = Buffer.from(base64, "base64");
  if (key.length !== KEY_BYTES) {
    throw new SecretError(`설정 암호화 키는 ${KEY_BYTES}바이트(base64)여야 한다. 받은 길이: ${key.length}`);
  }
  return key;
};

export const encrypt = (plaintext: string, key: Buffer): string => {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ciphertext].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
};

export const decrypt = (value: string, key: Buffer): string => {
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new SecretError("암호문 형식이 아니다.");
  }
  const [, iv, tag, ciphertext] = parts.map((p) => Buffer.from(p, "base64url")) as [Buffer, Buffer, Buffer, Buffer];
  if (iv.length !== IV_BYTES) throw new SecretError("암호문 형식이 아니다.");
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // 태그 불일치 = 변조됐거나 다른 키다.
    throw new SecretError("암호문을 풀 수 없다 — 변조됐거나 키가 다르다.");
  }
};
