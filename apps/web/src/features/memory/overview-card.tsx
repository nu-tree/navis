import { cn } from "cn";

type Props = {
  label: string;
  /** 제목 앞 작은 점 — 분류 색. */
  color?: string;
  /** 오른쪽 위 "… →" 링크. 목록이나 할 일 탭으로 넘어간다. */
  action?: { label: string; onClick: () => void };
  className?: string;
  children: React.ReactNode;
};

/** "한눈에" 보드의 카드 한 칸 — 이름 줄 + 내용. */
export const OverviewCard = ({ label, color, action, className, children }: Readonly<Props>) => (
  <section
    className={cn(
      "flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-input md:p-6",
      className,
    )}
  >
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-xs font-medium tracking-[0.06em] text-muted-foreground">
        {color ? <CategoryDot color={color} /> : null}
        {label}
      </h2>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="-mr-2 rounded-md px-2 py-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
        >
          {action.label} →
        </button>
      ) : null}
    </div>
    {children}
  </section>
);

/** 분류 색 점. 장식이라 스크린리더에서 숨긴다 — 이름이 늘 옆에 있다. */
export const CategoryDot = ({ color, className }: Readonly<{ color: string; className?: string }>) => (
  <i aria-hidden className={cn("inline-block size-2 shrink-0 rounded-[2px]", className)} style={{ background: color }} />
);
