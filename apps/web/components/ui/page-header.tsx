import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {

  kicker?: ReactNode;
  title: ReactNode;

  description?: ReactNode;

  actions?: ReactNode;

  meta?: ReactNode;

  size?: "display" | "title";
  className?: string;
}

export function PageHeader({
  kicker,
  title,
  description,
  actions,
  meta,
  size = "title",
  className,
}: PageHeaderProps): ReactNode {
  return (

    <header className={cn("pb-7 pt-2", className)}>
      {}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col justify-center sm:flex-1">
          {kicker ? (
            <span className="t-label-caps mb-4 text-ink-3">{kicker}</span>
          ) : null}
          <h1
            className={cn(
              size === "display" ? "t-display" : "t-title-1",
              "text-ink",
            )}
          >
            {title}
          </h1>
          {description ? (
            <p className="t-caption mt-3 max-w-[90ch] text-ink-3">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-4 sm:shrink-0 sm:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
      {meta ? (
        <div className="t-caption mt-5 flex flex-wrap items-center gap-5 text-ink-3">
          {meta}
        </div>
      ) : null}
    </header>
  );
}
