"use client";

import * as React from "react";
import { encodeFunctionData, type Abi } from "viem";
import { AlertTriangle, Clock, Lock, ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { TransactionDialog } from "@/components/web3/transaction-dialog";
import { useContractWrite } from "@/hooks/useContractWrite";
import { useAddressBook } from "@/hooks/useContractRead";
import { useAccountState } from "@/hooks/useAccountState";
import { useNetworkGuard } from "@/hooks/useNetworkGuard";
import type { PrivilegedAction } from "@/lib/api/admin-catalog";
import type { WriteRequest } from "@/lib/api/writes";
import type { AddressBook } from "@/lib/contracts/addressBook";
import { cn } from "@/lib/utils/cn";

/**
 * A privileged action, gated the way the brief requires and in that order.
 *
 * 1. **Wallet** — `useAccountState`. No connection, no action.
 * 2. **Chain** — `useNetworkGuard`. A wallet on the wrong chain cannot reach this protocol.
 * 3. **Role** — read from `RoleManager` for the connected address. Not a claim, a read.
 * 4. **Confirmation** — a summary of exactly what will happen, plus a typed phrase for
 *    anything irreversible.
 * 5. **Signature** — `useContractWrite` simulates first, so a doomed transaction is
 *    refused before the wallet opens.
 * 6. **Tracking** — the nine-phase lifecycle, hash and explorer link throughout.
 * 7. **Result** — success or the decoded protocol error. Failures are never swallowed.
 *
 * **None of this is a security boundary.** Every gate here exists to avoid offering a
 * button that will revert; `RoleManager` and the contracts decide, and they re-check on
 * every call. A wallet that passes all four checks and still lacks the role gets
 * `MissingRole` from the chain — which is the system working, not the interface failing.
 *
 * A connected wallet is never assumed to be an administrator. `holdsRole` starts false
 * and stays false until the chain says otherwise; while the read is in flight, nothing is
 * offered.
 */
export function AdminAction({
  action,
  holdsRole,
  roleLoading,
  build,
  children,
  onDone,
  disabledReason,
}: {
  action: PrivilegedAction;
  /** From `RoleManager`, for the connected address. Never inferred. */
  holdsRole: boolean;
  roleLoading: boolean;
  /** Builds the call. Omitted for actions this console lists but does not offer. */
  build?: (book: AddressBook) => WriteRequest;
  /** Inputs the action needs, rendered inside the confirmation dialog. */
  children?: React.ReactNode;
  onDone?: () => void;
  /** Set when inputs are incomplete or a precondition already fails. */
  disabledReason?: string;
}) {
  const book = useAddressBook();
  const account = useAccountState();
  const network = useNetworkGuard();
  const tx = useContractWrite();
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");

  const { reset } = tx;
  React.useEffect(() => {
    if (!open) {
      reset();
      setTyped("");
    }
  }, [open, reset]);

  const request = React.useMemo(() => {
    if (!build || !book.data) return null;
    try {
      return build(book.data.addresses);
    } catch {
      // A module key the address registry has never set. Surfaced as an unavailable
      // action rather than a crash.
      return null;
    }
  }, [build, book.data]);

  // ── Gates, in order ─────────────────────────────────────────────────
  const gates: { ok: boolean; reason: string }[] = [
    { ok: account.isConnected, reason: "Connect a wallet to act." },
    { ok: !network.isWrongNetwork, reason: `Switch to ${network.expectedChainName}.` },
    { ok: !roleLoading, reason: "Checking your roles on-chain…" },
    { ok: holdsRole, reason: `Your account does not hold ${action.role}_ROLE.` },
    { ok: request !== null, reason: "This action is not available from this console." },
    { ok: !disabledReason, reason: disabledReason ?? "" },
  ];
  const blocked = gates.find((g) => !g.ok);

  const confirmPhrase = action.irreversible ? "CONFIRM" : null;
  const confirmed = confirmPhrase === null || typed.trim().toUpperCase() === confirmPhrase;

  const run = () => {
    if (!request || !confirmed) return;
    void tx.execute(request).then((hash) => {
      if (hash) onDone?.();
    });
  };

  const calldata = React.useMemo(() => {
    if (!request) return null;
    try {
      return encodeFunctionData({
        abi: request.abi as Abi,
        functionName: request.functionName,
        args: request.args,
      });
    } catch {
      return null;
    }
  }, [request]);

  return (
    <div
      className={cn(
        "rounded-sm p-3.5",
        // A dangerous action keeps a coloured edge. The soft treatment is for ordinary
        // surfaces; a control that can revoke an organization should not be the same
        // shape as the card around it.
        action.irreversible
          ? "border border-adverse/45 bg-adverse-bg/30"
          : action.danger
            ? "border border-blocked/45 bg-blocked-bg/30"
            : "bg-panel shadow-raised-sm",
      )}
    >
      {/*
        Stacked below tablet. Side by side, `flex-1 min-w-0` let the description column
        collapse to ~142px on a phone while the role badges inside it are 166–188px wide
        and cannot wrap mid-token, so they overflowed their own container.
      */}
      <div className="flex flex-col gap-3 tablet:flex-row tablet:items-start tablet:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-ink">{action.label}</span>
            {action.irreversible && (
              <Badge variant="outline" className="gap-1 text-adverse">
                <Lock className="size-2.5" aria-hidden="true" />
                Irreversible
              </Badge>
            )}
            {action.danger && !action.irreversible && (
              <Badge variant="outline" className="gap-1 text-blocked">
                <AlertTriangle className="size-2.5" aria-hidden="true" />
                Dangerous
              </Badge>
            )}
            <Badge variant="outline" className="gap-1">
              {holdsRole ? (
                <ShieldCheck className="size-2.5 text-confirmed" aria-hidden="true" />
              ) : (
                <ShieldOff className="size-2.5 text-ink-3" aria-hidden="true" />
              )}
              {action.role}
              {action.role !== "DEFAULT_ADMIN" && "_ROLE"}
            </Badge>
            {action.pauseGated && (
              <Badge variant="outline" className="gap-1">
                <Clock className="size-2.5" aria-hidden="true" />
                Blocked while paused
              </Badge>
            )}
          </div>

          <p className="mt-1 max-w-[80ch] text-xs leading-relaxed text-ink-2">
            {action.description}
          </p>
          <p className="mt-1 font-mono text-3xs text-ink-3">
            {action.contract} · {action.signature}
          </p>

          {action.note && (
            <p className="mt-1.5 max-w-[80ch] text-2xs leading-relaxed text-ink-3">
              {action.note}
            </p>
          )}
        </div>

        {!build ? (
          <p className="shrink-0 text-2xs leading-relaxed text-ink-3 tablet:max-w-[26ch] tablet:text-right">
            {action.contractOnly ? "Held by a contract" : "Listed only — not offered here"}
          </p>
        ) : (
          <div className="shrink-0">
            {blocked ? (
              <p className="text-2xs leading-relaxed text-ink-3 tablet:max-w-[24ch] tablet:text-right">
                {blocked.reason}
              </p>
            ) : (
              <Button
                size="sm"
                variant={action.irreversible ? "danger" : action.danger ? "secondary" : "primary"}
                onClick={() => {
                  tx.reset();
                  setOpen(true);
                }}
              >
                {action.label}
              </Button>
            )}
          </div>
        )}
      </div>

      {!build && !action.contractOnly && !action.note && (
        <p className="mt-1.5 max-w-[80ch] text-2xs leading-relaxed text-ink-3">
          This console does not build this call. It takes a value where a wrong one is
          unrecoverable, and a form field is the wrong place to choose it.
        </p>
      )}

      {build && (
        <TransactionDialog
          open={open}
          onOpenChange={setOpen}
          title={action.label}
          description={
            action.irreversible
              ? "This cannot be undone by any function on the protocol. Read the summary before signing."
              : action.danger
                ? "Read the summary before signing."
                : undefined
          }
          tx={tx}
          onConfirm={run}
          confirmLabel={action.label}
          confirmDisabled={!confirmed}
          summary={
            <>
              <p>{action.description}</p>
              <p className="font-mono text-2xs">
                {action.contract}.{action.signature}
              </p>
              <p>
                Requires <strong className="font-medium text-ink">{action.role}</strong>, which
                the connected account holds. The contract re-checks this — holding it here is
                not the authorization.
              </p>
            </>
          }
        >
          <div className="grid gap-3">
            {children}

            {calldata && (
              <details className="rounded-xs bg-sunken shadow-inset-sm px-2.5 py-2">
                <summary className="cursor-pointer text-2xs text-ink-2">
                  Calldata for this call
                </summary>
                <p className="mt-1.5 break-all font-mono text-3xs text-ink-3">{calldata}</p>
              </details>
            )}

            {confirmPhrase && (
              <Field
                label={`Type ${confirmPhrase} to enable this action`}
                htmlFor="admin-confirm"
                hint="An irreversible action should not be one click away from a mis-click."
                required
              >
                <Input
                  id="admin-confirm"
                  mono
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={confirmPhrase}
                  invalid={typed.length > 0 && !confirmed}
                />
              </Field>
            )}
          </div>
        </TransactionDialog>
      )}
    </div>
  );
}
