import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Table primitives.
 *
 * A fleet register is a table. An asset list is a table. Collapsing these into cards on
 * small screens destroys the density that makes them useful, so instead the table scrolls
 * horizontally inside its own container with the identity column pinned — the page body
 * never scrolls sideways.
 */
export function TableWrap({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("overflow-x-auto rounded border border-rule bg-panel", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full border-collapse text-sm", className)} {...props} />;
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-sunken", className)} {...props} />;
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...props} />;
}

export function TR({
  className,
  interactive,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }) {
  return (
    <tr
      className={cn(
        "border-b border-rule-2 last:border-0",
        interactive && "cursor-pointer transition-colors hover:bg-sunken",
        className,
      )}
      {...props}
    />
  );
}

export function TH({
  className,
  numeric,
  sticky,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean; sticky?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        "label-key whitespace-nowrap border-b border-rule px-3 py-2 text-left font-normal",
        numeric && "text-right",
        sticky && "sticky left-0 z-10 bg-sunken",
        className,
      )}
      {...props}
    />
  );
}

export function TD({
  className,
  numeric,
  mono,
  sticky,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & {
  numeric?: boolean;
  mono?: boolean;
  sticky?: boolean;
}) {
  return (
    <td
      className={cn(
        "px-3 py-2 align-middle",
        mono && "font-mono text-xs",
        numeric && "text-right font-mono text-xs",
        // The pinned column needs its own background or rows scroll under it.
        sticky && "sticky left-0 z-10 bg-panel",
        className,
      )}
      {...props}
    />
  );
}

/** A caption that stays available to screen readers while the table scrolls. */
export function TableCaption({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <caption className={cn("sr-only", className)} {...props} />;
}
