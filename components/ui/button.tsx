"use client";

import { Slot, Slottable } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * LEDGER INSTRUMENT — Button (§9.1) and IconButton (§9.2).
 *
 * Buttons are 8px rounded rectangles, and the control heights come off the
 * reference: 28px for a page header's actions, 32px beside a field, 40px for
 * the one primary action on a focus route. See
 * docs/SHOPIFY_MEASUREMENTS.md — "Header button height 35@1920 → 28".
 *
 * They used to be fully round pills. That was a real decision and it is
 * recorded under DESIGN.md's superseded exceptions, but a pill is the one
 * shape this reference never draws, and a round button beside a 12px radius
 * card is the loudest single tell that the two were not designed together.
 *
 * Rank between two buttons is carried by fill and border — never by hue.
 * There is exactly one coloured button in the entire product and it is the
 * confirm inside a destructive confirmation dialog (§4.6.12), reached here
 * through `variant="destructive"` plus a `data-solid` attribute.
 */

export type ButtonVariant =
  "primary" | "secondary" | "ghost" | "destructive" | "link";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

export const buttonVariants = cva(
  [
    "group relative inline-flex shrink-0 select-none items-center justify-center",
    "whitespace-nowrap rounded-8",
    // §9.1 forbids `transition: all` — only the four properties that change.
    "transition-[background-color,border-color,color,box-shadow]",
    "duration-[var(--dur-1)] ease-[var(--ease-out)]",
    "focus-visible:outline-none",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40",
    // `aria-disabled` keeps the control focusable AND hoverable so a tooltip can
    // explain why it is unavailable (§9.1); only `disabled` kills pointer events.
    "aria-disabled:cursor-not-allowed aria-disabled:opacity-40",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
    // The loading crossfade takes over the LEADING icon slot only: hide the icon
    // directly after the spinner, never a split button's trailing chevron.
    "[&>[data-spinner]+svg]:hidden",
  ],
  {
    variants: {
      size: {
        // Control metrics, not spacing steps: §6.1 governs margin/padding/gap
        // and every padding below is one of the twelve steps, but the heights
        // are the reference's own — 24 · 28 · 32 · 40, with 28 the default
        // because that is what a page header's action row measures.
        xs: "h-[24px] gap-2 px-3 t-control [&_svg:not([data-spinner])]:size-[14px]",
        sm: "h-[28px] gap-2 px-4 t-control [&_svg:not([data-spinner])]:size-[16px]",
        md: "h-[32px] gap-3 px-5 t-body-medium [&_svg:not([data-spinner])]:size-[16px]",
        lg: "h-[40px] gap-3 px-6 t-body-medium [&_svg:not([data-spinner])]:size-[16px]",
      },
      variant: {
        primary: [
          "bg-action text-action-label",
          "hover:bg-action-hover active:bg-action-active",
          "aria-disabled:hover:bg-action",
          // §9.1: on a primary fill the ring's first stop is the fill itself and
          // the second is the label colour, "so the ring reads on the button".
          // Drawn inset — an outward ring in the fill colour would be invisible
          // against a white card. Inset, it reads in both modes.
          "focus-visible:shadow-[inset_0_0_0_2px_var(--action-fill),inset_0_0_0_4px_var(--action-label)]",
        ],
        secondary: [
          // Measured: a flat #e3e3e3 with NO border. The outline this
          // replaces was the right read of a different product — here a
          // bordered white button on a #f1f1f1 pane reads as an input, and
          // the reference never draws one.
          "bg-control text-ink",
          "hover:bg-control-hover active:bg-control-active",
          "aria-disabled:hover:bg-control",
          "aria-pressed:bg-control-active aria-pressed:text-ink",
          "focus-ring",
        ],
        ghost: [
          "text-ink-2",
          "hover:bg-state-hover hover:text-ink active:bg-state-active",
          "aria-disabled:hover:bg-transparent aria-disabled:hover:text-ink-2",
          "aria-pressed:bg-state-selected aria-pressed:text-ink",
          "focus-ring",
        ],
        destructive: [
          // Destructive is a GHOST by default. The label carries the signal and
          // the shape stays identical to every other button, so a red rectangle
          // can never be confused with the primary action.
          "text-critical-text hover:bg-critical-wash active:bg-critical-wash",
          "aria-disabled:hover:bg-transparent",
          "focus-ring",
          // …unless the caller opts into the product's one solid critical fill,
          // which only ConfirmDialog is permitted to do — by passing the
          // `data-solid` attribute, or the `is-solid` marker class if it is
          // routing through `className`.
          "data-[solid]:bg-critical data-[solid]:text-action-label",
          // Hover moves the fill toward the ink token: that darkens it in light
          // mode and lightens it in dark, so the state reads in both without
          // inventing a hue that has no token behind it.
          "data-[solid]:hover:bg-[color-mix(in_srgb,var(--critical-mark)_88%,var(--text-primary))]",
          "data-[solid]:active:bg-[color-mix(in_srgb,var(--critical-mark)_78%,var(--text-primary))]",
          "data-[solid]:focus-visible:shadow-[inset_0_0_0_2px_var(--critical-mark),inset_0_0_0_4px_var(--action-label)]",
          "[&.is-solid]:bg-critical [&.is-solid]:text-action-label",
          "[&.is-solid]:hover:bg-[color-mix(in_srgb,var(--critical-mark)_88%,var(--text-primary))]",
          "[&.is-solid]:active:bg-[color-mix(in_srgb,var(--critical-mark)_78%,var(--text-primary))]",
          "[&.is-solid]:focus-visible:shadow-[inset_0_0_0_2px_var(--critical-mark),inset_0_0_0_4px_var(--action-label)]",
        ],
        link: [
          // Prose-grade link: ink with a soft rule that fills on hover (§4.2).
          // Never blue, never a coloured variant.
          "t-link bg-transparent hover:bg-transparent",
          "focus-ring",
        ],
      },
    },
    compoundVariants: [
      {
        variant: "link",
        // A link is text, not a control box: it drops the pill geometry and
        // sits on the baseline of whatever sentence contains it.
        class: "h-auto gap-2 rounded-2 p-0 align-baseline",
      },
    ],
    defaultVariants: { variant: "secondary", size: "sm" },
  },
);

