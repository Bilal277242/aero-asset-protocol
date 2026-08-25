"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";
import { Spinner } from "./spinner";

/**
 * Buttons.
 *
 * The one place soft UI genuinely earns its keep: a button is a physical metaphor, so
 * being extruded at rest and **pressed in on `:active`** is not decoration, it is the
 * affordance. Every variant swaps `shadow-raised-sm` for `shadow-inset-sm` on press.
 *
 * `primary` and `danger` keep a solid fill rather than becoming tinted extrusions. A
 * filled control is the only thing on the page that reads instantly as *the* action, and
 * dissolving it into the background to match a style would cost more than it buys — they
 * take the shadow as well, so they still belong to the same world.
 *
 * `danger` is reserved for irreversible protocol actions (revoke, destroy, resolve a
 * dispute). It is not a synonym for "delete" and should stay rare enough to mean
 * something.
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded",
    "font-medium select-none",
    "transition-[box-shadow,background-color,color,transform] duration-150",
    "disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none",
    "[&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary: [
          "bg-accent text-accent-ink shadow-raised-sm",
          "hover:bg-accent-hover",
          "active:shadow-inset-sm",
        ],
        secondary: [
          "bg-panel text-ink shadow-raised-sm",
          "hover:text-accent",
          "active:shadow-inset-sm",
        ],
        // Flush until touched, then lifts. The one control that starts flat, because a
        // toolbar of extruded ghosts is indistinguishable from a toolbar of buttons.
        ghost: "text-ink-2 hover:text-ink hover:shadow-raised-sm active:shadow-inset-sm",
        danger: [
          "bg-adverse text-ink-inv shadow-raised-sm",
          "hover:opacity-90",
          "active:shadow-inset-sm",
        ],
        link: "text-accent underline underline-offset-2 hover:text-accent-hover",
      },
      size: {
        sm: "h-8 px-3 text-xs [&_svg]:size-3.5",
        md: "h-9 px-4 text-sm [&_svg]:size-4",
        lg: "h-11 px-5 text-base [&_svg]:size-4",
        icon: "h-9 w-9 [&_svg]:size-4",
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
