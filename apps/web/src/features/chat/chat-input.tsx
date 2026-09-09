"use client";

import { useRef, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from "react";
import { ArrowUp, ImagePlus, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

const MAX_IMAGES = 8;
// textarea 가 이 높이를 넘으면 늘리지 말고 자기 안에서 스크롤한다.
const MAX_TEXTAREA_PX = 200;

export function ChatInput({
  onSend,
  onStop,
  busy = false,
  disabled = false,
  placeholder = "무엇이든 물어보세요",
  children,
}: {
  onSend: (text: string, images: string[]) => void;
  onStop?: () => void;
  /** 응답 생성 중 — 전송 버튼이 중지 버튼으로 바뀐다. */
  busy?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** 좌측 툴바 슬롯 (모델 선택기 등). */
  children?: React.ReactNode;
}) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canSend = !busy && !disabled && (text.trim().length > 0 || images.length > 0);

  const grow = () => {
    const el = areaRef.current;
    if (!el) return;
    // 먼저 초기화해야 줄을 지웠을 때 높이가 줄어든다.
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`;
  };

  const submit = () => {
    if (!canSend) return;
    onSend(text.trim(), images);
    setText("");
    setImages([]);
    // 전송 후 높이를 한 줄로 되돌린다.
    requestAnimationFrame(() => {
      const el = areaRef.current;
      if (el) el.style.height = "auto";
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter") return;

    // ★ 한글 IME: 조합 중의 Enter 는 글자를 확정하는 키다. isComposing 을 보지 않으면
    // "안녕하" 를 치다 Enter 로 "하" 를 확정하는 순간 메시지가 전송된다.
    // e.nativeEvent.isComposing 이 그 구간을 알려준다 — 반드시 먼저 확인한다.
    if (e.nativeEvent.isComposing) return;

    // Shift+Enter 는 줄바꿈, Enter 는 전송.
    if (e.shiftKey) return;

    e.preventDefault();
    submit();
  };

  const addImages = (files: File[]) => {
    const room = MAX_IMAGES - images.length;
    for (const file of files.slice(0, room)) {
      if (!file.type.startsWith("image/")) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const url = reader.result;
        if (typeof url === "string") setImages((prev) => [...prev, url].slice(0, MAX_IMAGES));
      };
      reader.readAsDataURL(file);
    }
  };

  // 붙여넣기로 스크린샷을 넣는 경로. 실사용에서 파일 선택보다 이게 훨씬 빈번하다.
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length === 0) return;
    e.preventDefault();
    addImages(files);
  };

  const onPickFiles = (e: ChangeEvent<HTMLInputElement>) => {
    addImages(Array.from(e.target.files ?? []));
    // 같은 파일을 다시 고를 수 있게 초기화.
    e.target.value = "";
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-4">
      <div
        className={cn(
          "rounded-2xl border border-border bg-input transition-colors",
          "focus-within:border-ring/60",
        )}
      >
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b border-border p-3">
            {images.map((src, i) => (
              <div key={i} className="group/img relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt=""
                  className="size-16 rounded-lg border border-border object-cover"
                />
                <button
                  onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                  aria-label="첨부 제거"
                  className="absolute -top-1.5 -right-1.5 rounded-full bg-background p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover/img:opacity-100 hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={areaRef}
          rows={1}
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value);
            grow();
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          className="block w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-60"
        />

        <div className="flex items-center gap-1 px-2.5 pb-2.5">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={onPickFiles}
          />
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="이미지 첨부"
            title="이미지 첨부"
            onClick={() => fileRef.current?.click()}
            disabled={disabled || images.length >= MAX_IMAGES}
          >
            <ImagePlus className="size-[18px]" />
          </Button>

          {children}

          <div className="flex-1" />

          {busy ? (
            <Button
              size="icon-lg"
              aria-label="중지"
              title="중지"
              onClick={onStop}
            >
              <Square className="size-3.5 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon-lg"
              aria-label="전송"
              title="전송"
              onClick={submit}
              disabled={!canSend}
            >
              <ArrowUp className="size-[18px]" />
            </Button>
          )}
        </div>
      </div>

      <p className="mt-2 text-center text-[11px] text-muted-foreground/70">
        Enter 로 전송 · Shift+Enter 로 줄바꿈
      </p>
    </div>
  );
}
