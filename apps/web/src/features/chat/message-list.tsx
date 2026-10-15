import type { Message } from "@navis/validation";
import { cn } from "cn";
import { buildTimeline } from "@/utils/chat-timeline";
import { MessageBubble } from "./message-bubble";

// 스크롤 컨테이너가 이 컴포넌트 안에 있으므로 ref 를 받는다 — 새 메시지에서
// 바닥으로 내리는 건 부모가 판단한다.
type Props = React.ComponentProps<"div"> & {
  messages: Message[];
  /** 메시지 하나 삭제. 없으면 삭제 버튼이 나타나지 않는다. */
  onRemove?: (messageId: string) => void;
};

/** 대화 목록 — 날짜 줄과 말풍선 묶음(utils/chat-timeline). 간격은 말풍선이 묶음 위치에 따라 스스로 둔다. */
export const MessageList = ({ messages, onRemove, className, children, ...props }: Readonly<Props>) => {
  const timeline = buildTimeline(messages);

  return (
    <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", className)} {...props}>
      <div className="mx-auto flex w-full max-w-3xl flex-col px-4 pt-2 pb-6">
        {timeline.map((item) =>
          item.kind === "date" ? (
            <div key={item.key} className="mt-6 mb-2 flex items-center gap-3 text-xs text-muted-foreground" role="separator">
              <span className="h-px flex-1 bg-border" />
              {item.label}
              <span className="h-px flex-1 bg-border" />
            </div>
          ) : (
            <MessageBubble
              key={item.key}
              message={item.message}
              first={item.first}
              last={item.last}
              {...(onRemove ? { onRemove: () => onRemove(item.message.id) } : {})}
            />
          ),
        )}

        {/* 스트리밍 중인 답변·진행 표시 — 확정된 메시지 뒤에 붙는다. */}
        {children}
      </div>
    </div>
  );
};
