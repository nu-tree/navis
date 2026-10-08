import { cn } from "cn";

type Props = React.HTMLAttributes<HTMLElement> & {
  label?: string;
};

export const TypingIndicator = ({ label, className }: Readonly<Props>) => {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 text-muted-foreground",
        className,
      )}
    >
      {/* 뛰는 높이(6px)만큼 위 공간을 둔다 — 없으면 점이 윗줄에 닿아 잘려 보인다. */}
      <span className="flex h-4 items-end gap-1.5 pb-0.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-2 rounded-full bg-current opacity-45 motion-safe:animate-typing-dot"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </span>
      <span className="text-sm">{label ?? "생각하는 중"}</span>
    </div>
  );
};
