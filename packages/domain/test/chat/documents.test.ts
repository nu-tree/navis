// 첨부 문서 → document 블록. 이미지처럼 조용히 버리지 않는 것, 그리고 Office 계열에서 글을 제대로
// 뽑는 것이 요점이다. 픽스처는 진짜 파일 대신 최소 zip 을 만들어 쓴다.
import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  MAX_DOCUMENTS,
  MAX_TEXT_CHARS,
  toDocumentBlock,
  toDocumentBlocks,
} from "../../src/chat/documents";

const b64 = (bytes: Uint8Array | string) =>
  Buffer.from(typeof bytes === "string" ? bytes : bytes).toString("base64");
const zip = (files: Record<string, string>) =>
  b64(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))));
const textOf = (name: string, data: string) => {
  const block = toDocumentBlock({ name, data });
  if (block.source.type !== "text") throw new Error("text 문서가 아니다");
  return block.source.data;
};

describe("PDF", () => {
  it("base64 그대로 document 블록으로 싣는다", () => {
    const data = b64("%PDF-1.7\n1 0 obj << /Type /Page >> endobj");
    expect(toDocumentBlock({ name: "보고서.pdf", data })).toEqual({
      type: "document",
      title: "보고서.pdf",
      source: { type: "base64", media_type: "application/pdf", data },
    });
  });

  it("PDF 머리말이 없으면 던진다", () => {
    expect(() => toDocumentBlock({ name: "가짜.pdf", data: b64("hello") })).toThrow(/PDF 가 아니다/);
  });

  it("셀 수 있는 페이지가 100쪽을 넘으면 던진다", () => {
    const data = b64(`%PDF-1.7\n${"<< /Type /Page >>\n".repeat(101)}<< /Type /Pages >>`);
    expect(() => toDocumentBlock({ name: "긴.pdf", data })).toThrow(/101쪽/);
  });
});

describe("평문", () => {
  it("UTF-8 글을 text 문서로 싣는다 (BOM 은 뗀다)", () => {
    expect(textOf("메모.md", b64("﻿# 제목\n본문"))).toBe("# 제목\n본문");
  });

  it("UTF-8 이 아니면 EUC-KR 로 읽는다 — 엑셀이 내보낸 한글 CSV", () => {
    // "이름,나이" 의 EUC-KR 바이트
    const euckr = Uint8Array.from([0xc0, 0xcc, 0xb8, 0xa7, 0x2c, 0xb3, 0xaa, 0xc0, 0xcc]);
    expect(textOf("명단.csv", b64(euckr))).toBe("이름,나이");
  });

  it("너무 길면 자르고 잘랐다고 적는다", () => {
    const text = textOf("큰.txt", b64("가".repeat(MAX_TEXT_CHARS + 10)));
    expect(text.startsWith("가".repeat(MAX_TEXT_CHARS))).toBe(true);
    expect(text).toMatch(/이하 10자 생략/);
  });
});

describe("Office · 한글", () => {
  it("docx — 문단을 줄로, 표의 행은 탭으로 잇는다", () => {
    const data = zip({
      "word/document.xml": `<w:document><w:body>
        <w:p><w:pPr/><w:r><w:t>첫 문단 </w:t></w:r><w:r><w:t xml:space="preserve">&amp; 이어짐</w:t></w:r></w:p>
        <w:p></w:p>
        <w:tbl><w:tr><w:tc><w:p><w:r><w:t>이름</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>나이</w:t></w:r></w:p></w:tc></w:tr>
        <w:tr><w:tc><w:p><w:r><w:t>민수</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>30</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
        <w:p><w:r><w:t>끝</w:t><w:tab/><w:t>탭 뒤</w:t></w:r></w:p>
      </w:body></w:document>`,
    });
    expect(textOf("문서.docx", data)).toBe("첫 문단 & 이어짐\n이름\t나이\n민수\t30\n끝\t탭 뒤");
  });

  it("pptx — 슬라이드를 번호 순서로(2 가 10 보다 먼저)", () => {
    const slide = (t: string) => `<p:sld><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:sld>`;
    const data = zip({
      "ppt/slides/slide10.xml": slide("열"),
      "ppt/slides/slide2.xml": slide("둘"),
      "ppt/slides/slide1.xml": slide("하나"),
    });
    expect(textOf("발표.pptx", data)).toBe(
      "## 슬라이드 1\n하나\n\n## 슬라이드 2\n둘\n\n## 슬라이드 3\n열",
    );
  });

  it("xlsx — 시트 이름 · 공유 문자열 · 빈 칸 자리를 살린다", () => {
    const data = zip({
      "xl/workbook.xml": `<workbook><sheets><sheet name="매출 &amp; 비용" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>`,
      "xl/sharedStrings.xml": `<sst><si><t>품목</t></si><si><r><t>금</t></r><r><t>액</t></r></si></sst>`,
      "xl/worksheets/sheet1.xml": `<worksheet><sheetData>
        <row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>
        <row r="2"><c r="A2" t="inlineStr"><is><t>사과</t></is></c><c r="B2" t="b"><v>1</v></c><c r="C2"><v>1200</v></c></row>
      </sheetData></worksheet>`,
    });
    expect(textOf("장부.xlsx", data)).toBe("## 시트: 매출 & 비용\n품목\t\t금액\n사과\tTRUE\t1200");
  });

  it("hwpx — 섹션의 문단을 읽는다", () => {
    const data = zip({
      "Contents/section0.xml": `<hs:sec><hp:p><hp:run><hp:t>안녕<hp:lineBreak/>하세요</hp:t></hp:run></hp:p><hp:p><hp:run><hp:t>둘째</hp:t></hp:run></hp:p></hs:sec>`,
    });
    expect(textOf("공문.hwpx", data)).toBe("안녕하세요\n둘째");
  });

  it("zip 이 아니면 손상됐다고 던진다", () => {
    expect(() => toDocumentBlock({ name: "깨진.docx", data: b64("not a zip") })).toThrow(/열지 못했다/);
  });

  it("글이 하나도 없으면 던진다", () => {
    const data = zip({ "word/document.xml": "<w:document><w:body><w:p></w:p></w:body></w:document>" });
    expect(() => toDocumentBlock({ name: "빈.docx", data })).toThrow(/읽을 글을 찾지 못했다/);
  });
});

describe("거부 — 조용히 버리지 않는다", () => {
  it.each(["옛.doc", "옛.xls", "옛.ppt", "옛.hwp"])("옛 바이너리 형식 %s 는 새 형식으로 저장하라고 던진다", (name) => {
    expect(() => toDocumentBlock({ name, data: b64("x") })).toThrow(/옛 형식/);
  });

  it.each(["앱.exe", "압축.zip", "확장자없음"])("지원하지 않는 %s 는 던진다", (name) => {
    expect(() => toDocumentBlock({ name, data: b64("x") })).toThrow(/지원하지 않는/);
  });

  it("10MB 를 넘으면 던진다", () => {
    const data = Buffer.alloc(10 * 1024 * 1024 + 1).toString("base64");
    expect(() => toDocumentBlock({ name: "큰.txt", data })).toThrow(/너무 크다/);
  });

  it(`${MAX_DOCUMENTS}개를 넘으면 앞의 것만 쓰지 않고 던진다`, () => {
    const docs = Array.from({ length: MAX_DOCUMENTS + 1 }, (_, i) => ({ name: `${i}.txt`, data: b64("a") }));
    expect(() => toDocumentBlocks(docs)).toThrow(/5개까지/);
  });
});
