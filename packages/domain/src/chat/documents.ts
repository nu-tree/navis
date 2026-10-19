// 첨부 문서 — 파일을 SDK 가 받는 document 블록으로 바꾼다.
//
// 두 갈래다.
//  - PDF 는 base64 그대로 보낸다. 모델이 각 페이지를 글 + 이미지로 함께 봐서 표 · 도형도 읽는다.
//  - 그 밖(텍스트 · Word · Excel · PowerPoint · 한글 hwpx)은 **여기서 글을 뽑아** text 문서로 보낸다.
//    API 는 PDF 와 평문만 문서로 받는다. Office 계열은 zip 안의 XML 이라 fflate 하나로 푼다 —
//    파싱 라이브러리(pdfjs · tesseract 를 끌고 오는)를 들이지 않는다.
//
// ★ 이미지와 마찬가지로 검증은 runTurn 의 제너레이터 **밖에서** 한다(index.ts 주석).
// ★ 지원하지 않는 파일은 조용히 버리지 않고 던진다 — 버리면 답이 그 파일을 못 본 채 온다.
//   옛 .doc · .xls · .ppt · .hwp 는 바이너리(OLE)라 읽지 못한다. 새 형식으로 저장해 달라고 알린다.

import { unzipSync, strFromU8 } from "fflate";

/** 와이어 계약(chatRequestSchema.documents)의 상한과 일치해야 한다. */
export const MAX_DOCUMENTS = 5;
/** 파일 하나의 원본 크기 상한. 요청 본문이 base64 로 4/3 배가 되므로 여유를 둔다(API 한도 32MB). */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
/** API 의 PDF 페이지 한도. */
export const MAX_PDF_PAGES = 100;
/** 뽑은 글의 상한(글자). 넘으면 자르고 잘랐다고 적는다 — 큰 엑셀 하나가 맥락을 다 먹지 않게. */
export const MAX_TEXT_CHARS = 200_000;

export type DocumentBlock = {
  type: "document";
  title: string;
  source:
    | { type: "base64"; media_type: "application/pdf"; data: string }
    | { type: "text"; media_type: "text/plain"; data: string };
};

export type DocumentInput = { name: string; data: string };

/** 평문으로 읽는 확장자. 코드 · 설정 파일도 글이다. */
const TEXT_EXTS = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "xml", "yaml", "yml", "log", "html", "htm",
  "ts", "tsx", "js", "jsx", "py", "java", "kt", "go", "rs", "rb", "php", "c", "h", "cpp", "cs",
  "swift", "sql", "sh", "css", "toml", "ini", "env",
]);
const LEGACY = new Set(["doc", "xls", "ppt", "hwp"]);

/** 화면의 file input accept 와 같은 목록. 와이어로 함께 쓰지 않으니 웹이 따로 들고 있다. */
export const DOCUMENT_EXTS = ["pdf", "docx", "xlsx", "pptx", "hwpx", ...TEXT_EXTS];

const extOf = (name: string) => /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase() ?? "";

// ── XML 에서 글 뽑기 ────────────────────────────────────────────────

const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    if (k === "amp") return "&";
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "quot") return '"';
    if (k === "apos") return "'";
    const code = k.startsWith("#x") ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : "";
  });

/** `<tag ...>글</tag>` 들의 글을 순서대로 이어 붙인다. 자기닫힘(`<tag/>`)은 건너뛴다. */
const textOf = (xml: string, tag: string) => {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
  let out = "";
  // 글 태그 안에 섞인 태그(hwpx 의 줄바꿈 등)는 걷어낸다.
  for (const m of xml.matchAll(re)) out += decodeEntities((m[1] ?? "").replace(/<[^>]+>/g, ""));
  return out;
};

/** 문단 태그로 나눠, 문단마다 글 태그를 이어 한 줄로. 빈 문단은 버린다. */
const paragraphs = (xml: string, para: string, text: string) => {
  const re = new RegExp(`<${para}(?:\\s[^>]*)?>([\\s\\S]*?)</${para}>`, "g");
  const lines: string[] = [];
  for (const m of xml.matchAll(re)) {
    // 탭 · 줄바꿈 태그를 글자로 살린다 — 표나 주소가 한 덩어리로 붙지 않게.
    const body = (m[1] ?? "").replace(/<[a-z]+:tab\/>/g, `<${text}>\t</${text}>`)
      .replace(/<[a-z]+:br\/>/g, `<${text}>\n</${text}>`);
    const line = textOf(body, text).trim();
    if (line) lines.push(line);
  }
  return lines.join("\n");
};

