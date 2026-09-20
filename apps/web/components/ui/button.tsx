"use client";

import { Slot, Slottable } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant =
  "primary" | "secondary" | "ghost" | "destructive" | "link";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

export const buttonVariants = cva(
  [
    "group relative inline-flex shrink-0 select-none items-center justify-center",
    "whitespace-nowrap rounded-8",

    "transition-[background-color,border-color,color,box-shadow]",
    "duration-[var(--dur-1)] ease-[var(--ease-out)]",
    "focus-visible:outline-none",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40",

    "aria-disabled:cursor-not-allowed aria-disabled:opacity-40",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",

    "[&>[data-spinner]+svg]:hidden",
  ],
  {
    variants: {
      size: {

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

          "focus-visible:shadow-[inset_0_0_0_2px_var(--action-fill),inset_0_0_0_4px_var(--action-label)]",
        ],
        secondary: [

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

          "text-critical-text hover:bg-critical-wash active:bg-critical-wash",
          "aria-disabled:hover:bg-transparent",
          "focus-ring",

          "data-[solid]:bg-critical data-[solid]:text-action-label",

          "data-[solid]:hover:bg-[color-mix(in_srgb,var(--critical-mark)_88%,var(--text-primary))]",
          "data-[solid]:active:bg-[color-mix(in_srgb,var(--critical-mark)_78%,var(--text-primary))]",
          "data-[solid]:focus-visible:shadow-[inset_0_0_0_2px_var(--critical-mark),inset_0_0_0_4px_var(--action-label)]",
          "[&.is-solid]:bg-critical [&.is-solid]:text-action-label",
          "[&.is-solid]:hover:bg-[color-mix(in_srgb,var(--critical-mark)_88%,var(--text-primary))]",
          "[&.is-solid]:active:bg-[color-mix(in_srgb,var(--critical-mark)_78%,var(--text-primary))]",
          "[&.is-solid]:focus-visible:shadow-[inset_0_0_0_2px_var(--critical-mark),inset_0_0_0_4px_var(--action-label)]",
        ],
        link: [

          "t-link bg-transparent hover:bg-transparent",
          "focus-ring",
        ],
      },
    },
    compoundVariants: [
      {
        variant: "link",

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

        loading ? { minWidth: "var(--btn-resting-w, auto)", ...style } : style
      }
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {}
      <Slottable>{children}</Slottable>
    </Comp>
  );
}

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

  label: string;
  size?: "sm" | "md" | "lg";
  variant?: "ghost" | "secondary" | "bar";
  asChild?: boolean;
};

const iconButtonSizes: Record<NonNullable<IconButtonProps["size"]>, string> = {

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

        "text-ink-3 hover:bg-state-hover hover:text-ink active:bg-state-active",
        "aria-pressed:bg-state-selected aria-pressed:text-ink",
        "aria-disabled:hover:bg-transparent aria-disabled:hover:text-ink-3",

        "before:absolute before:-inset-4 before:content-['']",
        "pointer-coarse:before:-inset-6",
        iconButtonSizes[size],
        variant === "secondary" &&
          "border border-border bg-raised text-ink-3 hover:border-strong",

        variant === "bar" &&
          "focus-ring-bar text-bar-ink hover:bg-bar-field hover:text-bar-ink active:bg-bar-field-hover",
        className,
      )}
      {...props}
    />
  );
}
