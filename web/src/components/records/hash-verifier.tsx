"use client";

import * as React from "react";
import { keccak256, type Hex } from "viem";
import { ArrowDown, Check, FileUp, Loader2, X } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/data/states";
import { useContractRead } from "@/hooks/useContractRead";
import { lookupDocumentByHash } from "@/lib/api/records";
import { classifyHash, type HashOutcome } from "@/lib/api/hash-check";
import { cn } from "@/lib/utils/cn";

/**
 * The document verification experience.
 *
 * Document → hash → blockchain record → comparison → result.
 *
 * **What this proves, exactly:** the bytes selected here are identical to the bytes
 * someone committed to when this document was registered. That is an integrity and
 * reference check, and it is the only thing a hash can do.
 *
 * **What it does not prove**, and what the result panel says in as many words: that the
 * document is genuine, that its contents are true, that the party who registered it was
 * entitled to, or that any civil aviation authority has seen it, let alone accepted it. A
 * forged certificate hashes exactly as well as a real one. The chain records *that a
 * commitment was made and by whom*, never that the underlying paper is authentic.
 *
 * Two practical caveats a reader will otherwise learn the hard way:
 *
 * - **A mismatch is not evidence of tampering.** Re-saving a PDF, re-scanning a page, or
 *   exporting from a different tool changes the bytes and therefore the hash, while the
 *   document a human reads is unchanged. Byte-identical is a much stronger condition than
 *   content-identical, and only the former is being tested.
 * - **A hash is a commitment, not encryption.** Anyone holding a candidate document can
 *   confirm a match against the chain — which is what makes this tool work for third
 *   parties, and why a confidential document needs a salted preimage
 *   (`docs/security-model.md` §7).
 *
 * The file is read with `FileReader` in the browser and hashed locally. **It is never
 * uploaded, and this application has no server to upload it to.**
 */

type Stage = "idle" | "hashing" | "done" | "error";

