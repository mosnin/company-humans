import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ==========================================================================
   PAGE HEADER, TOOLBAR, SECTION HEADING — §9.12, §2.3

   `<PageHeader>` is a component, not a pattern (anti-pattern 31). The identical
   two-line title block was copy-pasted verbatim into ten of eleven pages, which
   is why arriving anywhere felt like arriving nowhere. Every archetype must
   vary at least one of: title role, action cluster, or the strip beneath it.

   These three are among the only things allowed to put text directly on
   --surface-canvas (§2.3): the page large-title block, sticky group headers,
   and the `label-caps` group heading that sits above a card. They carry no
   surface, no border and no shadow — they ARE the ground.

   Horizontal padding is deliberately absent: the shell owns the one measure and
   the page gutter (§6.3), so a header that added its own 24px would double the
   inset and pull the title out of line with the content beneath it. Vertical
   padding is the spec's 24px top / 20px bottom.
   ========================================================================== */

export interface PageHeaderProps {
  /** `label-caps` --text-tertiary above the title: `REVISION`, `BRANCH`. */
  kicker?: ReactNode;
  title: ReactNode;
  /**
   * One `caption` line, max 90ch. At zero data this is replaced by a `micro`
   * fact (`No revisions yet`) and the primary action becomes the page's only
   * affordance (§9.12).
   */
  description?: ReactNode;
  /** At most one primary, two secondary, then a 28px overflow icon button. */
  actions?: ReactNode;
  /** Stamps, chips and counts beneath the title: HashChip, BranchChip, author. */
  meta?: ReactNode;
  /** `display` on ATLAS, LEDGER STREAM, REGISTRY and BLANK SLATE only. */
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
    // Measured against the reference's index page: the title's cap sits
    // 23.6px below the pane's top edge and the card starts 19.7px under it.
    // `PageShell` already supplies 16 of that top inset as its gutter.
    <header className={cn("pb-7 pt-2", className)}>
      {/* justify-between, never a flex-1 spacer, so the action cluster lands at
          the same x on every route (anti-pattern 40). Below `sm` the cluster
          drops under the title block: a primary button beside a title on a
          375px screen squeezes the description into a ten-character column
          and then overflows the header on top of the kicker. */}
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

export interface ToolbarProps {
  children: ReactNode;
  className?: string;
}

/**
 * The control strip that sits between a page header and its content: segmented
 * control, search field, filter chips, density toggle. It lives on the canvas
 * and carries no surface of its own — a toolbar is not a card.
 *
 * Push a trailing cluster right with `ml-auto` on that child rather than a
 * spacer element, so an empty toolbar collapses instead of leaving a hole.
 */
export function Toolbar({ children, className }: ToolbarProps): ReactNode {
  return (
    <div
      className={cn(
        "flex min-h-[36px] flex-wrap items-center gap-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface SectionHeadingProps {
  children: ReactNode;
  /** A ghost link or a 28px icon button, right-aligned. */
  action?: ReactNode;
  /**
   * `caps` — the `label-caps` group heading that sits on the canvas above a
   * card or grouped list (§2.3, §9.14). This is the default because it is the
   * only heading role the canvas is allowed to hold at this level.
   * `title` — `title-3`, for a section heading INSIDE a card or panel.
   */
  size?: "caps" | "title";
  className?: string;
}

export function SectionHeading({
  children,
  action,
  size = "caps",
  className,
}: SectionHeadingProps): ReactNode {
  return (
    <div
      className={cn(
        // 12px clear of the card below it (§9.14).
        "mb-5 flex items-center justify-between gap-5",
        className,
      )}
    >
      <h2
        className={cn(
          size === "caps" ? "t-label-caps text-ink-3" : "t-title-3 text-ink",
        )}
      >
        {children}
      </h2>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
