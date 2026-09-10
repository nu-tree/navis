import type { Message } from "@navis/validation";
import { cn } from "cn";
import { MessageBubble } from "./message-bubble";

// 스크롤 컨테이너가 이 컴포넌트 안에 있으므로 ref 를 받는다 — 새 메시지에서
// 바닥으로 내리는 건 부모가 판단한다.
type Props = React.ComponentProps<"div"> & {
  messages: Message[];
};

export const MessageList = ({
  messages,
  className,
  ...props
}: Readonly<Props>) => {
  return (
    <div
      className={cn(
        "min-h-0 flex-1 overflow-y-auto overscroll-contain",
        className,
      )}
      {...props}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </div>
    </div>
  );
};
