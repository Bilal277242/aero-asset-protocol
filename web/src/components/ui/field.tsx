"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils/cn";

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & { required?: boolean }
>(({ className, required, children, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn("label-key block", className)} {...props}>
    {children}
    {required && (
      <span className="ml-1 text-adverse" aria-hidden="true">
        *
      </span>
    )}
  </LabelPrimitive.Root>
));
Label.displayName = "Label";

/**
 * A labelled form control with hint and error text.
 *
 * Wiring `aria-describedby` and `aria-invalid` by hand at every call site is how those
 * attributes end up missing on the one field that mattered. The component owns them.
 *
 * Error text replaces hint text rather than stacking, so the message a user needs is
 * never the second thing they read.
 */
export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  className,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  required?: boolean;
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}) {
  const describedBy = error ? `${htmlFor}-error` : hint ? `${htmlFor}-hint` : undefined;

  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>

      <div aria-describedby={describedBy}>{children}</div>

      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs text-adverse">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs leading-relaxed text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