const unzip = (bytes: Uint8Array, name: string) => {
  try {
    return unzipSync(bytes);
  } catch {
    throw new Error(`${name} 을 열지 못했다. 파일이 손상됐거나 암호가 걸려 있을 수 있다.`);
  }
};

/** zip 안의 경로를 숫자 순서로(slide2 가 slide10 보다 먼저). */
const numbered = (files: Record<string, Uint8Array>, re: RegExp) =>
  Object.keys(files)
    .filter((p) => re.test(p))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)?.[1] ?? 0) - Number(/(\d+)\.xml$/.exec(b)?.[1] ?? 0));

const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const docxText = (files: Record<string, Uint8Array>) => {
  const xml = files["word/document.xml"];
  if (!xml) throw new Error("Word 문서 본문(word/document.xml)이 없다.");
  // 표의 한 행을 한 문단으로 접고 칸은 탭으로 잇는다 — 칸마다 줄이 바뀌면 표가 세로로 흩어진다.
  const body = strFromU8(xml).replace(/<w:tr\b[\s\S]*?<\/w:tr>/g, (tr) => {
    const cells = [...tr.matchAll(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g)].map((m) =>
      paragraphs(m[1] ?? "", "w:p", "w:t").replace(/\n/g, " "),
    );
    return `<w:p><w:r><w:t>${escapeXml(cells.join("\t"))}</w:t></w:r></w:p>`;
  });
  return paragraphs(body, "w:p", "w:t");
};

const pptxText = (files: Record<string, Uint8Array>) =>
  numbered(files, /^ppt\/slides\/slide\d+\.xml$/)
    .map((path, i) => `## 슬라이드 ${i + 1}\n${paragraphs(strFromU8(files[path]!), "a:p", "a:t")}`)
    .join("\n\n");

const hwpxText = (files: Record<string, Uint8Array>) =>
  numbered(files, /^Contents\/section\d+\.xml$/)
    .map((path) => paragraphs(strFromU8(files[path]!), "hp:p", "hp:t"))
    .join("\n\n");

/** A1 의 열 글자 → 0 부터의 번호. */
const columnIndex = (ref: string) => {
  let n = 0;
  for (const ch of /^[A-Z]+/.exec(ref)?.[0] ?? "A") n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
};

const xlsxText = (files: Record<string, Uint8Array>) => {
  const shared = files["xl/sharedStrings.xml"]
    ? [...strFromU8(files["xl/sharedStrings.xml"]).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
        textOf(m[1] ?? "", "t"),
      )
    : [];

  // 시트 이름은 workbook.xml, 파일 경로는 그 rels 에 있다.
  const workbook = files["xl/workbook.xml"] ? strFromU8(files["xl/workbook.xml"]) : "";
  const rels = files["xl/_rels/workbook.xml.rels"] ? strFromU8(files["xl/_rels/workbook.xml.rels"]) : "";
  const targets = new Map(
    [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [
      /\bId="([^"]+)"/.exec(m[0])?.[1],
      /\bTarget="([^"]+)"/.exec(m[0])?.[1]?.replace(/^\/?(xl\/)?/, "xl/"),
    ]),
  );
  const sheets = [...workbook.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({
    name: decodeEntities(/\bname="([^"]*)"/.exec(m[0])?.[1] ?? "시트"),
    path: targets.get(/\br:id="([^"]+)"/.exec(m[0])?.[1]),
  }));

  return sheets
    .filter((s): s is { name: string; path: string } => !!s.path && !!files[s.path])
    .map(({ name, path }) => {
      const rows: string[] = [];
      for (const row of strFromU8(files[path]!).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
        const cells: string[] = [];
        for (const c of (row[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
          const attrs = c[1] ?? "";
          const inner = c[2] ?? "";
          const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
          const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
          const v = textOf(inner, "v");
          const value =
            type === "s" ? (shared[Number(v)] ?? "")
            : type === "inlineStr" ? textOf(inner, "t")
            : type === "b" ? (v === "1" ? "TRUE" : "FALSE")
            : v;
          const at = ref ? columnIndex(ref) : cells.length;
          while (cells.length < at) cells.push("");
          cells[at] = value.replace(/[\t\n]+/g, " ");
        }
        if (cells.some((x) => x)) rows.push(cells.join("\t"));
      }
      return `## 시트: ${name}\n${rows.join("\n")}`;
    })
    .join("\n\n");
};

/** 평문 — UTF-8 이 아니면 EUC-KR(엑셀이 내보낸 한글 CSV)로 다시 읽는다. */
const plainText = (bytes: Uint8Array) => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("euc-kr").decode(bytes);
  }
};

