import { keccak256 } from "viem";
import { MAX_HASH_BYTES, type HashRequest, type HashResponse } from "./hashProtocol";

/**
 * Document hashing, off the main thread.
 *
 * `IDocumentRegistry` defines `documentHash` as a "`keccak256` commitment to the document
 * bytes", so verification is exactly that: hash the file the user has in front of them
 * and compare. **The file never leaves the machine** — there is no `fetch` in this worker,
 * and the app's CSP restricts `connect-src` to the RPC endpoint, so a bug here cannot
 * become an upload.
 *
 * The whole file is buffered rather than hashed incrementally: viem exposes `keccak256`
 * only as a one-shot, and taking a direct dependency on `@noble/hashes` to stream a
 * scanned logbook is not worth the dependency surface in v1. `MAX_HASH_BYTES` is the
 * honest consequence.
 *
 * `self` is cast rather than typed via `/// <reference lib="webworker" />`, because this
 * file sits in the same TypeScript program as the DOM code and the two libs collide on
 * `self`.
 */
const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<HashRequest>) => void) | null;
  postMessage: (message: HashResponse) => void;
};

ctx.onmessage = (event) => {
  const { id, file } = event.data;

  void (async () => {
    try {
      if (file.size === 0) {
        throw new Error("The file is empty. An empty file has a hash; no document does.");
      }
      if (file.size > MAX_HASH_BYTES) {
        throw new Error(
          `File is ${(file.size / 1024 / 1024).toFixed(0)} MB and this tool buffers the ` +
            `whole file, stopping at ${MAX_HASH_BYTES / 1024 / 1024} MB. Hash it locally ` +
            `with \`cast keccak\` instead.`,
        );
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      ctx.postMessage({ id, ok: true, hash: keccak256(bytes), name: file.name, size: file.size });
    } catch (err) {
      ctx.postMessage({
        id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();
};
