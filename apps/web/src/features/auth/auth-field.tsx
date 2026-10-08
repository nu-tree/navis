import { cn } from "cn";

type Props = {
  icon: React.ReactNode;
  label: string;
  htmlFor: string;
} & React.HTMLAttributes<HTMLElement>;

export const AuthField = ({
  icon,
  label,
  htmlFor,
  className,
  children,
}: Readonly<Props>) => {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="text-xs font-medium text-muted-foreground"
      >
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground [&_svg]:size-4">
          {icon}
        </span>
        {children}
      </div>
    </div>
  );
};
