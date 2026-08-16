"use client";

import * as React from "react";
import { isAddress, keccak256, stringToHex, type Address } from "viem";
import { Check, X } from "lucide-react";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { TransactionDialog } from "@/components/web3/transaction-dialog";
import { useContractWrite } from "@/hooks/useContractWrite";
import { useContractRead, useAddressBook } from "@/hooks/useContractRead";
import { credentialWrites } from "@/lib/api/identity-writes";
import { readOrganization, readCredentialIndex } from "@/lib/api/identity";
import { credentialTypeLabel, CredentialType } from "@/lib/contracts/generated/enums";
import { cn } from "@/lib/utils/cn";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

/**
 * Issue a credential.
 *
 * Requires `CREDENTIAL_ISSUER_ROLE`. The contract enforces five conditions beyond the
 * role, and each is checked here first so a refusal costs nothing:
 *
 * 1. type is not `UNSPECIFIED`
 * 2. the credential hash is non-zero
 * 3. at least one of subject address or subject organization is set
 * 4. any expiry is in the future — `expiresAt == 0` means never expires
 * 5. the subject organization is **verified**, and holds no valid credential of this type
 *
 * Condition 5 is the one that surprises people: a pending or suspended organization
 * cannot receive a credential at all.
 */
export function IssueCredentialDialog({
  open,
  onOpenChange,
  onIssued,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onIssued?: () => void;
}) {
  const book = useAddressBook();
  const tx = useContractWrite();

  const [subjectOrgId, setSubjectOrgId] = React.useState("");
  const [issuerOrgId, setIssuerOrgId] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [credType, setCredType] = React.useState(String(CredentialType.MAINTENANCE_AUTHORITY));
  const [days, setDays] = React.useState("365");
  const [reference, setReference] = React.useState("");

  const { reset } = tx;
  React.useEffect(() => {
    if (!open) {
      reset();
      setSubjectOrgId("");
      setIssuerOrgId("");
      setSubject("");
      setCredType(String(CredentialType.MAINTENANCE_AUTHORITY));
      setDays("365");
      setReference("");
    }
  }, [open, reset]);

  const parsedOrgId = /^[1-9]\d{0,18}$/.test(subjectOrgId.trim())
    ? BigInt(subjectOrgId.trim())
    : null;

  const check = useContractRead(
    ["credentials", "precheck", subjectOrgId, credType],
    async ({ client, book: b, blockNumber }) => {
      if (parsedOrgId === null) return null;
      const block = await client.getBlock({ blockNumber });
      const [org, all] = await Promise.all([
        readOrganization(client, b, parsedOrgId, blockNumber),
        readCredentialIndex(client, b, blockNumber, block.timestamp, 100),
      ]);
      const duplicate = all.items.find(
        (c) => c.subjectOrgId === parsedOrgId && c.credType === Number(credType) && c.isValid,
      );
      return { org, duplicate: duplicate ?? null };
    },
    { enabled: open && parsedOrgId !== null },
  );

  const dayCount = Number(days);
  const neverExpires = days.trim() === "0";
  const validDays = neverExpires || (Number.isFinite(dayCount) && dayCount >= 1 && dayCount <= 3650);
  const subjectValid = subject.trim() === "" || isAddress(subject.trim());
  const hasSubject = parsedOrgId !== null || (subject.trim() !== "" && subjectValid);
  const credentialHash =
    reference.trim().length > 0 ? keccak256(stringToHex(reference.trim())) : null;

  const orgVerified = check.data?.org?.isVerified ?? null;
  const duplicate = check.data?.duplicate ?? null;

  const checks = parsedOrgId !== null
    ? [
        { label: "Organization exists", pass: !!check.data?.org },
        {
          label: "Organization is verified",
          pass: orgVerified === true,
          detail:
            orgVerified === false
              ? "A credential can only be issued to a verified organization."
              : undefined,
        },
        {
          label: "No valid credential of this type",
          pass: duplicate === null,
          detail: duplicate
            ? `Credential #${duplicate.credentialId} is already valid. Revoke it first, or let it lapse.`
            : undefined,
        },
      ]
    : [];

  const ready =
    !!book.data &&
    hasSubject &&
    validDays &&
    subjectValid &&
    credentialHash !== null &&
    Number(credType) > 0 &&
    (parsedOrgId === null || checks.every((c) => c.pass));

  const submit = () => {
    if (!ready || !book.data || credentialHash === null) return;
    const expiresAt = neverExpires
      ? 0
      : Math.floor(Date.now() / 1000) + dayCount * 86_400;

    void tx
      .execute(
        credentialWrites.issue(book.data.addresses, {
          issuerOrgId: /^[1-9]\d{0,18}$/.test(issuerOrgId.trim())
            ? BigInt(issuerOrgId.trim())
            : 0n,
          subject: subjectValid && subject.trim() !== "" ? (subject.trim() as Address) : ZERO_ADDRESS,
          subjectOrgId: parsedOrgId ?? 0n,
          credType: Number(credType),
          expiresAt,
          credentialHash,
        }),
      )
      .then((hash) => {
        if (hash) onIssued?.();
      });
  };

  return (
    <TransactionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Issue a credential"
      description="Requires CREDENTIAL_ISSUER_ROLE. The subject organization must already be verified."
      tx={tx}
      onConfirm={submit}
      confirmLabel="Issue credential"
      summary={
        ready ? (
          <>
            <p>
              Issues a {credentialTypeLabel[Number(credType)]?.toLowerCase()} to{" "}
              {parsedOrgId !== null ? `organization #${parsedOrgId}` : subject.trim()}.
            </p>
            <p>{neverExpires ? "It never expires." : `It expires in ${days} days.`}</p>
            <p>
              This is an attestation with your role attached, not an approval issued by any
              civil aviation authority.
            </p>
          </>
        ) : undefined
      }
    >
      <div className="grid gap-3">
        <Field label="Credential type" htmlFor="ic-type" required>
          <Select id="ic-type" value={credType} onChange={(e) => setCredType(e.target.value)}>
            {Object.entries(credentialTypeLabel)
              .filter(([k]) => k !== "0")
              .map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
          </Select>
        </Field>

        <Field
          label="Subject organization id"
          htmlFor="ic-org"
          hint="Leave empty to issue to an address only. At least one subject is required."
        >
          <Input
            id="ic-org"
            mono
            value={subjectOrgId}
            onChange={(e) => setSubjectOrgId(e.target.value)}
            placeholder="1"
          />
        </Field>

        <Field
          label="Subject address"
          htmlFor="ic-subject"
          hint="Optional when an organization is given."
          error={!subjectValid ? "Not a valid address." : undefined}
        >
          <Input
            id="ic-subject"
            mono
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="0x…"
            invalid={!subjectValid}
          />
        </Field>

        <Field
          label="Issuing organization id"
          htmlFor="ic-issuer"
          hint="Recorded for provenance. Leave empty for protocol-issued."
        >
          <Input
            id="ic-issuer"
            mono
            value={issuerOrgId}
            onChange={(e) => setIssuerOrgId(e.target.value)}
            placeholder="0"
          />
        </Field>

        <Field
          label="Valid for (days)"
          htmlFor="ic-days"
          hint="Enter 0 for a credential that never expires."
          error={!validDays ? "0, or between 1 and 3650." : undefined}
          required
        >
          <Input id="ic-days" mono value={days} onChange={(e) => setDays(e.target.value)} invalid={!validDays} />
        </Field>

        <Field
          label="Credential reference"
          htmlFor="ic-ref"
          hint="Hashed to a commitment. The reference itself never reaches the chain."
          required
        >
          <Input
            id="ic-ref"
            mono
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="EASA Part-145 approval no. …"
          />
        </Field>

        {parsedOrgId !== null && (
          <div className="rounded border border-rule bg-sunken p-3">
            <p className="label-key mb-2">Protocol preconditions</p>
            {check.isLoading ? (
              <p className="text-xs text-ink-3">Checking…</p>
            ) : (
              <ul className="grid gap-1">
                {checks.map((c) => (
                  <li key={c.label} className="flex items-start gap-1.5 text-xs">
                    {c.pass ? (
                      <Check className="mt-0.5 size-3 shrink-0 text-confirmed" aria-hidden="true" />
                    ) : (
                      <X className="mt-0.5 size-3 shrink-0 text-adverse" aria-hidden="true" />
                    )}
                    <span className={cn(c.pass ? "text-ink-2" : "text-ink")}>
                      {c.label}
                      {!c.pass && c.detail && <span className="block text-adverse">{c.detail}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </TransactionDialog>
  );
}
