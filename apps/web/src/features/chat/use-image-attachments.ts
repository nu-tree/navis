"use client";

import { useCallback, useState } from "react";

/** 와이어 계약(chatRequestSchema.images)과 도메인(MAX_IMAGES)의 상한과 일치해야 한다. */
export const MAX_IMAGES = 8;

/** 서버가 받는 형식. 그 밖은 고르는 단계에서 막는다. */
const ACCEPTED = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export const ACCEPT_ATTR = ACCEPTED.join(",");

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`${file.name} 을 읽지 못했다.`));
    reader.readAsDataURL(file);
  });

/**
 * 첨부 이미지 상태. 파일 읽기와 상한 판정을 훅이 갖고, 화면은 결과만 그린다
 * (헌장 원칙 III).
 */
export function useImageAttachments() {
  const [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const add = useCallback(async (files: readonly File[]) => {
    setError(null);

    const rejected = files.filter((f) => !ACCEPTED.includes(f.type));
    const accepted = files.filter((f) => ACCEPTED.includes(f.type));

    // 상한은 "현재 개수 + 새로 고른 개수" 로 본다. 넘치면 넘치는 만큼만 거절하고
    // 나머지는 받는다 — 전부 거절하면 사용자가 다시 고르는 수고를 한다.
    const room = MAX_IMAGES - images.length;
    const taken = accepted.slice(0, Math.max(room, 0));
    const overflow = accepted.length - taken.length;

    const messages = [
      rejected.length ? `${rejected.length}개는 지원하지 않는 형식이다` : null,
      overflow ? `${overflow}개는 ${MAX_IMAGES}장 상한을 넘어 제외했다` : null,
    ].filter(Boolean);
    if (messages.length) setError(messages.join(". "));

    if (taken.length === 0) return;

    try {
      const urls = await Promise.all(taken.map(readAsDataUrl));
      setImages((prev) => [...prev, ...urls].slice(0, MAX_IMAGES));
    } catch (err) {
      setError(err instanceof Error ? err.message : "이미지를 읽지 못했다.");
    }
  }, [images.length]);

  const removeAt = useCallback((index: number) => {
    setError(null);
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clear = useCallback(() => {
    setImages([]);
    setError(null);
  }, []);

  return {
    images,
    error,
    add,
    removeAt,
    clear,
    isFull: images.length >= MAX_IMAGES,
  };
}
