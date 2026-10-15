import { Brain, Trash2 } from "lucide-react";
import type { Message } from "@navis/validation";
import { cn } from "cn";
import { formatBubbleTime } from "@/utils/chat-timeline";
import { MarkdownText } from "./markdown-text";

type Props = {
  message: Message;
  /** 묶음의 첫 말풍선 — 나비스면 프로필 · 이름을 단다(utils/chat-timeline). 기본 참. */
  first?: boolean;
  /** 묶음의 마지막 말풍선 — 옆에 시각을 단다. 기본 참. */
  last?: boolean;
  /**
   * 이 메시지 삭제. 없으면 버튼이 나타나지 않는다 — 스트리밍 중인 임시 말풍선처럼
   * 서버에 없는 메시지에는 넘기지 않는다.
   */
  onRemove?: () => void;
};

/** 프로필 자리 너비. 묶음의 둘째 말풍선부터는 같은 너비를 비워 말풍선 줄을 맞춘다. */
const AVATAR = "size-8";

/**
 * 말풍선 — 내 말은 오른쪽, 나비스 말은 왼쪽(2026-10-15 사용자 결정: 하나뿐인 방을 메신저처럼).
 *
 * 예전엔 나비스 답을 전폭 평문으로 두었다 — 긴 마크다운이 좁은 버블에서 안 읽혀서. 지금은 말풍선이 넓고(85%)
 * 코드블록 · 표는 말풍선 안에서 가로로 스크롤한다.
 */
export const MessageBubble = ({ message, first = true, last = true, onRemove }: Readonly<Props>) => {
  const isUser = message.role === "user";
  const time = last ? formatBubbleTime(message.createdAt) : "";

  const removeButton = onRemove ? (
    // 버튼이 항상 보이면 대화가 시끄럽다 — 말풍선에 올렸을 때만.
    <button
      type="button"
      aria-label="메시지 삭제"
      onClick={onRemove}
      className="shrink-0 self-center rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity group-hover/msg:opacity-100 focus-visible:opacity-100 hover:text-destructive"
    >
      <Trash2 className="size-3.5" />
    </button>
  ) : null;

  const timeLabel = time ? (
    <time dateTime={message.createdAt} className="shrink-0 self-end pb-0.5 text-[11px] text-muted-foreground">
      {time}
    </time>
  ) : null;

  if (isUser) {
    return (
      <div className={cn("group/msg flex items-end justify-end gap-1.5", first ? "mt-4" : "mt-1")}>
        {removeButton}
        {timeLabel}
        <div
          className={cn(
            "max-w-[80%] rounded-2xl bg-primary px-3.5 py-2 text-primary-foreground",
            // 묶음 첫 말풍선만 꼬리 쪽 모서리를 좁힌다 — 이어지는 말풍선은 한 덩어리로 보인다.
            first && "rounded-tr-md",
          )}
        >
          {message.images?.length ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {message.images.map((src, i) => (
                /* data URL 이라 원격 호스트도 최적화 대상도 없다. */
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={src.slice(-40) + i}
                  src={src}
                  alt={`첨부 ${i + 1}`}
                  className="size-20 rounded-lg object-cover"
                />
              ))}
            </div>
          ) : null}

          {/* 사용자 입력은 마크다운으로 해석하지 않는다 — 의도 없이 쓴 `*`·`#` 가
              서식으로 바뀌면 원문이 왜곡된다. 줄바꿈만 보존한다.
              이미지만 보낸 턴은 텍스트가 비어 있으므로 그릴 것이 없다(FR-006). */}
          {/* wrap-anywhere: 붙여넣은 로그·명령의 공백 없는 긴 토큰(--enable-features=…)도
              버블 안에서 끊는다. break-word 는 최소 너비 계산에 들어가지 않아, 내용에
              맞춰 줄어드는 이 버블을 그 토큰 길이만큼 밀어낸다. */}
          {message.text ? (
            <p className="whitespace-pre-wrap wrap-anywhere text-md leading-relaxed">{message.text}</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("group/msg flex items-start gap-2", first ? "mt-4" : "mt-1")}>
      {first ? (
        /* eslint-disable-next-line @next/next/no-img-element -- 정적 앱 아이콘, 최적화할 것이 없다. */
        <img src="/icons/icon-192.png" alt="" className={cn(AVATAR, "shrink-0 rounded-full")} />
      ) : (
        <span className={cn(AVATAR, "shrink-0")} aria-hidden />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {first ? <span className="mb-1 text-xs font-medium text-muted-foreground">나비스</span> : null}
        <div className="flex items-end gap-1.5">
          <div
            className={cn(
              "min-w-0 max-w-[85%] rounded-2xl bg-muted px-3.5 py-2 text-foreground",
              first && "rounded-tl-md",
            )}
          >
            {/* 표 · 코드블록이 말풍선 폭을 넘으면 말풍선 안에서 가로로 민다. */}
            <div className="overflow-x-auto">
              <MarkdownText text={message.text} />
            </div>

            {/* 이 턴에 기억이 남았을 때만. 메시지가 들고 온 값으로 판단한다 — 부모가 저장 여부를 알 필요가 없다. */}
            {message.saved ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Brain className="size-3.5" />
                기억에 남겼어요
              </p>
            ) : null}
          </div>
          {timeLabel}
          {removeButton}
        </div>
      </div>
    </div>
  );
};
