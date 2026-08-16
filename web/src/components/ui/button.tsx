"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";
import { Spinner } from "./spinner";

/**
 * Buttons.
 *
 * Square-ish by design — 4px, not a pill. Aircraft placards, data plates and technical
 * drawings have corners; the geometry is where a lot of the "not a consumer app" feeling
 * actually lives.
 *
 * `danger` is reserved for irreversible protocol actions (revoke, destroy, resolve a
 * dispute). It is not a synonym for "delete" and should stay rare enough to mean
 * something.
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded",
    "font-medium transition-colors select-none",
    "disabled:pointer-events-none disabled:opacity-45",
    "[&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-ink hover:bg-accent-hover",
        secondary: "border border-rule bg-panel text-ink hover:bg-sunken hover:border-ink-3",
        ghost: "text-ink-2 hover:bg-sunken hover:text-ink",
        danger: "bg-adverse text-ink-inv hover:opacity-90",
        link: "text-accent underline underline-offset-2 hover:text-accent-hover",
      },
      size: {
        sm: "h-7 px-2.5 text-xs [&_svg]:size-3.5",
        md: "h-8 px-3 text-sm [&_svg]:size-4",
        lg: "h-10 px-4 text-base [&_svg]:size-4",
        icon: "h-8 w-8 [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  /** Screen-reader text announced while `loading`. */
  loadingLabel?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild, loading, loadingLabel = "Working", children, disabled, ...props },
    ref,
  ) => {
    // `asChild` and a spinner cannot coexist: Slot requires exactly one child.
    if (asChild) {
      return (
        <Slot ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props}>
          {children}
        </Slot>
      );
    }

    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Spinner className="size-3.5" />}
        {loading ? <span className="sr-only">{loadingLabel}</span> : null}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
