import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * An extruded surface.
 *
 * Cards are for a single record's detail, never for browsing collections — a fleet is a
 * table. The card is the same tone as the page and is separated from it purely by the
 * raised shadow pair, which is the whole idea of soft UI: nothing is drawn on top of the
 * page, things are pushed out of it.
 *
 * No border. A border plus a shadow reads as a card wearing a card.
 */
export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-md bg-panel shadow-raised", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({
  className,
  title,
  description,
  actions,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        // A seam rather than a rule: on a shadow-built surface a hard 1px line cuts the
        // extrusion in half and the card stops reading as one object.
        "flex flex-wrap items-start justify-between gap-3 px-4 py-3 shadow-hairline",
        className,
      )}
      {...props}
    >
      <div className="min-w-0">
        <h3 className="font-mono text-sm font-semibold tracking-tight text-ink">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 py-3", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-2 rounded-b-md bg-sunken px-4 py-2.5",
        "shadow-inset-sm",
        className,
      )}
      {...props}
    />
  );
}

/**
 * A key/value row — the workhorse of every record view.
 *
 * Stacks on narrow screens instead of squeezing two columns into 320px, because a
 * truncated address is worse than a wrapped one.
 */
export function DataRow({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 border-b border-rule-2 py-2 last:border-0",
        "tablet:flex-row tablet:items-baseline tablet:justify-between tablet:gap-8",
        className,
      )}
    >
      <dt className="label-key">{label}</dt>
      <dd className="min-w-0 text-sm text-ink tablet:max-w-[62%] tablet:text-right">{children}</dd>
    </div>
  );
}
