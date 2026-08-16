"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Table, TableWrap, THead, TBody, TR, TH, TD, TableCaption } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "./states";

export type Column<T> = {
  key: string;
  header: string;
  /** Renders the cell. Receives the whole row. */
  cell: (row: T) => React.ReactNode;
  numeric?: boolean;
  mono?: boolean;
  sortable?: boolean;
  /** Pins the column left while the table scrolls. Use for the identity column only. */
  sticky?: boolean;
  /** Hidden below this breakpoint, so narrow screens keep the columns that matter. */
  hideBelow?: "tablet" | "laptop" | "desktop";
};

/**
 * The data table.
 *
 * A fleet register *is* a table, and collapsing it into cards on small screens destroys
 * the density that makes it useful. Instead: horizontal scroll inside the container, the
 * identity column pinned, and low-value columns dropped by breakpoint. The page body
 * never scrolls sideways.
 *
 * Sorting is client-side and controlled by the caller, because the interesting sorts here
 * (effective state, price with mixed decimals) are domain decisions, not string compares.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  loading,
  empty,
  onRowClick,
  sort,
  onSortChange,
  className,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Announced to screen readers. Required — a table without one is a maze. */
  caption: string;
  loading?: boolean;
  empty?: React.ReactNode;
  onRowClick?: (row: T) => void;
  sort?: { key: string; dir: "asc" | "desc" };
  onSortChange?: (key: string) => void;
  className?: string;
}) {
  if (loading) return <TableSkeleton rows={6} cols={columns.length} />;

  if (rows.length === 0) {
    return (
      <>{empty ?? <EmptyState title="Nothing to show" description="No records matched." />}</>
    );
  }

  const hideClass = (c: Column<T>) =>
    c.hideBelow === "tablet"
      ? "hidden tablet:table-cell"
      : c.hideBelow === "laptop"
        ? "hidden laptop:table-cell"
        : c.hideBelow === "desktop"
          ? "hidden desktop:table-cell"
          : undefined;

  return (
    <TableWrap className={className}>
      <Table>
        <TableCaption>{caption}</TableCaption>
        <THead>
          <TR>
            {columns.map((c) => (
              <TH
                key={c.key}
                numeric={c.numeric}
                sticky={c.sticky}
                className={hideClass(c)}
                aria-sort={
                  sort?.key === c.key
                    ? sort.dir === "asc"
                      ? "ascending"
                      : "descending"
                    : c.sortable
                      ? "none"
                      : undefined
                }
              >
                {c.sortable && onSortChange ? (
                  <button
                    type="button"
                    onClick={() => onSortChange(c.key)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-xs transition-colors duration-150 hover:text-ink",
                      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
                      c.numeric && "flex-row-reverse",
                    )}
                  >
                    {c.header}
                    <SortIcon active={sort?.key === c.key} dir={sort?.dir} />
                  </button>
                ) : (
                  c.header
                )}
              </TH>
            ))}
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => (
            <TR
              key={rowKey(row)}
              interactive={!!onRowClick}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((c) => (
                <TD
                  key={c.key}
                  numeric={c.numeric}
                  mono={c.mono}
                  sticky={c.sticky}
                  className={hideClass(c)}
                >
                  {c.cell(row)}
                </TD>
              ))}
            </TR>
          ))}
        </TBody>
      </Table>
    </TableWrap>
  );
}

function SortIcon({ active, dir }: { active?: boolean; dir?: "asc" | "desc" }) {
  if (!active) return <ChevronsUpDown className="size-3 opacity-40" aria-hidden="true" />;
  return dir === "asc" ? (
    <ChevronUp className="size-3 text-accent" aria-hidden="true" />
  ) : (
    <ChevronDown className="size-3 text-accent" aria-hidden="true" />
  );
}

/**
 * Pagination.
 *
 * Reads "showing X–Y of Z" rather than page numbers, because the protocol's paged
 * accessors are offset-based and a user needs to know when a list is truncated. A list
 * that quietly stops is the same class of lie as a stale status.
 */
export function Pagination({
  offset,
  limit,
  total,
  onChange,
  className,
}: {
  offset: number;
  limit: number;
  total: number;
  onChange: (offset: number) => void;
  className?: string;
}) {
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);

  return (
    <nav
      className={cn("flex items-center justify-between gap-3 py-2", className)}
      aria-label="Pagination"
    >
      <p className="font-mono text-2xs text-ink-3">
        showing {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="secondary"
          disabled={offset === 0}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          <ChevronLeft className="size-3.5" />
          Previous
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={to >= total}
          onClick={() => onChange(offset + limit)}
        >
          Next
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </nav>
  );
}
