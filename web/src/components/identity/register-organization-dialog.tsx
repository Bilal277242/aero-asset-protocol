"use client";

import * as React from "react";
import { keccak256, encodeAbiParameters, stringToHex } from "viem";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { TransactionDialog } from "@/components/web3/transaction-dialog";
import { useContractWrite } from "@/hooks/useContractWrite";
import { useAddressBook } from "@/hooks/useContractRead";
import { orgWrites } from "@/lib/api/identity-writes";
import { organizationTypeLabel } from "@/lib/contracts/generated/enums";

/**
 * Register an organization.
 *
 * Permissionless — the contract requires no role. What it does require is a **non-zero,
 * unique** name commitment, and a type other than `UNSPECIFIED`.
 *
 * The legal name is committed as a salted hash rather than stored in the clear. Company
 * names are short and publicly enumerable, so an unsalted commitment is recoverable by
 * anyone reading the chain — the salt is the protection, exactly as with serial numbers.
 * The salt is not stored anywhere; whoever registers must keep it to prove the name later.
 */
export function RegisterOrganizationDialog({
  open,
  onOpenChange,
  onRegistered,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onRegistered?: () => void;
}) {
  const book = useAddressBook();
  const tx = useContractWrite();

  const [name, setName] = React.useState("");
  const [salt, setSalt] = React.useState("");
  const [orgType, setOrgType] = React.useState("1");
  const [uri, setUri] = React.useState("");

  const { reset } = tx;
  React.useEffect(() => {
    if (!open) {
      reset();
      setName("");
      setSalt("");
      setOrgType("1");
      setUri("");
    }
  }, [open, reset]);

  const saltHex = normaliseSalt(salt);
  const nameHash =
    name.trim().length > 0 && saltHex
      ? keccak256(
          encodeAbiParameters(
            [{ type: "string" }, { type: "bytes32" }],
            [name.trim(), saltHex],
          ),
        )
      : null;

  // The profile commitment covers whatever the URI points at. Left as the zero-salted
  // hash of the URI when no separate document is supplied.
  const metadataHash =
    uri.trim().length > 0 ? keccak256(stringToHex(uri.trim())) : nameHash;

  const ready =
    !!book.data && !!nameHash && !!metadataHash && Number(orgType) > 0 && saltHex !== null;

  const submit = () => {
    if (!ready || !book.data || !nameHash || !metadataHash) return;
    void tx
      .execute(
        orgWrites.register(book.data.addresses, {
          orgType: Number(orgType),
          nameHash,
          metadataHash,
          uri: uri.trim(),
        }),
      )
      .then((hash) => {
        if (hash) onRegistered?.();
      });
  };

  return (
    <TransactionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Register an organization"
      description="Open to anyone. The record lands in Pending and can perform no protocol action until an authorised role verifies it."
      tx={tx}
      onConfirm={submit}
      confirmLabel="Register"
      summary={
        nameHash ? (
          <>
            <p>
              Registers a {organizationTypeLabel[Number(orgType)]?.toLowerCase()} with you as
              its admin.
            </p>
            <p className="break-all font-mono text-2xs">name commitment {nameHash}</p>
            <p>
              The name itself is never written to the chain. Keep the salt — without it
              nobody, including you, can prove which name this commits to.
            </p>
          </>
        ) : undefined
      }
    >
      <div className="grid gap-3">
        <Field
          label="Organization type"
          htmlFor="ro-type"
          hint="Determines what the organization may do. An MRO is required to record maintenance."
          required
        >
          <Select id="ro-type" value={orgType} onChange={(e) => setOrgType(e.target.value)}>
            {Object.entries(organizationTypeLabel)
              .filter(([k]) => k !== "0")
              .map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
          </Select>
        </Field>

        <Field
          label="Legal name"
          htmlFor="ro-name"
          hint="Hashed with the salt below. The plaintext never reaches the chain."
          required
        >
          <Input
            id="ro-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Meridian Air Transport"
          />
        </Field>

        <Field
          label="Salt"
          htmlFor="ro-salt"
          hint="A value only you know. Store it safely — it is required to prove the name later."
          error={salt !== "" && saltHex === null ? "0x-prefixed hex, or a decimal number." : undefined}
          required
        >
          <Input
            id="ro-salt"
            mono
            value={salt}
            onChange={(e) => setSalt(e.target.value)}
            placeholder="0x… or a number"
            invalid={salt !== "" && saltHex === null}
          />
        </Field>

        <Field
          label="Profile location"
          htmlFor="ro-uri"
          hint="Where the organization's profile lives. Stored as text and never fetched by this application."
        >
          <Input
            id="ro-uri"
            mono
            value={uri}
            onChange={(e) => setUri(e.target.value)}
            placeholder="ipfs://…"
          />
        </Field>

        <p className="rounded-xs border border-blocked/40 bg-blocked-bg px-2.5 py-2 text-2xs leading-relaxed text-ink-2">
          <strong className="font-medium text-ink">Names are unique.</strong> If this
          commitment is already registered the transaction reverts with{" "}
          <code className="font-mono">OrganizationNameTaken</code> naming the holder. A
          revoked organization releases its name for re-registration.
        </p>
      </div>
    </TransactionDialog>
  );
}

/** Accepts `0x…` up to 32 bytes, a decimal, or nothing. */
function normaliseSalt(input: string): `0x${string}` | null {
  const t = input.trim();
  if (t.length === 0) return null;

  if (t.startsWith("0x") || t.startsWith("0X")) {
    const body = t.slice(2);
    if (!/^[0-9a-fA-F]+$/.test(body) || body.length > 64) return null;
    return `0x${body.padStart(64, "0").toLowerCase()}` as `0x${string}`;
  }
  if (/^\d+$/.test(t)) {
    const n = BigInt(t);
    if (n >= 1n << 256n) return null;
    return `0x${n.toString(16).padStart(64, "0")}` as `0x${string}`;
  }
  return null;
}
