"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { TransactionDialog } from "@/components/web3/transaction-dialog";
import { useContractWrite } from "@/hooks/useContractWrite";
import { useAddressBook } from "@/hooks/useContractRead";
import { marketWrites } from "@/lib/api/writes";
import type { Action } from "@/lib/api/actions";

/**
 * A protocol action, with its refusal reason attached.
 *
 * A disabled control always explains itself. "Greyed out with no explanation" is the
 * commonest failure in permissioned interfaces, and this protocol has enough
 * preconditions that a silent disable would leave people genuinely stuck.
 *
 * The tooltip is on a `span` wrapper rather than the button, because a disabled button
 * receives no pointer events and its tooltip would never appear.
 */
/** Marketplace calls that need nothing beyond an id. */
export type SimpleCall =
  | { kind: "cancelListing"; listingId: bigint }
  | { kind: "expireListing"; listingId: bigint }
  | { kind: "acceptOffer"; offerId: bigint }
  | { kind: "rejectOffer"; offerId: bigint }
  | { kind: "withdrawOffer"; offerId: bigint }
  | { kind: "expireOffer"; offerId: bigint };

export function ActionButton({
  action,
  contractCall,
  onClick,
  onDone,
  size = "md",
}: {
  action: Action;
  /** A direct Marketplace call. Omit when the action opens its own dialog. */
  contractCall?: SimpleCall;
  onClick?: () => void;
  onDone?: () => void;
  size?: "sm" | "md";
}) {
  const book = useAddressBook();
  const tx = useContractWrite();
  const [open, setOpen] = React.useState(false);

  const run = () => {
    if (!book.data || !contractCall) return;
    const b = book.data.addresses;
    const request =
      contractCall.kind === "cancelListing"
        ? marketWrites.cancelListing(b, contractCall.listingId)
        : contractCall.kind === "expireListing"
          ? marketWrites.expireListing(b, contractCall.listingId)
          : contractCall.kind === "acceptOffer"
            ? marketWrites.acceptOffer(b, contractCall.offerId)
            : contractCall.kind === "rejectOffer"
              ? marketWrites.rejectOffer(b, contractCall.offerId)
              : contractCall.kind === "withdrawOffer"
                ? marketWrites.withdrawOffer(b, contractCall.offerId)
                : marketWrites.expireOffer(b, contractCall.offerId);

    void tx.execute(request).then((hash) => {
      if (hash) onDone?.();
    });
  };

  const button = (
    <Button
      size={size}
      variant={action.destructive ? "danger" : action.primary ? "primary" : "secondary"}
      disabled={!action.enabled}
      onClick={() => {
        if (contractCall) {
          tx.reset();
          setOpen(true);
        } else {
          onClick?.();
        }
      }}
    >
      {action.label}
    </Button>
  );

  return (
    <>
      {action.enabled || !action.reason ? (
        button
      ) : (
        <Tooltip content={action.reason}>
          {/* A disabled button emits no pointer events, so the tooltip needs a live wrapper. */}
          <span className="inline-flex cursor-help">{button}</span>
        </Tooltip>
      )}

      {contractCall && (
        <TransactionDialog
          open={open}
          onOpenChange={setOpen}
          title={action.label}
          description={
            action.destructive
              ? "This cannot be undone. Read the summary before signing."
              : undefined
          }
          tx={tx}
          onConfirm={run}
          confirmLabel={action.label}
          summary={<p>Calls {contractCall.kind} on the Marketplace contract.</p>}
        />
      )}
    </>
  );
}
