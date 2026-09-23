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
