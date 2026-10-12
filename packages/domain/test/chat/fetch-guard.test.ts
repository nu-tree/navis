import { describe, expect, it } from "vitest";
import { canUseTool, normalizeUrl } from "../../src/chat/fetch-guard";

const opts = { signal: new AbortController().signal } as Parameters<typeof canUseTool>[2];

describe("normalizeUrl", () => {
  it("http 와 https, 끝 슬래시, 해시를 같게 본다", () => {
    expect(normalizeUrl("http://example.com/a/#top")).toBe("https://example.com/a");
    expect(normalizeUrl("https://example.com/a")).toBe("https://example.com/a");
  });

  it("쿼리는 그대로 둔다 — 유출 통로라서 달라지면 다른 URL 이다", () => {
    expect(normalizeUrl("https://example.com/?q=1")).not.toBe(normalizeUrl("https://example.com/?q=2"));
  });

  it("내부 주소와 http(s) 가 아닌 것은 null", () => {
    expect(normalizeUrl("http://localhost:4000/chat")).toBeNull();
    expect(normalizeUrl("http://metadata.google.internal/computeMetadata/v1/")).toBeNull();
    expect(normalizeUrl("http://169.254.169.254/")).toBeNull();
    expect(normalizeUrl("http://[::1]/")).toBeNull();
    expect(normalizeUrl("file:///etc/passwd")).toBeNull();
  });
});

describe("canUseTool", () => {
  it("외부 주소는 사용자가 준 링크가 아니어도 연다", async () => {
    const res = await canUseTool("WebFetch", { url: "https://news.example.com/article?id=3", prompt: "요약" }, opts);
    expect(res?.behavior).toBe("allow");
  });

  it("내부 주소는 열지 않는다", async () => {
    const res = await canUseTool("WebFetch", { url: "http://metadata.google.internal/computeMetadata/v1/", prompt: "x" }, opts);
    expect(res?.behavior).toBe("deny");
  });

  it("WebFetch 가 아닌 도구는 거절한다", async () => {
    const res = await canUseTool("Bash", { command: "ls" }, opts);
    expect(res?.behavior).toBe("deny");
  });
});