export function HashVerifier({
  assetId,
  documentId,
  expectedHash,
}: {
  assetId: bigint;
  documentId: bigint;
  /** The commitment stored on-chain for this document. */
  expectedHash: Hex;
}) {
  const [stage, setStage] = React.useState<Stage>("idle");
  const [file, setFile] = React.useState<{ name: string; size: number } | null>(null);
  const [computed, setComputed] = React.useState<Hex | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const matches = computed !== null && computed.toLowerCase() === expectedHash.toLowerCase();

  // The chain's own answer, asked independently of the stored field above. If these ever
  // disagreed it would mean the record and the reverse index had diverged, which is worth
  // showing rather than hiding behind a single green tick.
  const onChain = useContractRead(
    ["documents", "byHash", assetId.toString(), computed ?? ""],
    ({ client, book, blockNumber }) =>
      lookupDocumentByHash(client, book, assetId, computed as Hex, blockNumber),
    { enabled: computed !== null },
  );

  // Held back until the registry has answered, so the verdict is never shown on a local
  // comparison alone and then revised a moment later.
  const outcome: HashOutcome | null =
    computed !== null && !onChain.isLoading && onChain.data !== undefined
      ? classifyHash({
          computed,
          expected: expectedHash,
          documentId,
          resolved: onChain.data,
        })
      : null;

  const reset = () => {
    setStage("idle");
    setFile(null);
    setComputed(null);
    setFailure(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const onFile = async (picked: File) => {
    setStage("hashing");
    setFile({ name: picked.name, size: picked.size });
    setComputed(null);
    setFailure(null);

    try {
      const bytes = new Uint8Array(await picked.arrayBuffer());
      setComputed(keccak256(bytes));
      setStage("done");
    } catch {
      setFailure("The file could not be read. Nothing left this device.");
      setStage("error");
    }
  };

  return (
    <Card>
      <CardHeader
        title="Verify a document against this record"
        description="Hashed in your browser. The file is never uploaded."
      />
      <CardBody>
        <ol className="grid gap-0">
          <Step
            index={1}
            label="Document"
            state={file ? "done" : "current"}
            detail={
              file ? (
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-ink">{file.name}</span>
                  <span className="font-mono text-2xs text-ink-3">{bytes(file.size)}</span>
                </span>
              ) : (
                "Select the file you hold. It is read locally and not sent anywhere."
              )
            }
          >
            <input
              ref={inputRef}
              type="file"
              className="sr-only"
              id="verify-file"
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (picked) void onFile(picked);
              }}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={file ? "secondary" : "primary"}
                onClick={() => inputRef.current?.click()}
              >
                <FileUp className="size-3.5" aria-hidden="true" />
                {file ? "Choose a different file" : "Choose a file"}
              </Button>
              {file && (
                <Button type="button" size="sm" variant="ghost" onClick={reset}>
                  Clear
                </Button>
              )}
            </div>
          </Step>

          <Connector />

          <Step
            index={2}
            label="Hash"
            state={computed ? "done" : stage === "hashing" ? "current" : "waiting"}
            detail={
              stage === "hashing" ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                  Hashing locally…
                </span>
              ) : computed ? (
                <span className="break-all font-mono text-2xs text-ink">{computed}</span>
              ) : (
                "keccak256 of the exact bytes of the file."
              )
            }
          />

          <Connector />

          <Step
            index={3}
            label="Blockchain record"
            state="done"
            detail={
              <span className="break-all font-mono text-2xs text-ink">{expectedHash}</span>
            }
            note={`Committed when document #${documentId} was registered against asset #${assetId}.`}
          />

          <Connector />

          <Step
            index={4}
            label="Comparison"
            state={computed ? "done" : "waiting"}
            detail={
              computed ? (
                <span className={matches ? "text-confirmed" : "text-adverse"}>
                  {matches
                    ? "Byte-for-byte identical to the committed hash."
                    : "The hashes differ. These are not the same bytes."}
                </span>
              ) : (
                "Runs once a file is selected."
              )
            }
          />

          <Connector />

          <Step
            index={5}
            label="Result"
            state={computed ? (matches ? "match" : "mismatch") : "waiting"}
            detail={
              computed ? (
                <span
                  className={cn(
                    "font-mono text-sm font-semibold uppercase tracking-tight",
                    matches ? "text-confirmed" : "text-adverse",
                  )}
                >
                  {matches ? "Hash verified" : "Hash not verified"}
                </span>
              ) : (
                "No file checked yet."
              )
            }
          />
        </ol>

        {failure && (
          <Banner tone="critical" title="Could not read the file" className="mt-4">
            {failure}
          </Banner>
        )}

        {outcome && <Outcome outcome={outcome} assetId={assetId} />}

        <p className="mt-4 border-t border-rule-2 pt-3 text-2xs leading-relaxed text-ink-3">
          The hash is a commitment, not encryption. Anyone holding a candidate document can
          confirm a match — which is what makes this check useful to a third party, and why
          a document needing confidentiality against a determined observer must be salted
          before hashing. The protocol stores no document contents, only this commitment and
          an off-chain location.
        </p>
      </CardBody>
    </Card>
  );
}

/**
 * The verdict.
 *
 * Every branch says what was established *and* what was not. The success case is the one
 * that matters: a matching hash proves the bytes are unchanged since registration, and
 * nothing whatsoever about whether the document is genuine. Stating only the first half
 * would be the single most misleading thing this interface could do.
 */