export type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
  loading?: boolean;
};

export function Button({
  className,
  variant = "secondary",
  size = "md",
  asChild = false,
  loading = false,
  style,
  children,
  ...props
}: ButtonProps): ReactNode {
  const ref = useRef<HTMLButtonElement | null>(null);

  // §7.3 / §11.4.6: an in-flight button keeps its geometry. The resting width is
  // measured after every settled render and parked on the element itself as a
  // custom property, so the value the loading render needs is already ON the
  // node before the spinner appears. The lock is therefore correct on the first
  // loading frame with no ref read during render, no layout effect, and
  // therefore no SSR warning. React never owns `--btn-resting-w`, so it survives
  // every re-render of the button.
  useEffect(() => {
    const node = ref.current;
    if (!loading && node) {
      node.style.setProperty("--btn-resting-w", `${node.offsetWidth}px`);
    }
  });

  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      ref={ref}
      className={cn(
        buttonVariants({ variant, size }),
        loading && "pointer-events-none",
        className,
      )}
      style={
        // Unset until the first settled render — `auto` is min-width's initial
        // value, so a button that mounts already loading locks to nothing,
        // exactly as before.
        loading ? { minWidth: "var(--btn-resting-w, auto)", ...style } : style
      }
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {/* Slottable lets `asChild` still receive the spinner as an extra child. */}
      <Slottable>{children}</Slottable>
    </Comp>
  );
}

/**
 * 14px, 2px stroke, a 270° arc, 700ms linear (§7.3). The timing is set inline
 * because an inline declaration reliably outranks the `animation` shorthand that
 * `animate-spin` emits whichever order the utility layer lands in; the reduced
 * motion block in globals.css still wins over it, since that uses `!important`.
 */
function Spinner(): ReactNode {
  return (
    <svg
      data-spinner=""
      aria-hidden="true"
      viewBox="0 0 14 14"
      fill="none"
      className="size-[14px] shrink-0 animate-spin"
      style={{ animationDuration: "700ms", animationTimingFunction: "linear" }}
    >
      <path
        d="M13 7A6 6 0 1 0 7 13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export type IconButtonProps = ComponentProps<"button"> & {
  /** Becomes the `aria-label`. An icon-only control without one does not ship (§8.2). */
  label: string;
  size?: "sm" | "md" | "lg";
  variant?: "ghost" | "secondary" | "bar";
  asChild?: boolean;
};

const iconButtonSizes: Record<NonNullable<IconButtonProps["size"]>, string> = {
  // §9.2: 28px dense (headers, table rows), 32px toolbars, 40px identity.
  sm: "size-[28px] rounded-8",
  md: "size-[32px] rounded-8",
  lg: "size-[40px] rounded-8",
};

export function IconButton({
  className,
  label,
  size = "md",
  variant = "ghost",
  asChild = false,
  ...props
}: IconButtonProps): ReactNode {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      aria-label={label}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center",
        "transition-[background-color,border-color,color,box-shadow]",
        "duration-[var(--dur-1)] ease-[var(--ease-out)]",
        "focus-ring focus-visible:outline-none",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40",
        "aria-disabled:cursor-not-allowed aria-disabled:opacity-40",
        "[&_svg]:pointer-events-none [&_svg]:size-[16px] [&_svg]:shrink-0",
        // Hit-area feedback is a fill, not a glyph-colour shift (§9.2, §13.6.60).
        "text-ink-3 hover:bg-state-hover hover:text-ink active:bg-state-active",
        "aria-pressed:bg-state-selected aria-pressed:text-ink",
        "aria-disabled:hover:bg-transparent aria-disabled:hover:text-ink-3",
        // §6.5: where the visual box is below the required target, expand it with
        // an invisible pseudo-element — never by growing the box.
        "before:absolute before:-inset-4 before:content-['']",
        "pointer-coarse:before:-inset-6",
        iconButtonSizes[size],
        variant === "secondary" &&
          "border border-border bg-raised text-ink-3 hover:border-strong",
        // On the bar, and only there: the inverted palette, so the control
        // is not a light chip punched into a near-black strip.
        variant === "bar" &&
          "focus-ring-bar text-bar-ink hover:bg-bar-field hover:text-bar-ink active:bg-bar-field-hover",
        className,
      )}
      {...props}
    />
  );
}
