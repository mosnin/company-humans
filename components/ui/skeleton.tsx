"use client";

import {
  useEffect,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/**
 * LEDGER INSTRUMENT — Skeleton (§9.36, §11.4).
 *
 * A pulse, never a travelling shimmer: a shimmer implies horizontal progress
 * that does not exist, and across forty rows it is nauseating. Fill is `--track`
 * — a fill, not a surface rung, so it is legal on every ground (§2.1).
 *
 * The default radius is `--r-4`, which is the radius of a text bar. Anything
 * standing in for a tile, a card or an avatar passes ITS OWN radius and its own
 * geometry through `className`: a skeleton whose box differs from the content it
 * is replacing buys a layout shift at exactly the moment the user starts reading.
 */
export function Skeleton({
  className,
  ...props
}: ComponentProps<"div">): ReactNode {
  const stalled = useStalledAfter(8000);
  return (
    <div
      aria-hidden="true"
      className={cn(
        "bg-track rounded-4",
        // §11.4.4 "nothing forever": once the request is plainly stuck, the pulse
        // stops and the block holds static, so a stalled screen looks stalled
        // instead of perpetually busy.
        !stalled && PULSE,
        className,
      )}
      {...props}
    />
  );
}

export interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

/**
 * Bar widths are drawn deterministically from the row index out of the fixed set
 * in §9.36, so the ragged edge is stable across re-renders instead of flickering
 * into a new shape every frame. Bars are 12px on a 20px rhythm — the line box of
 * `t-body`, which is what they stand in for.
 */
export function SkeletonText({
  lines = 3,
  className,
}: SkeletonTextProps): ReactNode {
  // Zero lines is a real answer, not a fallback: render nothing rather than an
  // empty animated band.
  if (lines <= 0) return null;
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          className={cn("h-[12px]", TEXT_WIDTHS[index % TEXT_WIDTHS.length])}
        />
      ))}
    </div>
  );
}

/** §9.36's fixed width set, as static classes so Tailwind can see them. */
const TEXT_WIDTHS = [
  "w-[96%]",
  "w-[72%]",
  "w-[58%]",
  "w-[40%]",
  "w-[30%]",
] as const;

/**
 * `ledger-skeleton` is declared in globals.css. Written as a single arbitrary
 * property rather than `animate-[…]` so no other utility can reset a longhand of
 * the shorthand, and with a literal fallback for the easing so the declaration
 * stays valid even if the token is unavailable at the point of use.
 */
const PULSE =
  "[animation:ledger-skeleton_1200ms_var(--ease-move,cubic-bezier(0.4,0,0.2,1))_infinite_alternate]";

function useStalledAfter(ms: number): boolean {
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setStalled(true), ms);
    return () => window.clearTimeout(timer);
  }, [ms]);
  return stalled;
}
