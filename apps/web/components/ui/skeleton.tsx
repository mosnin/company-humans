"use client";

import {
  useEffect,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";


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


const TEXT_WIDTHS = [
  "w-[96%]",
  "w-[72%]",
  "w-[58%]",
  "w-[40%]",
  "w-[30%]",
] as const;


const PULSE =
  "[animation:human-skeleton_1200ms_var(--ease-move,cubic-bezier(0.4,0,0.2,1))_infinite_alternate]";

function useStalledAfter(ms: number): boolean {
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setStalled(true), ms);
    return () => window.clearTimeout(timer);
  }, [ms]);
  return stalled;
}
