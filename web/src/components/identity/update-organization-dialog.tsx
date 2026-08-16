"use client";

import * as React from "react";
import { keccak256, stringToHex } from "viem";
import { AlertTriangle } from "lucide-react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TransactionDialog } from "@/components/web3/transaction-dialog";
import { useContractWrite } from "@/hooks/useContractWrite";
import { useAddressBook } from "@/hooks/useContractRead";
import { orgWrites } from "@/lib/api/identity-writes";
import { OrganizationStatus } from "@/lib/contracts/generated/enums";
import type { OrgView } from "@/lib/api/identity";

/**
 * Update an organization's profile.
 *
 * **This is the most dangerous ordinary action in the protocol**, and the contract gives
 * no warning of its own.
 *
 * `updateOrganization` demotes a `VERIFIED` organization to `SUSPENDED` in the same
 * transaction if the `metadataHash` changes. `ORG_VERIFIER_ROLE` attested to a specific
 * commitment; a verified badge sitting over content the subject swapped afterwards is the
 * classic verify-then-swap, so the contract revokes the badge rather than the content.
 *
 * Changing only the **URI** does not demote — the hash is what was attested, the URI is
 * merely where it lives, so relocating a profile between gateways costs nothing.
 *
 * The dialog therefore separates the two fields explicitly and warns before signing.
 */
export function UpdateOrganizationDialog({
  open,
  onOpenChange,
  org,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  org: OrgView;
  onUpdated?: () => void;
}) {
  const book = useAddressBook();
  const tx = useContractWrite();

  const [uri, setUri] = React.useState(org.metadataURI ?? "");
  const [changeHash, setChangeHash] = React.useState(false);
  const [document, setDocument] = React.useState("");

  const { reset } = tx;
  React.useEffect(() => {
    if (!open) {
      reset();
      setUri(org.metadataURI ?? "");
      setChangeHash(false);
      setDocument("");
    }
  }, [open, reset, org.metadataURI]);

  const newHash = changeHash && document.trim().length > 0
    ? keccak256(stringToHex(document.trim()))
    : org.metadataHash;

  const hashChanges = newHash !== org.metadataHash;
  const willDemote = hashChanges && org.status === OrganizationStatus.VERIFIED;

  const submit = () => {
    if (!book.data) return;
    void tx
      .execute(
        orgWrites.update(book.data.addresses, {
          orgId: org.orgId,
          metadataHash: newHash,
          uri: uri.trim(),
        }),
      )
      .then((hash) => {
        if (hash) onUpdated?.();
      });
  };

  return (
    <TransactionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Update organization #${org.orgId}`}
      description="Changing where the profile lives is free. Changing what was attested costs the verification."
      tx={tx}
      onConfirm={submit}
      confirmLabel={willDemote ? "Update and lose verification" : "Update profile"}
      summary={
        <>
          <p>
            Sets the profile location to <span className="font-mono">{uri.trim() || "(empty)"}</span>.
          </p>
          {hashChanges ? (
            <p className="break-all font-mono text-2xs">new commitment {newHash}</p>
          ) : (
            <p>The profile commitment is unchanged.</p>
          )}
          {willDemote && (
            <p className="text-adverse">
              This organization will be suspended in the same transaction and will be unable
              to act until an ORG_VERIFIER re-verifies it.
            </p>
          )}
        </>
      }
    >
      <div className="grid gap-3">
        <Field
          label="Profile location"
          htmlFor="uo-uri"
          hint="Changing this alone does not affect verification."
        >
          <Input id="uo-uri" mono value={uri} onChange={(e) => setUri(e.target.value)} />
        </Field>

        <label className="flex cursor-pointer items-start gap-2 rounded border border-rule bg-sunken p-3">
          <input
            type="checkbox"
            checked={changeHash}
            onChange={(e) => setChangeHash(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="block text-sm font-medium text-ink">
              Also change the profile commitment
            </span>
            <span className="block text-xs leading-relaxed text-ink-2">
              Only when the profile content itself has changed. This is what was attested to.
            </span>
          </span>
        </label>

        {changeHash && (
          <Field
            label="New profile content"
            htmlFor="uo-doc"
            hint="Hashed to produce the new commitment."
          >
            <Input
              id="uo-doc"
              mono
              value={document}
              onChange={(e) => setDocument(e.target.value)}
              placeholder="Profile document or its canonical text"
            />
          </Field>
        )}

        {willDemote && (
          <div className="flex items-start gap-2 rounded border border-adverse/40 bg-adverse-bg p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-adverse" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-ink">
                This will suspend your organization
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-2">
                A verifier attested to the current commitment. Changing it demotes the
                organization to <strong className="font-medium text-ink">Suspended</strong> in
                the same transaction — you will not be able to register assets, record
                documents or act in any way until an{" "}
                <code className="font-mono">ORG_VERIFIER_ROLE</code> holder re-verifies it.
                There is no way to change the commitment and keep the badge.
              </p>
            </div>
          </div>
        )}
      </div>
    </TransactionDialog>
  );
}
