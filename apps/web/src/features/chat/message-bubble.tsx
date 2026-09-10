import { Brain } from "lucide-react";
import type { Message } from "@navis/validation";
import { cn } from "cn";
import { MarkdownText } from "./markdown-text";

type Props = {
  message: Message;
};

export const MessageBubble = ({ message }: Readonly<Props>) => {
  const isUser = message.role === "user";

  return (
    // 사용자는 우측 말풍선, 어시스턴트는 전폭 평문.
    // 긴 마크다운을 좁은 버블에 넣으면 코드블록·표가 읽히지 않는다.
    <div
      className={cn(
        isUser
          ? "ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground"
          : "w-full text-foreground",
      )}
    >
      {isUser ? (
        // 사용자 입력은 마크다운으로 해석하지 않는다 — 의도 없이 쓴 `*`·`#` 가
        // 서식으로 바뀌면 원문이 왜곡된다. 줄바꿈만 보존한다.
        <p className="whitespace-pre-wrap text-md leading-relaxed">
          {message.text}
        </p>
      ) : (
        <>
          <MarkdownText text={message.text} />

          {/* 이 턴에 기억이 남았을 때만. props 를 늘리지 않고 메시지가 들고 온
              값으로 판단한다 — 부모가 저장 여부를 알 필요가 없다. */}
          {message.saved ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Brain className="size-3.5" />
              기억에 남겼어요
            </p>
          ) : null}
        </>
      )}
    </div>
  );
};
