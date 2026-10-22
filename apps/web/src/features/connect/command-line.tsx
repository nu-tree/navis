import { CopyButton } from "@/components/common/copy-button";

/** 복사 버튼이 달린 한 줄(명령 · 주소). 여러 줄이면 multiline 으로 줄을 살린다. */
export const CommandLine = ({ text, multiline = false }: Readonly<{ text: string; multiline?: boolean }>) => (
  <div className="mt-1.5 flex items-start gap-1 rounded-lg bg-muted py-1 pr-1 pl-3">
    <code
      className={
        multiline
          ? "min-w-0 flex-1 overflow-x-auto py-1.5 font-mono text-xs whitespace-pre"
          : "min-w-0 flex-1 self-center overflow-x-auto font-mono text-xs whitespace-nowrap"
      }
    >
      {text}
    </code>
    <CopyButton text={text} className="size-7 shrink-0" />
  </div>
);
