import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ==========================================================================
   CARD / PANEL — §9.13

   Defect zero (§2.6) lived here: the card shipped `bg-muted/50`, DARKER than
   the page, with no shadow and the same fill as the sidebar. The correction is
   this file: --surface-raised on --surface-canvas, a --line-border edge, and
   --elev-1. The ground is below; the object is above.

   Two rules this file enforces so callers cannot break them:
     · Sections inside a card are hairline-ruled regions, never nested cards
       (§5.7). `CardSection` is the only subdivision primitive, and it draws a
       rule — it has no surface, no border box and no shadow.
     · Vertical rhythm (§6.2) is owned by the components: heading -> content
       16px, sibling blocks 12px. `CardContent` and `CardSection` stack their
       children at 12px so a caller never has to remember.
   ========================================================================== */

export interface CardProps extends ComponentProps<"div"> {
  /**
   * Only for cards that navigate or drag (§5.8). Hover changes box-shadow and
   * border-colour — never `translateY`. Cards sharpen; they do not levitate.
   */
  interactive?: boolean;
  /**
   * The card's own 20px padding, for simple cards that do not compose
   * `CardHeader` / `CardContent` (those bring their own).
   */
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
        // `relative` carries the press overlay; the frame always renders, so a
        // card with nothing in it is still a legible empty object (§11.2).
        // Measured: a 12px radius, a #e2e2e2 edge, and a bottom edge one step
        // darker than the other three — the reference draws a card as a sheet
        // resting on the pane, not as a rectangle outlined on it, and that
        // single darker line under it is the whole of the effect.
        "relative rounded-12 border border-border bg-raised text-ink",
        "shadow-[0_1px_0_0_var(--line-strong)]",
        padded && "p-6",
        interactive && [
          "h-full cursor-pointer",
          // Transition the two properties that change and nothing else — never
          // `transition: all`, which animates layout on hover (§13.61).
          "transition-[box-shadow,border-color] duration-[var(--dur-2)] ease-[var(--ease-out)]",
          "hover:border-strong hover:shadow-elev-1-hover",
          // --state-active is an alpha fill, so the press must composite OVER
          // the raised ground rather than replace it.
          "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:content-['']",
          "after:transition-colors after:duration-[var(--dur-1)] after:ease-linear",
          "active:after:bg-state-active",
          // A card that navigates is normally the child of a wrapping <a> or
          // <button>, so focus lands on the wrapper. Mirror the two-stop ring
          // onto the box the user can actually see (§13.37).
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
  /**
   * A 1px hairline under the header. Per §9.13 this is drawn **only** when the
   * body is a table, a list or a chart; a prose body gets space, not a rule.
   */
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
            // supplies as its own top padding (§6.2 heading -> content 16px).
            "items-start px-6 pt-6",
        className,
      )}
      {...props}
    />
  );
}

type HeadingLevel = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

export interface CardTitleProps extends ComponentProps<"h3"> {
  /**
   * The heading level. Defaults to `h3`, which is correct only under an `h2`
   * (a `SectionHeading`) — hardcoding it broke the outline of every page by
   * construction, so pass the level the page actually needs (§12.6).
   */
  as?: HeadingLevel;
}

export function CardTitle({
  as: Tag = "h3",
  className,
  ...props
}: CardTitleProps): ReactNode {
  // Measured on "Catalogs" and "Payment terms": 14px semibold. Size no
  // longer shouts; the rule beneath does the separating.
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
      // 16px body padding; 12px between sibling blocks, enforced rather than
      // remembered. A table or list body overrides with `p-0` and bleeds to the
      // card edge (§9.13).
      className={cn("flex flex-col gap-5 p-6", className)}
      {...props}
    />
  );
}

export interface CardFooterProps extends ComponentProps<"div"> {
  /** `--surface-inset` ground, for footers whose content is actions (§9.13). */
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
        // `rounded-b-[inherit]` so an inset footer follows whatever radius the
        // card is wearing (12 default, 14 dense, 16 page-level) instead of
        // squaring off over it.
        "flex min-h-[44px] items-center justify-between gap-5 rounded-b-[inherit] border-t border-border px-6 py-3",
        inset && "bg-inset",
        className,
      )}
      {...props}
    />
  );
}

/**
 * A hairline-ruled region inside a card — the ONLY way to subdivide one.
 * A section is not a surface: it has no fill, no border box and no shadow, so
 * it can never read as a card inside a card (§5.7, anti-pattern 4).
 *
 * Place sections as direct children of `Card` so the rule spans the full width.
 * The first section suppresses its own rule, so a stack of them reads as
 * separated rather than boxed.
 */
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
  /** Draw the hairline under the header — table, list and chart bodies only. */
  ruled?: boolean;
  className?: string;
}

/**
 * The composed card header: title (+ optional description) left, actions right.
 * Uses `justify-between` rather than a `flex-1` spacer, so the action cluster
 * lands at the same x on every card in a row (anti-pattern 40).
 */
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