/** PDF 페이지 수를 어림한다. 객체 스트림에 숨은 페이지는 못 세므로, 셀 수 있을 때만 막는다. */
const countPdfPages = (bytes: Uint8Array) =>
  (Buffer.from(bytes).toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;

const truncate = (text: string) =>
  text.length <= MAX_TEXT_CHARS
    ? text
    : `${text.slice(0, MAX_TEXT_CHARS)}\n\n(… 이하 ${(text.length - MAX_TEXT_CHARS).toLocaleString()}자 생략 — 너무 길어 앞부분만 보냈다)`;

/** 파일 하나를 document 블록으로. */
export const toDocumentBlock = ({ name, data }: DocumentInput): DocumentBlock => {
  const ext = extOf(name);
  if (LEGACY.has(ext)) {
    throw new Error(
      `${name} 은 옛 형식(.${ext})이라 읽지 못한다. ` +
        `${ext === "hwp" ? ".hwpx" : `.${ext}x`} 나 PDF 로 저장해서 다시 붙여 주세요.`,
    );
  }
  if (ext !== "pdf" && !DOCUMENT_EXTS.includes(ext)) {
    throw new Error(`${name} 은 지원하지 않는 파일이다. PDF · 텍스트 · Word · Excel · PowerPoint · 한글(hwpx)만 받는다.`);
  }

  const bytes = new Uint8Array(Buffer.from(data, "base64"));
  if (bytes.length === 0) throw new Error(`${name} 이 비어 있다.`);
  if (bytes.length > MAX_DOCUMENT_BYTES) {
    throw new Error(`${name} 이 너무 크다 (${(bytes.length / 1024 / 1024).toFixed(1)}MB, 최대 10MB).`);
  }

  if (ext === "pdf") {
    if (strFromU8(bytes.subarray(0, 5), true) !== "%PDF-") throw new Error(`${name} 은 PDF 가 아니다.`);
    const pages = countPdfPages(bytes);
    if (pages > MAX_PDF_PAGES) {
      throw new Error(`${name} 은 ${pages}쪽이다. PDF 는 ${MAX_PDF_PAGES}쪽까지 읽을 수 있다.`);
    }
    return { type: "document", title: name, source: { type: "base64", media_type: "application/pdf", data } };
  }

  let text: string;
  if (ext === "docx") text = docxText(unzip(bytes, name));
  else if (ext === "xlsx") text = xlsxText(unzip(bytes, name));
  else if (ext === "pptx") text = pptxText(unzip(bytes, name));
  else if (ext === "hwpx") text = hwpxText(unzip(bytes, name));
  else text = plainText(bytes);

  if (!text.trim()) throw new Error(`${name} 에서 읽을 글을 찾지 못했다.`);
  return { type: "document", title: name, source: { type: "text", media_type: "text/plain", data: truncate(text) } };
};

/** 여러 개. 상한을 넘으면 던진다 — 앞의 것만 쓰고 나머지를 버리지 않는다. */
export const toDocumentBlocks = (docs: readonly DocumentInput[]): DocumentBlock[] => {
  if (docs.length > MAX_DOCUMENTS) {
    throw new Error(`문서는 한 번에 ${MAX_DOCUMENTS}개까지다 (${docs.length}개 받음).`);
  }
  return docs.map(toDocumentBlock);
};
