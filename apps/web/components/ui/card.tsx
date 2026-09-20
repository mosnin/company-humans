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

export interface CardHeaderProps extends ComponentProps<"div"> {

  ruled?: boolean;
}

export function CardHeader({
  className,
  ruled = false,
  ...props
}: CardHeaderProps): ReactNode {
  return (
    <div
      className={cn(
        "flex justify-between gap-5",
        ruled
          ? // Measured: 16px sides, a 44px single-line row, a rule beneath.
            "min-h-[44px] items-center border-b border-border px-6 py-3"
          : // Unruled: 16px of air to the content below, which `CardContent`

            "items-start px-6 pt-6",
        className,
      )}
      {...props}
    />
  );
}

type HeadingLevel = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

export interface CardTitleProps extends ComponentProps<"h3"> {

  as?: HeadingLevel;
}

export function CardTitle({
  as: Tag = "h3",
  className,
  ...props
}: CardTitleProps): ReactNode {

  return <Tag className={cn("t-title-3 text-ink", className)} {...props} />;
}

export function CardDescription({
  className,
  ...props
}: ComponentProps<"p">): ReactNode {
  return <p className={cn("t-caption text-ink-3", className)} {...props} />;
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

export interface CardFooterProps extends ComponentProps<"div"> {

  inset?: boolean;
}

export function CardFooter({
  className,
  inset = false,
  ...props
}: CardFooterProps): ReactNode {
  return (
    <div
      className={cn(

        "flex min-h-[44px] items-center justify-between gap-5 rounded-b-[inherit] border-t border-border px-6 py-3",
        inset && "bg-inset",
        className,
      )}
      {...props}
    />
  );
}

export function CardSection({
  className,
  ...props
}: ComponentProps<"div">): ReactNode {
  return (
    <div
      className={cn(
        "flex flex-col gap-5 border-t border-border p-7 first:border-t-0",
        className,
      )}
      {...props}
    />
  );
}

export interface CardToolbarProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;

  ruled?: boolean;
  className?: string;
}

export function CardToolbar({
  title,
  description,
  actions,
  ruled = false,
  className,
}: CardToolbarProps): ReactNode {
  return (
    <CardHeader ruled={ruled} className={className}>
      <div className="flex min-w-0 flex-col gap-2">
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-4">{actions}</div>
      ) : null}
    </CardHeader>
  );
}
