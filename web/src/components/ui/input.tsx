"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Text input.
 *
 * `mono` is not a style preference — it marks a field whose value is chain data
 * (an address, a hash, an amount, an id). The same split is used throughout the system
 * so a reader can tell protocol values from prose at a glance.
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, mono, invalid, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "h-8 w-full rounded border bg-panel px-2.5 text-sm text-ink transition-colors",
        "border-rule hover:border-ink-3",
        "disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-3",
        mono && "font-mono text-xs",
        invalid && "border-adverse hover:border-adverse",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean; invalid?: boolean }
>(({ className, mono, invalid, ...props }, ref) => (
  <textarea
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(
      "min-h-[72px] w-full rounded border bg-panel px-2.5 py-2 text-sm text-ink transition-colors",
      "border-rule hover:border-ink-3",
      "disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-3",
      mono && "font-mono text-xs",
      invalid && "border-adverse hover:border-adverse",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

/**
 * Native select, styled.
 *
 * A Radix listbox would look identical here and cost a dependency plus the keyboard and
 * screen-reader surface that the native element already has correct on every platform.
 */
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(({ className, invalid, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "h-8 w-full appearance-none rounded border bg-panel pl-2.5 pr-7 text-sm text-ink transition-colors",
        "border-rule hover:border-ink-3",
        "disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-3",
        invalid && "border-adverse",
        className,
      )}
      {...props}
    >
      {children}
    </select>
    <svg
      className="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-ink-3"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  </div>
));
Select.displayName = "Select";
