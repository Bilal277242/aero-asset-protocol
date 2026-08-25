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
  "inline-flex items-center gap-1 rounded-xs px-2 py-0.5 font-mono text-3xs uppercase whitespace-nowrap",
  {
    variants: {
      variant: {
        // Pressed into the surface. A badge is a label, not a control, so it reads
        // better recessed than extruded — and it keeps chips from competing with the
        // buttons beside them.
        neutral: "bg-sunken text-ink-2 shadow-inset-sm",
        accent: "bg-accent-subtle text-accent shadow-inset-sm",
        outline: "border border-rule bg-transparent text-ink-3",
        solid: "bg-ink text-ground shadow-raised-sm",
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
