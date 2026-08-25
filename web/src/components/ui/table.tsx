"use client";

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

/**
 * The scroll container, with an affordance that it scrolls at all.
 *
 * A table that scrolls sideways with no visual cue is a table whose right-hand columns do
 * not exist as far as most users are concerned. Two cues, both driven by measured scroll
 * state rather than assumed: a fade at whichever edge has content beyond it, and a shadow
 * on the pinned column once the body has moved under it.
 *
 * Both are suppressed when the content fits, so a short table gets no decoration it has
 * not earned.
 */
export function TableWrap({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [edges, setEdges] = React.useState({ left: false, right: false });

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const max = el.scrollWidth - el.clientWidth;
      setEdges({ left: el.scrollLeft > 1, right: max > 1 && el.scrollLeft < max - 1 });
    };

    measure();
    // ...and again after the browser has laid the table out. The effect can run while
    // `scrollWidth === clientWidth`, which reads as "nothing to scroll" and leaves the
    // fade hidden on a table that does scroll — the exact failure this component exists
    // to prevent.
    const frame = requestAnimationFrame(measure);

    el.addEventListener("scroll", measure, { passive: true });

    // Columns hide and show at breakpoints, so the scrollable width changes without any
    // scrolling happening. Without this the fade is correct only until the first resize.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    const table = el.firstElementChild;
    if (table) observer.observe(table);

    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, []);

  return (
    <div className={cn("relative", className)}>
      {/*
        The table is a *well*, not an extrusion. Rows are dense and repetitive; giving
        each one a raised edge would turn the register into gravel. One pressed-in
        container holding flat rows keeps the density readable and still belongs to the
        soft-UI vocabulary.
      */}
      <div
        ref={ref}
        data-scrolled={edges.left ? "true" : "false"}
        className="overflow-x-auto rounded-md bg-panel shadow-raised"
        {...props}
      >
        {children}
      </div>

      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-y-1 right-1 w-8 rounded-r-md",
          "bg-gradient-to-l from-panel to-transparent",
          "transition-opacity duration-200",
          edges.right ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full border-collapse text-sm", className)} {...props} />;
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-sunken shadow-inset-sm", className)} {...props} />;
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...props} />;
}

/**
 * A row.
 *
 * An interactive row navigates, so it has to be reachable by keyboard — a click handler
 * on a `<tr>` alone is invisible to anyone not using a mouse. It takes focus, responds to
 * Enter and Space, and shows the same affordance on focus as on hover.
 */
export function TR({
  className,
  interactive,
  onClick,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }) {
  return (
    <tr
      onClick={onClick}
      tabIndex={interactive ? 0 : undefined}
      role={interactive ? "link" : undefined}
      onKeyDown={
        interactive && onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick(e as unknown as React.MouseEvent<HTMLTableRowElement>);
              }
            }
          : undefined
      }
      className={cn(
        "border-b border-rule-2 last:border-0",
        interactive && [
          "cursor-pointer transition-colors duration-150",
          "hover:bg-raised focus-visible:bg-raised",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent",
        ],
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
        "label-key whitespace-nowrap px-3 py-2.5 text-left font-normal",
        numeric && "text-right",
        // The shadow appears only once the body has actually scrolled under the pinned
        // column — otherwise it reads as a permanent border in the middle of the table.
        sticky && [
          "sticky left-0 z-10 bg-sunken",
          "transition-shadow duration-200",
          "[[data-scrolled=true]_&]:shadow-[6px_0_6px_-6px_rgba(0,0,0,0.25)]",
        ],
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
        // The pinned column needs its own background or rows scroll under it, and a
        // shadow once they do — without it the two layers read as overlapping text.
        sticky && [
          "sticky left-0 z-10 bg-panel",
          "transition-shadow duration-200",
          "[[data-scrolled=true]_&]:shadow-[6px_0_6px_-6px_rgba(0,0,0,0.25)]",
        ],
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
