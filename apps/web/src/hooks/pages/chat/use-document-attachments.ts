"use client";

import { useState } from "react";
import type { ChatDocument } from "@navis/validation";

/** 와이어 계약(chatRequestSchema.documents)과 도메인(MAX_DOCUMENTS)의 상한과 일치해야 한다. */
export const MAX_DOCUMENTS = 5;
/** 도메인(MAX_DOCUMENT_BYTES)과 같다. 서버도 막지만 보내기 전에 알려 준다. */
const MAX_BYTES = 10 * 1024 * 1024;

/** 서버가 읽는 확장자(domain/chat/documents.ts 의 DOCUMENT_EXTS). 형식 판정은 서버가 권위다. */
const EXTS = [
  "pdf", "docx", "xlsx", "pptx", "hwpx",
  "txt", "md", "markdown", "csv", "tsv", "json", "xml", "yaml", "yml", "log", "html", "htm",
  "ts", "tsx", "js", "jsx", "py", "java", "kt", "go", "rs", "rb", "php", "c", "h", "cpp", "cs",
  "swift", "sql", "sh", "css", "toml", "ini", "env",
];
/** 고르면 서버가 "새 형식으로 저장해 달라" 고 알려 줄 옛 형식. 고르는 단계에서 같은 말을 한다. */
const LEGACY = ["doc", "xls", "ppt", "hwp"];

export const DOCUMENT_ACCEPT = EXTS.map((e) => `.${e}`).join(",");

const extOf = (name: string) => /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase() ?? "";

/** 이 파일을 문서로 받는지. 이미지와 문서 중 어디로 보낼지 화면이 이것으로 가른다. */
export const isDocumentFile = (file: File) => {
  const ext = extOf(file.name);
  return EXTS.includes(ext) || LEGACY.includes(ext);
};

const readAsBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    // data URL 의 접두사(data:...;base64,)를 뗀다 — 와이어는 base64 원본만 받는다.
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(new Error(`${file.name} 을 읽지 못했다.`));
    reader.readAsDataURL(file);
  });

/**
 * 첨부 문서 상태. 이미지 첨부(use-image-attachments)와 같은 모양이다 — 파일 읽기와 상한 판정을
 * 훅이 갖고, 화면은 결과만 그린다(헌장 원칙 III).
 */
export function useDocumentAttachments() {
  const [documents, setDocuments] = useState<ChatDocument[]>([]);
  const [error, setError] = useState<string | null>(null);

  const add = async (files: readonly File[]) => {
    setError(null);

    const legacy = files.filter((f) => LEGACY.includes(extOf(f.name)));
    const tooBig = files.filter((f) => !legacy.includes(f) && f.size > MAX_BYTES);
    const accepted = files.filter((f) => !legacy.includes(f) && !tooBig.includes(f));

    // 상한은 이미지와 같이 "현재 개수 + 새로 고른 개수" 로 본다. 넘치는 만큼만 거절한다.
    const room = MAX_DOCUMENTS - documents.length;
    const taken = accepted.slice(0, Math.max(room, 0));
    const overflow = accepted.length - taken.length;

    const messages = [
      legacy.length
        ? `${legacy.map((f) => f.name).join(", ")} 은 옛 형식이라 읽지 못해요. 새 형식(docx · xlsx · pptx · hwpx)이나 PDF 로 저장해 주세요`
        : null,
      tooBig.length ? `${tooBig.map((f) => f.name).join(", ")} 은 10MB 를 넘어요` : null,
      overflow ? `${overflow}개는 문서 ${MAX_DOCUMENTS}개 상한을 넘어 제외했어요` : null,
    ].filter(Boolean);
    if (messages.length) setError(messages.join(". "));

    if (taken.length === 0) return;

    try {
      const read = await Promise.all(
        taken.map(async (f) => ({ name: f.name, data: await readAsBase64(f) })),
      );
      setDocuments((prev) => [...prev, ...read].slice(0, MAX_DOCUMENTS));
    } catch (err) {
      setError(err instanceof Error ? err.message : "문서를 읽지 못했다.");
    }
  };

  const removeAt = (index: number) => {
    setError(null);
    setDocuments((prev) => prev.filter((_, i) => i !== index));
  };

  const clear = () => {
    setDocuments([]);
    setError(null);
  };

  return {
    documents,
    error,
    add,
    removeAt,
    clear,
    isFull: documents.length >= MAX_DOCUMENTS,
  };
}
