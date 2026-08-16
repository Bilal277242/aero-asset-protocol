"use client";

import * as React from "react";
import { isAddress, type Address } from "viem";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { TransactionDialog } from "@/components/web3/transaction-dialog";
import { useContractWrite } from "@/hooks/useContractWrite";
import { useAddressBook } from "@/hooks/useContractRead";
import { orgWrites } from "@/lib/api/identity-writes";

/**
 * Grant or remove an operator.
 *
 * Operators may act *for* the organization — registering assets, recording documents —
 * but they cannot manage admins or other operators. That separation is enforced on-chain:
 * `setOperator` carries `onlyOrganizationAdmin`.
 *
 * There is no on-chain list of operators; `isOperator` answers one address at a time. The
 * full set is only recoverable by replaying `OrganizationOperatorSet` events, so this
 * dialog grants and removes one address rather than pretending to show a roster.
 */
export function OperatorsDialog({
  open,
  onOpenChange,
  orgId,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: bigint;
  onChanged?: () => void;
}) {
  const book = useAddressBook();
  const tx = useContractWrite();
  const [operator, setOperator] = React.useState("");
  const [allowed, setAllowed] = React.useState("true");

  const { reset } = tx;
  React.useEffect(() => {
    if (!open) {
      reset();
      setOperator("");
      setAllowed("true");
    }
  }, [open, reset]);

  const valid = isAddress(operator.trim());
  const grant = allowed === "true";

  const submit = () => {
    if (!book.data || !valid) return;
    void tx
      .execute(
        orgWrites.setOperator(book.data.addresses, {
          orgId,
          operator: operator.trim() as Address,
          allowed: grant,
        }),
      )
      .then((hash) => {
        if (hash) onChanged?.();
      });
  };

  return (
    <TransactionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Manage operators"
      description="Operators act for the organization but cannot manage admins or other operators."
      tx={tx}
      onConfirm={submit}
      confirmLabel={grant ? "Grant operator" : "Remove operator"}
      summary={
        valid ? (
          <>
            <p>
              {grant ? "Grants" : "Removes"} operator rights for{" "}
              <span className="font-mono">{operator.trim()}</span>.
            </p>
            <p>
              {grant
                ? "They will be able to register assets and record documents on this organization's behalf — but only while it is verified."
                : "They will immediately lose the ability to act for this organization."}
            </p>
          </>
        ) : undefined
      }
    >
      <div className="grid gap-3">
        <Field
          label="Operator address"
          htmlFor="op-address"
          error={operator !== "" && !valid ? "Not a valid address." : undefined}
          required
        >
          <Input
            id="op-address"
            mono
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            placeholder="0x…"
            invalid={operator !== "" && !valid}
          />
        </Field>

        <Field label="Action" htmlFor="op-allowed">
          <Select id="op-allowed" value={allowed} onChange={(e) => setAllowed(e.target.value)}>
            <option value="true">Grant operator rights</option>
            <option value="false">Remove operator rights</option>
          </Select>
        </Field>

        <p className="rounded-xs border border-rule bg-sunken px-2.5 py-2 text-2xs leading-relaxed text-ink-2">
          Operator rights only take effect while the organization is{" "}
          <strong className="font-medium text-ink">verified</strong>.{" "}
          <code className="font-mono">isActingFor</code> returns false for any other status,
          so suspension silently disables every operator until the organization is restored.
        </p>
      </div>
    </TransactionDialog>
  );
}