function Outcome({ outcome, assetId }: { outcome: HashOutcome; assetId: bigint }) {
  if (outcome.kind === "verified") {
    return (
      <div className="mt-4 grid gap-2 rounded border border-confirmed/40 bg-confirmed-bg p-3">
        <p className="text-sm font-medium text-ink">
          This file is the one that was committed to.
        </p>
        <p className="max-w-[80ch] text-xs leading-relaxed text-ink-2">
          The bytes you selected hash to the commitment stored on-chain, and the registry
          independently resolves that hash to this document. The file has not changed since
          it was registered, and this record does refer to it rather than to some other
          file.
        </p>
        <p className="max-w-[80ch] text-xs leading-relaxed text-ink-2">
          <strong className="font-medium text-ink">
            That is an integrity and reference check, not a check of authenticity.
          </strong>{" "}
          It does not establish that the document is genuine, that anything written in it is
          true, that the party who registered it was entitled to, or that any civil aviation
          authority has seen or accepted it. A forged certificate hashes exactly as well as
          a real one. What the chain attests is that this commitment was recorded, at a
          known time, by an identified party — nothing about the paper behind it.
        </p>
      </div>
    );
  }

  if (outcome.kind === "inconsistent") {
    return (
      <div className="mt-4 grid gap-2 rounded border border-blocked/40 bg-blocked-bg p-3">
        <p className="text-sm font-medium text-ink">
          The hash matches, but the registry disagrees about which document it belongs to.
        </p>
        <p className="max-w-[80ch] text-xs leading-relaxed text-ink-2">
          Your file hashes to the commitment stored on this record, yet{" "}
          <code className="font-mono text-2xs">documentIdOf</code> resolves that hash to{" "}
          {outcome.resolvedTo === null
            ? "nothing at all"
            : `document #${outcome.resolvedTo.toString()}`}{" "}
          for this asset. The record and the reverse index should never disagree, so this is
          shown rather than smoothed over. Treat the verification as inconclusive and report
          it.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 grid gap-2 rounded border border-adverse/40 bg-adverse-bg p-3">
      <p className="text-sm font-medium text-ink">
        This file is not the one that was committed to.
      </p>
      <p className="max-w-[80ch] text-xs leading-relaxed text-ink-2">
        <strong className="font-medium text-ink">
          A mismatch is not by itself evidence of tampering.
        </strong>{" "}
        The test is byte-for-byte, which is far stricter than what a person reading the
        document would call &ldquo;the same&rdquo;. Re-saving a PDF, re-scanning a page, or
        exporting from different software changes the bytes — and therefore the hash — while
        leaving the document unchanged to a human. A different revision of the same
        paperwork also fails, as it should.
      </p>
      {outcome.kind === "mismatch-known" ? (
        <p className="text-xs leading-relaxed text-ink-2">
          This hash <em>is</em> registered against this asset, as document #
          {outcome.resolvedTo.toString()}. You are likely holding a different document from
          the same asset&rsquo;s record.
        </p>
      ) : (
        <p className="text-xs leading-relaxed text-ink-2">
          This hash is not registered against asset #{assetId.toString()} at all.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────── internals ────

type StepState = "waiting" | "current" | "done" | "match" | "mismatch";

function Step({
  index,
  label,
  state,
  detail,
  note,
  children,
}: {
  index: number;
  label: string;
  state: StepState;
  detail: React.ReactNode;
  note?: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-2xs",
          state === "waiting" && "border-rule text-ink-3",
          state === "current" && "border-accent text-accent",
          state === "done" && "border-rule-2 bg-sunken text-ink-2",
          state === "match" && "border-confirmed bg-confirmed-bg text-confirmed",
          state === "mismatch" && "border-adverse bg-adverse-bg text-adverse",
        )}
        aria-hidden="true"
      >
        {state === "match" ? (
          <Check className="size-3.5" />
        ) : state === "mismatch" ? (
          <X className="size-3.5" />
        ) : (
          index
        )}
      </span>

      <div className="min-w-0 flex-1 pb-1">
        <p className="label-key">{label}</p>
        <div className="mt-0.5 text-xs leading-relaxed text-ink-2">{detail}</div>
        {note && <p className="mt-1 text-2xs leading-relaxed text-ink-3">{note}</p>}
        {children}
      </div>
    </li>
  );
}

const Connector = () => (
  <li aria-hidden="true" className="flex">
    <span className="flex w-6 justify-center py-1">
      <ArrowDown className="size-3.5 text-ink-3" />
    </span>
  </li>
);

function bytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
