import { cn } from "@/lib/utils/cn";

/**
 * A loading placeholder.
 *
 * Skeletons are used where the *shape* of the result is known — a table of eight rows, a
 * record with six fields. Where it is not, use a spinner and a sentence; a skeleton that
 * guesses wrong is a layout shift with extra steps.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("relative overflow-hidden rounded-xs bg-sunken", className)}
      aria-hidden="true"
    >
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-rule-2 to-transparent" />
    </div>
  );
}

/** Skeleton shaped like the data table, so the page does not jump when rows land. */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded border border-rule bg-panel" role="status" aria-label="Loading">
      <div className="flex gap-3 border-b border-rule bg-sunken px-3 py-2">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3 border-b border-rule-2 px-3 py-2.5 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-3.5 flex-1" />
          ))}
        </div>
      ))}
      <span className="sr-only">Loading table data</span>
    </div>
  );
}

/** Skeleton shaped like a record detail. */
export function RecordSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded border border-rule bg-panel p-4" role="status" aria-label="Loading">
      <Skeleton className="mb-4 h-5 w-48" />
      <div className="grid gap-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-8">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading record</span>
    </div>
  );
}
