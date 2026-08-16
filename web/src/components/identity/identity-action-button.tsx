"use client";

import * as React from "react";
import { Clock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { TransactionDialog } from "@/components/web3/transaction-dialog";
import { useContractWrite } from "@/hooks/useContractWrite";
import { useAddressBook } from "@/hooks/useContractRead";
import type { IdentityAction } from "@/lib/api/identity-actions";
import type { WriteRequest } from "@/lib/api/writes";
import type { AddressBook } from "@/lib/contracts/addressBook";

/**
 * A privileged action, with its required role always visible.
 *
 * Two rules the brief sets, both enforced here rather than at call sites:
 *
 * - **The required role is shown wherever the action appears.** A person who does hold
 *   the role should be able to see which one they are exercising, and a person reading
 *   over their shoulder should be able to tell that the control is not open to everyone.
 * - **Admin controls are not rendered to unauthorized viewers.** `action.visible` gates
 *   the render entirely; `action.enabled` only governs whether a visible control can be
 *   pressed. Someone without the role sees nothing rather than a greyed-out mystery.
 *
 * Neither is a security boundary. `RoleManager` decides on-chain and this only avoids
 * offering buttons that would revert.
 */
export function IdentityActionButton({
  action,
  build,
  onConfirmDialog,
  onDone,
  size = "sm",
  summary,
}: {
  action: IdentityAction;
  /** Builds the write. Omit when the action opens its own form dialog. */
  build?: (book: AddressBook) => WriteRequest;
  /** Called instead of executing, for actions that need input first. */
  onConfirmDialog?: () => void;
  onDone?: () => void;
  size?: "sm" | "md";
  summary?: React.ReactNode;
}) {
  const book = useAddressBook();
  const tx = useContractWrite();
  const [open, setOpen] = React.useState(false);

  if (!action.visible) return null;

  const run = () => {
    if (!book.data || !build) return;
    void tx.execute(build(book.data.addresses)).then((hash) => {
      if (hash) onDone?.();
    });
  };

  const button = (
    <Button
      size={size}
      variant={action.destructive ? "danger" : action.primary ? "primary" : "secondary"}
      disabled={!action.enabled}
      onClick={() => {
        if (onConfirmDialog) {
          onConfirmDialog();
        } else {
          tx.reset();
          setOpen(true);
        }
      }}
    >
      {action.label}
    </Button>
  );

  return (
    <div className="inline-flex flex-col gap-1">
      {action.enabled || !action.reason ? (
        button
      ) : (
        <Tooltip content={action.reason}>
          {/* A disabled button emits no pointer events, so the tooltip needs a wrapper. */}
          <span className="inline-flex cursor-help">{button}</span>
        </Tooltip>
      )}

      {(action.roleLabel || action.timelocked) && (
        <span className="inline-flex flex-wrap items-center gap-1">
          {action.roleLabel && (
            <Badge variant="outline" className="gap-1">
              <ShieldCheck className="size-2.5" aria-hidden="true" />
              {action.roleLabel}
            </Badge>
          )}
          {action.timelocked && (
            <Badge variant="outline" className="gap-1 text-blocked">
              <Clock className="size-2.5" aria-hidden="true" />
              48 h timelock
            </Badge>
          )}
        </span>
      )}

      {build && (
        <TransactionDialog
          open={open}
          onOpenChange={setOpen}
          title={action.label}
          description={
            action.timelocked
              ? "This is held by the timelock. A direct call reverts — it must be queued as a governance proposal and executed after the delay."
              : action.destructive
                ? "This cannot be undone. Read the summary before signing."
                : undefined
          }
          tx={tx}
          onConfirm={run}
          confirmLabel={action.label}
          summary={
            summary ?? (
              <>
                {action.roleLabel && (
                  <p>
                    Requires <strong className="font-medium text-ink">{action.roleLabel}</strong>,
                    which the connected account holds.
                  </p>
                )}
                <p>The contract re-checks this. Holding the role here is not the authorization.</p>
              </>
            )
          }
        />
      )}
    </div>
  );
}
