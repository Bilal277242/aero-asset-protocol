import * as React from "react";
import { AlertTriangle, Inbox, WifiOff, SearchX, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";

/**
 * Empty and error states.
 *
 * The rule for both: **say what happened, then what to do about it.** Never an apology,
 * never a shrug, and never a generic illustration standing in for an explanation.
 *
 * The distinction that matters most here is *nothing exists yet* versus *the filter
 * excluded everything* versus *we could not reach the chain*. Rendering all three as
 * "No data" is how a user concludes the protocol is broken when their filter is simply
 * too narrow.
 */

export function EmptyState({
  title,
  description,
  action,
  variant = "empty",
  className,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** `empty` — nothing exists. `filtered` — a filter excluded everything. */
  variant?: "empty" | "filtered";
  className?: string;
}) {
  const Icon = variant === "filtered" ? SearchX : Inbox;
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded border border-dashed border-rule bg-panel px-6 py-12 text-center",
        className,
      )}
    >
      <Icon className="size-5 text-ink-3" aria-hidden="true" />
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && (
        <p className="max-w-[46ch] text-xs leading-relaxed text-ink-2">{description}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

type ErrorKind = "infrastructure" | "not-found" | "permission" | "protocol";

const ERROR_ICON: Record<ErrorKind, React.ElementType> = {
  infrastructure: WifiOff,
  "not-found": SearchX,
  permission: ShieldAlert,
  protocol: AlertTriangle,
};

/**
 * An error state.
 *
 * `kind` is not cosmetic. Distinguishing an unreachable RPC from a protocol refusal is
 * the difference between "try again in a minute" and "this will never work, here is why" —
 * and a user who cannot tell them apart will retry forever or give up wrongly.
 */
export function ErrorState({
  kind = "protocol",
  title,
  cause,
  remedy,
  detail,
  onRetry,
  className,
}: {
  kind?: ErrorKind;
  title: string;
  /** What went wrong, in the user's terms. */
  cause?: React.ReactNode;
  /** What they can do about it. */
  remedy?: React.ReactNode;
  /** Verbatim technical detail — the decoded error, a hash. Monospace, selectable. */
  detail?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const Icon = ERROR_ICON[kind];
  const tone = kind === "infrastructure" ? "text-blocked" : "text-adverse";
  const border = kind === "infrastructure" ? "border-blocked/40" : "border-adverse/40";

  return (
    <div className={cn("rounded border bg-panel p-4", border, className)} role="alert">
      <div className="flex items-start gap-2.5">
        <Icon className={cn("mt-0.5 size-4 shrink-0", tone)} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">{title}</p>
          {cause && <p className="mt-1 text-xs leading-relaxed text-ink-2">{cause}</p>}
          {remedy && <p className="mt-1.5 text-xs leading-relaxed text-ink">{remedy}</p>}
          {detail && (
            <pre className="mt-2.5 overflow-x-auto rounded-xs border border-rule bg-sunken px-2.5 py-2 font-mono text-2xs text-ink-2">
              {detail}
            </pre>
          )}
          {onRetry && (
            <Button size="sm" variant="secondary" className="mt-3" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * A banner for conditions that persist across a page rather than replacing it.
 *
 * Used for the address-book drift warning, a paused module, and an undelivered payout
 * waiting to be claimed — things the user must know but which do not stop them working.
 */
export function Banner({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: "info" | "warning" | "critical";
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const styles = {
    info: "border-accent/40 bg-accent-subtle",
    warning: "border-blocked/40 bg-blocked-bg",
    critical: "border-adverse/40 bg-adverse-bg",
  }[tone];

  const iconTone = {
    info: "text-accent",
    warning: "text-blocked",
    critical: "text-adverse",
  }[tone];

  return (
    <div className={cn("rounded border px-3 py-2.5", styles, className)} role="status">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", iconTone)} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">{title}</p>
          {children && <div className="mt-0.5 text-xs leading-relaxed text-ink-2">{children}</div>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}
