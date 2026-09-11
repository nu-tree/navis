// T106 — data URL → 이미지 블록. 조용히 버리지 않는 것이 이 파일의 요점이다.
import { describe, expect, it } from "vitest";
import { MAX_IMAGES, toImageBlock, toImageBlocks } from "./images";

const png = (data = "AAAA") => `data:image/png;base64,${data}`;

describe("toImageBlock()", () => {
  it("png data URL 을 블록으로 바꾼다", () => {
    expect(toImageBlock(png("iVBOR"), 0)).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "iVBOR" },
    });
  });

  it.each(["image/jpeg", "image/png", "image/gif", "image/webp"])(
    "%s 를 받는다",
    (t) => {
      expect(toImageBlock(`data:${t};base64,AAAA`, 0).source.media_type).toBe(t);
    },
  );

  it("대문자 media type 도 소문자로 정규화한다", () => {
    expect(toImageBlock("data:IMAGE/PNG;base64,AAAA", 0).source.media_type).toBe(
      "image/png",
    );
  });

  // 버리면 사용자가 보낸 이미지가 사라진 채 답이 온다.
  it.each(["image/svg+xml", "image/bmp", "application/pdf"])(
    "지원하지 않는 %s 는 던진다 — 조용히 버리지 않는다",
    (t) => {
      expect(() => toImageBlock(`data:${t};base64,AAAA`, 0)).toThrow(/지원하지 않는/);
    },
  );

  it.each(["", "not a url", "https://example.com/a.png", "data:image/png,AAAA"])(
    "data URL 이 아니면 던진다: %s",
    (bad) => {
      expect(() => toImageBlock(bad, 0)).toThrow(/data URL/);
    },
  );

  it("데이터가 비면 던진다", () => {
    expect(() => toImageBlock("data:image/png;base64,", 0)).toThrow();
  });

  it("몇 번째 이미지인지 오류에 담는다", () => {
    expect(() => toImageBlock("bad", 2)).toThrow(/3번째/);
  });

  it("앞뒤 공백을 다듬는다", () => {
    expect(toImageBlock(`  ${png()}  `, 0).source.data).toBe("AAAA");
  });
});

describe("toImageBlocks()", () => {
  it("순서를 유지한다", () => {
    const out = toImageBlocks([png("a"), png("b"), png("c")]);
    expect(out.map((b) => b.source.data)).toEqual(["a", "b", "c"]);
  });

  it("빈 배열은 빈 배열", () => {
    expect(toImageBlocks([])).toEqual([]);
  });

  it(`${MAX_IMAGES}장까지 받는다`, () => {
    expect(toImageBlocks(Array.from({ length: MAX_IMAGES }, () => png()))).toHaveLength(
      MAX_IMAGES,
    );
  });

  // 앞의 8장만 쓰고 나머지를 버리면 사용자는 일부가 무시된 것을 모른다.
  it("상한을 넘으면 던진다 — 잘라내지 않는다", () => {
    expect(() =>
      toImageBlocks(Array.from({ length: MAX_IMAGES + 1 }, () => png())),
    ).toThrow(/8장까지/);
  });
});
