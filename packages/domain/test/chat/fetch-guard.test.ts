import { describe, expect, it } from "vitest";
import { createFetchGuard, extractUrls, normalizeUrl } from "../../src/chat/fetch-guard";

const opts = { signal: new AbortController().signal } as Parameters<
  ReturnType<typeof createFetchGuard>["canUseTool"]
>[2];

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

describe("extractUrls", () => {
  it("문장 속 URL 을 뽑고 끝 구두점을 뗀다", () => {
    expect(extractUrls("이거 읽어줘 https://example.com/post. 그리고 (https://b.com/x)")).toEqual([
      "https://example.com/post",
      "https://b.com/x",
    ]);
  });
});

describe("createFetchGuard", () => {
  it("허용 목록에 있는 URL 만 연다", async () => {
    const guard = createFetchGuard();
    guard.allow("https://news.example.com/article?id=3 요약해줘");

    const ok = await guard.canUseTool("WebFetch", { url: "http://news.example.com/article?id=3", prompt: "요약" }, opts);
    expect(ok?.behavior).toBe("allow");

    const leak = await guard.canUseTool(
      "WebFetch",
      { url: "https://news.example.com/article?id=3&d=사용자기억", prompt: "x" },
      opts,
    );
    expect(leak?.behavior).toBe("deny");
  });

  it("WebFetch 가 아닌 도구는 거절한다", async () => {
    const res = await createFetchGuard().canUseTool("Bash", { command: "ls" }, opts);
    expect(res?.behavior).toBe("deny");
  });
});
