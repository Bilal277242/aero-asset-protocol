"use client";

import * as React from "react";
import { isAddress, type Address } from "viem";
import { AlertTriangle } from "lucide-react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TransactionDialog } from "@/components/web3/transaction-dialog";
import { useContractWrite } from "@/hooks/useContractWrite";
import { useAddressBook } from "@/hooks/useContractRead";
import { orgWrites } from "@/lib/api/identity-writes";

/**
 * Propose a new organization admin.
 *
 * The transfer is two-step by design: `transferOrganizationAdmin` only records a
 * `pendingAdmin`, and nothing changes until that account calls `acceptOrganizationAdmin`
 * itself. A typo therefore costs a cancelled proposal rather than the organization —
 * which is why this dialog can afford to accept a raw address at all.
 *
 * Until acceptance the current admin keeps every power they have now, and either side
 * may call `cancelOrganizationAdminTransfer`.
 */
export function TransferAdminDialog({
  open,
  onOpenChange,
  orgId,
  currentAdmin,
  onProposed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: bigint;
  currentAdmin: Address;
  onProposed?: () => void;
}) {
  const book = useAddressBook();
  const tx = useContractWrite();
  const [newAdmin, setNewAdmin] = React.useState("");

  const { reset } = tx;
  React.useEffect(() => {
    if (!open) {
      reset();
      setNewAdmin("");
    }
  }, [open, reset]);

  const trimmed = newAdmin.trim();
  const wellFormed = isAddress(trimmed);
  const isSelf = wellFormed && trimmed.toLowerCase() === currentAdmin.toLowerCase();
  const valid = wellFormed && !isSelf;

  const submit = () => {
    if (!book.data || !valid) return;
    void tx
      .execute(orgWrites.transferAdmin(book.data.addresses, { orgId, newAdmin: trimmed as Address }))
      .then((hash) => {
        if (hash) onProposed?.();
      });
  };

  return (
    <TransactionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Transfer admin of organization #${orgId}`}
      description="Two-step. This proposes the transfer; the new admin must accept before anything changes."
      tx={tx}
      onConfirm={submit}
      confirmLabel="Propose transfer"
      summary={
        valid ? (
          <>
            <p>
              Proposes <span className="font-mono">{trimmed}</span> as the new admin of
              organization #{orgId.toString()}.
            </p>
            <p>
              You remain the admin until that account accepts. Either of you can cancel the
              proposal before then.
            </p>
          </>
        ) : undefined
      }
    >
      <div className="grid gap-3">
        <Field
          label="New admin address"
          htmlFor="ta-address"
          error={
            trimmed !== "" && !wellFormed
              ? "Not a valid address."
              : isSelf
                ? "That is already the admin."
                : undefined
          }
          required
        >
          <Input
            id="ta-address"
            mono
            value={newAdmin}
            onChange={(e) => setNewAdmin(e.target.value)}
            placeholder="0x…"
            invalid={trimmed !== "" && !valid}
          />
        </Field>

        <div className="flex items-start gap-2 rounded-xs border border-rule bg-sunken px-2.5 py-2">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-blocked" aria-hidden="true" />
          <p className="text-2xs leading-relaxed text-ink-2">
            The admin controls operators, the profile, and this transfer itself. An address
            that cannot sign — an exchange deposit, a contract with no such function — would
            simply never accept, so the proposal would sit unaccepted rather than stranding
            the organization.
          </p>
        </div>
      </div>
    </TransactionDialog>
  );
}
