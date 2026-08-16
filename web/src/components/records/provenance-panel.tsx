"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Card, CardBody, CardHeader, DataRow } from "@/components/ui/card";
import { AddressDisplay, HashDisplay } from "@/components/protocol/chain-value";
import type { Provenance } from "@/lib/api/records";
import { explorerAddress, explorerTx } from "@/config/env";
import { formatDateTime } from "@/lib/utils/time";

/**
 * The transaction that carried a record onto the chain.
 *
 * None of this is in storage. Both registries attribute writes to an *organization*, not
 * an account — that is the point, since letting a caller name an arbitrary issuer is
 * exactly the forgery these registries must not enable. The acting account exists only as
 * the sender of the transaction, so it is recovered from the log and labelled as such
 * rather than presented as a stored field.
 *
 * Degrades rather than fails. A provider that refuses a log range should cost a reader
 * this panel, not the record they came to see.
 */
export function ProvenancePanel({
  provenance,
  what,
  credentialNote,
}: {
  provenance: Provenance | null;
  /** Names the write, e.g. "registration" or "recording". */
  what: string;
  credentialNote?: string;
}) {
  return (
    <Card>
      <CardHeader
        title="Blockchain transaction"
        description={`The ${what} as the chain saw it.`}
      />
      <CardBody>
        {!provenance ? (
          <p className="text-xs leading-relaxed text-ink-2">
            The transaction could not be recovered. This needs a log scan across the whole
            deployment, and public RPC endpoints refuse wide ranges under load. The record
            above is read from storage and is unaffected.
          </p>
        ) : (
          <>
            <dl>
              <DataRow label="Transaction">
                <span className="inline-flex items-center gap-2">
                  <HashDisplay hash={provenance.transactionHash} />
                  <a
                    href={explorerTx(provenance.transactionHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-ink-3 transition-colors hover:text-accent"
                    aria-label="View transaction on block explorer"
                  >
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                </span>
              </DataRow>
              <DataRow label="Block">
                <span className="font-mono text-xs">{provenance.blockNumber.toString()}</span>
              </DataRow>
              {provenance.witnessedAt !== null && (
                <DataRow label="Block time">{formatDateTime(provenance.witnessedAt)}</DataRow>
              )}
              {provenance.submittedBy && (
                <DataRow label="Submitted by">
                  <AddressDisplay
                    address={provenance.submittedBy}
                    explorerUrl={explorerAddress(provenance.submittedBy)}
                  />
                </DataRow>
              )}
              {provenance.credentialId !== null && provenance.credentialId > 0n && (
                <DataRow label="Credential relied upon">
                  <Link
                    href={`/credentials/${provenance.credentialId}`}
                    className="text-accent hover:underline"
                  >
                    Credential #{provenance.credentialId.toString()}
                  </Link>
                </DataRow>
              )}
            </dl>

            <p className="mt-3 text-2xs leading-relaxed text-ink-3">
              The submitting account is the transaction sender, not a stored field. The
              registry attributes the record to an organization; who signed for it is
              recoverable only from the transaction itself.
            </p>

            {credentialNote && (
              <p className="mt-2 text-2xs leading-relaxed text-ink-3">{credentialNote}</p>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
