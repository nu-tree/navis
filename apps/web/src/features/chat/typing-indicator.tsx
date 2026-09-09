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
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 animate-bounce rounded-full bg-current"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </span>
      <span className="text-sm">{label ?? "생각하는 중"}</span>
    </div>
  );
};
