"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Text input — a well pressed into the surface.
 *
 * The inset shadow is the style; the **retained hairline border is the accessibility
 * floor**. Pure soft UI drops the border and lets the shadow imply the field, which looks
 * excellent and fails WCAG 1.4.11 — a same-hue shadow does not give a control's boundary
 * 3:1 against its surroundings, and a form you cannot locate is not a style choice. So it
 * gets both: the well for the look, a real edge so the field is findable.
 *
 * `mono` is not a style preference — it marks a field whose value is chain data
 * (an address, a hash, an amount, an id). The same split is used throughout the system
 * so a reader can tell protocol values from prose at a glance.
 */
const fieldBase = [
  "w-full rounded-sm bg-sunken text-ink shadow-inset-sm",
  "border border-rule",
  "transition-[box-shadow,border-color] duration-150",
  "hover:border-ink-3",
  "focus:border-accent",
  "disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none",
];

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
        fieldBase,
        "h-9 px-3 text-sm",
        mono && "font-mono text-xs",
        invalid && "border-adverse hover:border-adverse focus:border-adverse",
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
      fieldBase,
      "min-h-[80px] px-3 py-2 text-sm",
      mono && "font-mono text-xs",
      invalid && "border-adverse hover:border-adverse focus:border-adverse",
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
        fieldBase,
        "h-9 appearance-none pl-3 pr-8 text-sm",
        invalid && "border-adverse hover:border-adverse focus:border-adverse",
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
