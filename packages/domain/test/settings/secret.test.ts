// T091 — 설정 값 암호화의 계약.
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt, parseKey, SecretError } from "../../src/settings/secret";

const key = randomBytes(32);
const TOKEN = "sk-ant-oat01-example-token-value";

describe("secret", () => {
  it("왕복하면 같은 값이 나온다", () => {
    expect(decrypt(encrypt(TOKEN, key), key)).toBe(TOKEN);
  });

  it("v1.<iv>.<tag>.<ciphertext> 형식이고 평문이 보이지 않는다", () => {
    const v = encrypt(TOKEN, key);
    expect(v.split(".")).toHaveLength(4);
    expect(v.startsWith("v1.")).toBe(true);
    expect(v).not.toContain(TOKEN);
  });

  // IV 를 재사용하면 같은 평문이 같은 암호문이 되어 정보가 샌다.
  it("같은 평문도 암호화할 때마다 다르다", () => {
    expect(encrypt(TOKEN, key)).not.toBe(encrypt(TOKEN, key));
  });

  it("한 글자만 바꿔도 복호화에 실패한다", () => {
    const v = encrypt(TOKEN, key);
    const parts = v.split(".");
    const ct = parts[3]!;
    parts[3] = (ct[0] === "A" ? "B" : "A") + ct.slice(1);
    expect(() => decrypt(parts.join("."), key)).toThrow(SecretError);
  });

  it("다른 키로는 풀리지 않는다", () => {
    expect(() => decrypt(encrypt(TOKEN, key), randomBytes(32))).toThrow(SecretError);
  });

  it("형식이 아닌 값은 거부한다", () => {
    expect(() => decrypt(TOKEN, key)).toThrow(SecretError);
    expect(() => decrypt("v2.a.b.c", key)).toThrow(SecretError);
  });

  it("32바이트가 아닌 키는 거부한다", () => {
    expect(() => parseKey(randomBytes(16).toString("base64"))).toThrow(SecretError);
    expect(parseKey(key.toString("base64"))).toHaveLength(32);
  });

  // 오류 메시지가 로그로 나간다 — 평문이 실리면 안 된다(FR-037).
  it("오류 메시지에 평문이 없다", () => {
    try {
      decrypt(encrypt(TOKEN, key), randomBytes(32));
    } catch (e) {
      expect(String((e as Error).message)).not.toContain(TOKEN);
    }
  });
});
