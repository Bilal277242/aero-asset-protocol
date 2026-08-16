import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

/**
 * A small classification label.
 *
 * Badges describe *what a thing is* — Aircraft, Engine, Airline, MRO, L2. For *what
 * state it is in*, use `StateChip`, which carries semantic colour and a text label.
 * Keeping the two apart stops the palette from becoming decoration.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-xs border px-1.5 py-0.5 font-mono text-3xs uppercase whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "border-rule bg-sunken text-ink-2",
        accent: "border-accent/40 bg-accent-subtle text-accent",
        outline: "border-rule bg-transparent text-ink-3",
        solid: "border-transparent bg-ink text-ground",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
