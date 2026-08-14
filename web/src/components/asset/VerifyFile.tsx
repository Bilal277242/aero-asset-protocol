"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Hex } from "viem";
import { commitment, normaliseSalt, type CommitmentEncoding } from "@/lib/format/salt";
import type { HashRequest, HashResponse } from "@/workers/hashProtocol";

type DocumentRef = { id: string; hash: Hex };
type Commitment = { label: string; hash: Hex };

type FileResult =
  | { state: "hashing"; name: string }
  | { state: "done"; name: string; size: number; hash: Hex; match: DocumentRef | null }
  | { state: "error"; name: string; error: string };

/**
 * Local verification.
 *
 * Two different questions, deliberately kept apart because they prove different things:
 *
 * - **Does this file match a registered document?** Hash the bytes, compare. A match
 *   proves the file is byte-identical to what was committed. It proves nothing about
 *   whether the document is genuine, current, or issued by anyone in particular.
 * - **Does this value match a commitment?** Serial numbers and registration marks are
 *   stored as hashes. `security-model.md` §7 is blunt that an *unsalted* commitment to a
 *   tail number is brute-forceable in seconds, so the salt field is not optional
 *   decoration — it is the whole protection, and the UI says so.
 */
export function VerifyFile({
  documentHashes,
  commitments,
}: {
  documentHashes: DocumentRef[];
  commitments: Commitment[];
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        Verify against this asset
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <FilePanel documentHashes={documentHashes} />
        <CommitmentPanel commitments={commitments} />
      </div>
    </section>
  );
}

function FilePanel({ documentHashes }: { documentHashes: DocumentRef[] }) {
  const workerRef = useRef<Worker | null>(null);
  const nextId = useRef(0);
  const [result, setResult] = useState<FileResult | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const worker = new Worker(new URL("../../workers/hash.worker.ts", import.meta.url));
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<HashResponse>) => {
      const msg = event.data;
      if (!msg.ok) {
        setResult({ state: "error", name: "", error: msg.error });
        return;
      }
      const match = documentHashes.find(
        (d) => d.hash.toLowerCase() === msg.hash.toLowerCase(),
      );
      setResult({
        state: "done",
        name: msg.name,
        size: msg.size,
        hash: msg.hash,
        match: match ?? null,
      });
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [documentHashes]);

  const hash = useCallback((file: File) => {
    const worker = workerRef.current;
    if (!worker) return;
    setResult({ state: "hashing", name: file.name });
    const request: HashRequest = { id: nextId.current++, file };
    worker.postMessage(request);
  }, []);

  return (
    <div className="rounded border border-[var(--border)] p-4">
      <h3 className="text-sm font-medium">A document file</h3>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) hash(file);
        }}
        className={`mt-3 flex cursor-pointer items-center justify-center rounded border border-dashed px-4 py-8 text-center text-xs ${
          dragging
            ? "border-[var(--ok)] text-[var(--ok)]"
            : "border-[var(--border)] text-[var(--muted)]"
        }`}
      >
        <input
          type="file"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) hash(file);
            e.target.value = "";
          }}
        />
        Drop a file here, or click to choose one.
      </label>

      <p className="mt-2 text-xs text-[var(--muted)]">
        Hashed in a Web Worker on this machine. The file is never uploaded, and the app&apos;s
        Content-Security-Policy permits network connections only to the RPC endpoint.
      </p>

      {result && (
        <div className="mt-3 font-mono text-xs">
          {result.state === "hashing" && <p>Hashing {result.name}…</p>}

          {result.state === "error" && <p className="text-[var(--bad)]">{result.error}</p>}

          {result.state === "done" && (
            <>
              <p className="break-all">
                <span className="text-[var(--muted)]">keccak256 </span>
                {result.hash}
              </p>
              <p className="mt-1 text-[var(--muted)]">
                {result.name} · {formatBytes(result.size)}
              </p>
              {result.match ? (
                <p className="mt-2 text-[var(--ok)]">
                  Matches document #{result.match.id} on this asset.
                </p>
              ) : (
                <p className="mt-2 text-[var(--warn)]">
                  No document on this asset commits to these bytes.
                </p>
              )}
            </>
          )}
        </div>
      )}

      <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
        A match proves one thing precisely: this file is byte-identical to what was
        registered. It does not establish that the document is authentic, current, or
        issued by the organisation named on it — and a single re-saved PDF changes every
        byte, so a mismatch is not evidence of forgery either.
      </p>
    </div>
  );
}

function CommitmentPanel({ commitments }: { commitments: Commitment[] }) {
  const [value, setValue] = useState("");
  const [salt, setSalt] = useState("");
  const [encoding, setEncoding] = useState<CommitmentEncoding>("bytes32");

  let computed: Hex | null = null;
  let error: string | null = null;

  if (value.length > 0) {
    try {
      computed = commitment(value, normaliseSalt(salt), encoding);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  const lower = computed?.toLowerCase();
  const match = lower ? commitments.find((c) => c.hash.toLowerCase() === lower) : undefined;

  return (
    <div className="rounded border border-[var(--border)] p-4">
      <h3 className="text-sm font-medium">A serial number or registration mark</h3>

      <div className="mt-3 grid gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="MSN-7421"
          spellCheck={false}
          className="rounded border border-[var(--border)] bg-transparent px-2 py-1.5 font-mono text-xs"
        />
        <input
          value={salt}
          onChange={(e) => setSalt(e.target.value)}
          placeholder="salt — 0x… or a number"
          spellCheck={false}
          className="rounded border border-[var(--border)] bg-transparent px-2 py-1.5 font-mono text-xs"
        />
        <div className="flex gap-3 text-xs text-[var(--muted)]">
          {(["bytes32", "string"] as const).map((e) => (
            <label key={e} className="flex cursor-pointer items-center gap-1">
              <input
                type="radio"
                name="encoding"
                checked={encoding === e}
                onChange={() => setEncoding(e)}
              />
              <code className="font-mono">{e}</code>
            </label>
          ))}
          <span>— how the caller typed the value in Solidity</span>
        </div>
      </div>

      <div className="mt-3 font-mono text-xs">
        {error && <p className="text-[var(--bad)]">{error}</p>}
        {computed && (
          <>
            <p className="break-all">
              <span className="text-[var(--muted)]">keccak256(abi.encode(value, salt)) </span>
              {computed}
            </p>
            {match ? (
              <p className="mt-2 text-[var(--ok)]">Matches this asset&apos;s {match.label}.</p>
            ) : (
              <p className="mt-2 text-[var(--warn)]">
                No commitment on this asset matches. Wrong value, wrong salt, or a
                different encoding.
              </p>
            )}
          </>
        )}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
        <strong className="text-[var(--warn)]">The salt is the protection, not the hash.</strong>{" "}
        Tail numbers and serials are short and publicly enumerable — an unsalted commitment
        is recoverable in seconds by anyone reading the chain. Leaving this field empty
        computes against a zero salt, which is exactly that unprotected case.
      </p>
    </div>
  );
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} bytes`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KiB`;
  return `${(size / 1024 / 1024).toFixed(1)} MiB`;
}
