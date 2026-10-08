"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ArrowUp, ImagePlus, Square, X } from "lucide-react";
import { DEFAULT_MODEL, type Model } from "@navis/validation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "cn";
import { ModelPicker } from "./model-picker";
import { ACCEPT_ATTR, useImageAttachments } from "@/hooks/pages/chat/use-image-attachments";

export type SendInput = {
  text: string;
  images?: string[];
  model?: Model;
};

type Props = React.HTMLAttributes<HTMLElement> & {
  // 객체 하나로 받는다 — ChatRequest 와 같은 모양이라 필드가 늘어도 시그니처가
  // 그대로다(헌장 원칙 V).
  onSend: (input: SendInput) => void;
  /** 턴이 도는 중 — 전송 버튼이 중지 버튼으로 바뀐다. */
  busy?: boolean;
  onStop?: () => void;
};

export const ChatInput = ({
  onSend,
  busy = false,
  onStop,
  className,
}: Readonly<Props>) => {
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState<Model>(DEFAULT_MODEL);
  const attachments = useImageAttachments();
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  // 파일을 끌어 입력창 위에 올려둔 상태 — 놓을 수 있다는 표시를 켠다.
  const [dragging, setDragging] = useState(false);

  const trimmed = draft.trim();
  // 텍스트 없이 이미지만으로도 보낼 수 있다(FR-006).
  const canSend = (trimmed.length > 0 || attachments.images.length > 0) && !busy;

  const send = () => {
    if (!canSend) return;
    onSend({
      text: trimmed,
      ...(attachments.images.length ? { images: attachments.images } : {}),
      model,
    });
    setDraft("");
    attachments.clear();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    // 한글 입력 중의 Enter 는 조합을 확정하는 키다. 여기서 보내면 마지막 글자가
    // 잘리거나 한 번 더 전송된다.
    if (event.nativeEvent.isComposing) return;

    event.preventDefault();
    send();
  };

  const handleFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    void attachments.add([...(event.target.files ?? [])]);
    // 같은 파일을 연달아 고를 수 있게 비운다 — 비우지 않으면 change 가 안 난다.
    event.target.value = "";
  };

  // ⌘V / Ctrl+V 로 클립보드의 이미지(스크린샷 · 복사한 이미지)를 첨부한다. 입력창에 커서가
  // 없어도 받도록 document 에서 듣는다 — 붙여넣기 이벤트는 입력창에서도 여기까지 올라온다.
  // 형식·상한 판정은 add() 가 한다. 핸들러는 늘 최신 첨부 상태를 봐야 하지만 구독은
  // 한 번이면 된다 — useEffectEvent 로 가른다.
  const onPaste = useEffectEvent((event: ClipboardEvent) => {
    const target = event.target as HTMLElement | null;
    // 다른 입력 필드에 붙여넣는 건 그 필드의 일이다.
    const editable = target?.closest("input, textarea, [contenteditable='true']");
    if (editable && editable !== textarea.current) return;

    const data = event.clipboardData;
    if (!data) return;
    // files 가 비고 items 에만 이미지가 담기는 브라우저가 있다 — 둘 다 본다.
    const files = data.files.length
      ? [...data.files]
      : [...data.items]
          .filter((item) => item.kind === "file")
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null);
    if (files.length === 0) return;

    // 웹 페이지를 복사하면 이미지와 글이 함께 실린다. 글이 있으면 평소대로 붙게 두고,
    // 이미지뿐일 때만 막는다 — 막지 않으면 파일 이름이 글자로 들어가는 브라우저가 있다.
    if (!data.getData("text/plain")) event.preventDefault();
    void attachments.add(files);
    // 붙여넣고 바로 설명을 쓸 수 있게.
    textarea.current?.focus();
  });

  useEffect(() => {
    const listener = (event: ClipboardEvent) => onPaste(event);
    document.addEventListener("paste", listener);
    return () => document.removeEventListener("paste", listener);
  }, []);

  // 파일을 끄는 중일 때만 반응한다 — 글자를 끌어 옮기는 건 평소대로 둔다.
  const hasFiles = (event: React.DragEvent) => event.dataTransfer.types.includes("Files");

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasFiles(event)) return;
    // 기본 동작을 막아야 drop 이 일어난다. 안 막으면 브라우저가 파일을 새 탭으로 연다.
    event.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    // 안쪽 요소(textarea · 버튼)로 넘어가도 dragleave 가 난다. 상자를 실제로 벗어날 때만 끈다.
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDragging(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    setDragging(false);
    void attachments.add([...event.dataTransfer.files]);
  };

  return (
    <div className={cn("mx-auto w-full max-w-3xl px-4 pb-4", className)}>
      {/* 테두리·배경·포커스 표시는 이 컨테이너가 갖는다 — textarea 와 툴바가
          한 상자로 보여야 하므로. 그래서 안쪽 Textarea 의 chrome 은 상쇄한다. */}
      <div
        data-tour="chat-input"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "rounded-2xl border border-border bg-input transition-colors focus-within:border-ring/60",
          dragging && "border-primary bg-primary/5 ring-3 ring-primary/20",
        )}
      >
        {attachments.images.length > 0 ? (
          <div className="flex flex-wrap gap-2 px-3 pt-3">
            {attachments.images.map((src, index) => (
              <div
                key={src.slice(-40) + index}
                className="group relative size-16 overflow-hidden rounded-lg border border-border"
              >
                {/* data URL 이라 원격 호스트도 최적화 대상도 없다 — next/image 를
                    쓸 이유가 없다. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`첨부 ${index + 1}`} className="size-full object-cover" />
                <Button
                  variant="secondary"
                  size="icon-xs"
                  aria-label={`첨부 ${index + 1} 제거`}
                  onClick={() => attachments.removeAt(index)}
                  className="absolute top-0.5 right-0.5 rounded-full bg-background/80 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <X />
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        {attachments.error ? (
          <p className="px-4 pt-2 text-xs text-destructive">{attachments.error}</p>
        ) : null}

        <Textarea
          ref={textarea}
          rows={1}
          placeholder={dragging ? "여기에 놓으면 첨부돼요" : "무엇이든 물어보세요"}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          className={cn(
            // shadcn Textarea 는 독립 필드용이라 자기 테두리·배경·포커스링·min-h-16 을
            // 갖는다. 상자를 컨테이너가 그리므로 여기선 지운다.
            "min-h-0 resize-none rounded-none border-0 bg-transparent focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent",
            // field-sizing-content 는 Textarea 에 이미 있다 — 입력에 따라 자라고
            // max-h 에 닿으면 내부 스크롤로 넘어간다.
            "max-h-50 px-4 pt-3.5 pb-2 text-[15px] leading-relaxed",
          )}
        />

        <div className="flex items-center gap-1 px-2.5 pb-2.5">
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT_ATTR}
            multiple
            hidden
            onChange={handleFiles}
          />
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="이미지 첨부"
            data-tour="attach"
            disabled={attachments.isFull || busy}
            onClick={() => fileInput.current?.click()}
          >
            <ImagePlus className="size-4.5" />
          </Button>

          <ModelPicker value={model} onChange={setModel} disabled={busy} />

          <div className="flex-1" />

          {busy ? (
            <Button size="icon-lg" aria-label="중지" onClick={onStop}>
              <Square className="size-4 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon-lg"
              aria-label="전송"
              disabled={!canSend}
              onClick={send}
            >
              <ArrowUp className="size-4.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
