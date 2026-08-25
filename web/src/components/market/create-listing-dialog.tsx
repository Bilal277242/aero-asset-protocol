"use client";

import * as React from "react";
import { Check, X } from "lucide-react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TransactionDialog } from "@/components/web3/transaction-dialog";
import { useContractWrite } from "@/hooks/useContractWrite";
import { useContractRead, useAddressBook } from "@/hooks/useContractRead";
import { useAccountState } from "@/hooks/useAccountState";
import { marketWrites } from "@/lib/api/writes";
import { readListingPrecheck } from "@/lib/api/precheck";
import { parseAmount } from "@/lib/utils/money";
import { SETTLEMENT_TOKEN } from "@/config/env";
import { cn } from "@/lib/utils/cn";

/**
 * Create a listing.
 *
 * `createListing` enforces nine preconditions on-chain. Rather than let a user discover
 * them one wallet rejection at a time, they are read live and rendered as a checklist
 * before the button is enabled. Users of an aviation registry should not learn about
 * `ComponentIsInstalled` from a MetaMask failure screen.
 */
export function CreateListingDialog({
  open,
  onOpenChange,
  onListed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onListed?: () => void;
}) {
  const account = useAccountState();
  const book = useAddressBook();
  const tx = useContractWrite();

  const [assetId, setAssetId] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [days, setDays] = React.useState("30");

  const parsedAssetId = /^[1-9]\d{0,18}$/.test(assetId.trim()) ? BigInt(assetId.trim()) : null;

  const check = useContractRead(
    ["market", "precheck", assetId, account.address ?? ""],
    ({ client, book: b, blockNumber }) =>
      readListingPrecheck(client, b, parsedAssetId ?? 0n, account.address, blockNumber),
    { enabled: open && parsedAssetId !== null && !!account.address },
  );

  // `reset` comes from a stable useCallback, so it can be a dependency without
  // re-running this on every render.
  const { reset } = tx;
  React.useEffect(() => {
    if (!open) {
      reset();
      setAssetId("");
      setPrice("");
      setDays("30");
    }
  }, [open, reset]);

  const parsedPrice = parseAmount(price, 6);
  const dayCount = Number(days);
  const validDays = Number.isFinite(dayCount) && dayCount >= 1 && dayCount <= 365;

  const ready =
    parsedAssetId !== null &&
    parsedPrice !== null &&
    parsedPrice > 0n &&
    validDays &&
    check.data?.allPass === true;

  const submit = () => {
    if (!ready || !book.data || parsedAssetId === null || parsedPrice === null) return;
    const expiresAt = Math.floor(Date.now() / 1000) + dayCount * 86_400;

    void tx
      .execute(
        marketWrites.createListing(book.data.addresses, {
          assetId: parsedAssetId,
          token: SETTLEMENT_TOKEN,
          price: parsedPrice,
          expiresAt,
        }),
      )
      .then((hash) => {
        if (hash) onListed?.();
      });
  };

  return (
    <TransactionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="List an asset for sale"
      description="Nine preconditions are enforced on-chain. They are checked here first, so a refusal costs nothing."
      tx={tx}
      onConfirm={submit}
      confirmLabel="Create listing"
      summary={
        parsedPrice !== null && parsedAssetId !== null ? (
          <>
            <p>
              Offers asset #{parsedAssetId.toString()} at {price} USDC for {days} days.
            </p>
            <p>
              No asset or money moves now. A buyer must offer, you must accept, and only
              then is an escrow deployed.
            </p>
          </>
        ) : undefined
      }
    >
      <div className="grid gap-3">
        <Field label="Asset id" htmlFor="cl-asset" hint="The asset you own and want to list." required>
          <Input
            id="cl-asset"
            mono
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
            placeholder="1"
            invalid={assetId !== "" && parsedAssetId === null}
          />
        </Field>

        <Field
          label="Price in USDC"
          htmlFor="cl-price"
          hint="Gross asking price. The protocol fee is deducted from this at settlement."
          error={price !== "" && parsedPrice === null ? "Enter a number with at most 6 decimal places." : undefined}
          required
        >
          <Input
            id="cl-price"
            mono
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="1500000.00"
            invalid={price !== "" && parsedPrice === null}
          />
        </Field>

        <Field
          label="Expires in (days)"
          htmlFor="cl-days"
          hint="Capped at 365 days, so a stale listing cannot hold an asset's only slot indefinitely."
          error={!validDays ? "Between 1 and 365." : undefined}
          required
        >
          <Input
            id="cl-days"
            mono
            value={days}
            onChange={(e) => setDays(e.target.value)}
            invalid={!validDays}
          />
        </Field>

        {parsedAssetId !== null && (
          <div className="rounded-sm bg-sunken shadow-inset-sm p-3">
            <p className="label-key mb-2">Protocol preconditions</p>
            {check.isLoading ? (
              <p className="text-xs text-ink-3">Checking…</p>
            ) : check.data ? (
              <ul className="grid gap-1">
                {check.data.checks.map((c) => (
                  <li key={c.label} className="flex items-start gap-1.5 text-xs">
                    {c.pass ? (
                      <Check className="mt-0.5 size-3 shrink-0 text-confirmed" aria-hidden="true" />
                    ) : (
                      <X className="mt-0.5 size-3 shrink-0 text-adverse" aria-hidden="true" />
                    )}
                    <span className={cn(c.pass ? "text-ink-2" : "text-ink")}>
                      {c.label}
                      {!c.pass && c.detail && (
                        <span className="block text-adverse">{c.detail}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-ink-3">Could not check this asset.</p>
            )}
          </div>
        )}
      </div>
    </TransactionDialog>
  );
}
