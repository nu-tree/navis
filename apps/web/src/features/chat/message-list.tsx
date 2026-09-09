import type { Message } from "@navis/validation";
import { cn } from "cn";
import { MessageBubble } from "./message-bubble";

type Props = React.HTMLAttributes<HTMLElement> & {
  messages: Message[];
};

export const MessageList = ({ messages, className }: Readonly<Props>) => {
  return (
    <div
      className={cn(
        "min-h-0 flex-1 overflow-y-auto overscroll-contain",
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </div>
    </div>
  );
};
