import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends ComponentProps<"div"> {

  interactive?: boolean;

  padded?: boolean;
}

export function Card({
  className,
  interactive = false,
  padded = false,
  ...props
}: CardProps): ReactNode {
  return (
    <div
      className={cn(

        "relative rounded-12 border border-border bg-raised text-ink",
        "shadow-[0_1px_0_0_var(--line-strong)]",
        padded && "p-6",
        interactive && [
          "h-full cursor-pointer",

          "transition-[box-shadow,border-color] duration-[var(--dur-2)] ease-[var(--ease-out)]",
          "hover:border-strong hover:shadow-elev-1-hover",

          "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:content-['']",
          "after:transition-colors after:duration-[var(--dur-1)] after:ease-linear",
          "active:after:bg-state-active",

          "focus-ring-canvas",
          "[a:focus-visible>&]:shadow-[0_0_0_2px_var(--surface-canvas),0_0_0_4px_var(--focus-ring)]",
          "[button:focus-visible>&]:shadow-[0_0_0_2px_var(--surface-canvas),0_0_0_4px_var(--focus-ring)]",
        ],
        className,
      )}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: ComponentProps<"div">): ReactNode {
  return (
    <div

      className={cn("flex flex-col gap-5 p-6", className)}
      {...props}
    />
  );
}
