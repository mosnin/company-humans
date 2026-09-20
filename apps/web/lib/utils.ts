import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** 46_500 bytes -> "45.4 kB" */
export function formatBytes(bytes: number): string {
  if (!bytes) return NO_VALUE;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDate(ts: number | undefined): string {
  if (!ts) return NO_VALUE;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return NO_VALUE;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * "3 days ago" — relative, coarse, and stable enough for SSR.
 *
 * `now` is passed in rather than read here: the caller holds the clock (see
 * `lib/now.ts`), so every age on a page is measured from one instant and no
 * component becomes impure by asking what time it is mid-render.
 */
export function timeAgo(ts: number | undefined, now: number): string {
  if (!ts) return NO_VALUE;
  const seconds = Math.floor((now - ts) / 1000);
  if (seconds < 45) return "just now";
  const table: [number, number, Intl.RelativeTimeFormatUnit][] = [
    [60, 1, "second"],
    [3600, 60, "minute"],
    [86400, 3600, "hour"],
    [604800, 86400, "day"],
    [2629800, 604800, "week"],
    [31557600, 2629800, "month"],
    [Infinity, 31557600, "year"],
  ];
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [limit, divisor, unit] of table) {
    if (seconds < limit) return rtf.format(-Math.floor(seconds / divisor), unit);
  }
  return NO_VALUE;
}

/**
 * The no-value marker. anti-slop.md rule 20 bans em dashes in user-facing
 * text, and this is the one place the ban does not apply: a lone dash in a
 * metric tile or a table cell is not a sentence, it is the glyph for "no
 * reading". The alternatives the rule offers are all sentence punctuation, and
 * the words that would replace it lie: "None" claims the value is zero when it
 * may only be unloaded. Recorded in DESIGN.md under Argued exceptions. Prose
 * never uses this; if you are writing a sentence, you want a comma or a colon.
 */
export const NO_VALUE = "\u2014";
