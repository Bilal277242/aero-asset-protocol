import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * A bordered surface.
 *
 * Cards are for a single record's detail, never for browsing collections — a fleet is a
 * table. Consciously flat: a hairline border, no shadow, no accent rail. The rail-on-a-
 * rounded-card pattern is the visual signature of exactly the marketplace look this
 * product is not.
 */
export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded border border-rule bg-panel", className)} {...props}>
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
        "flex flex-wrap items-start justify-between gap-3 border-b border-rule-2 px-4 py-3",
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
        "flex flex-wrap items-center justify-end gap-2 border-t border-rule-2 bg-sunken px-4 py-2.5",
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
