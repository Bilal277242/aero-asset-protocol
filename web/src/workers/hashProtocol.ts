/**
 * The message protocol for the document-hashing worker.
 *
 * Kept in its own module so a component can import the *types* without the bundler ever
 * having a reason to pull the worker body into the main chunk.
 */
export type HashRequest = { id: number; file: File };

export type HashResponse =
  | { id: number; ok: true; hash: `0x${string}`; name: string; size: number }
  | { id: number; ok: false; error: string };

/** Above this the tab dies rather than the tool refusing, so the tool refuses. */
export const MAX_HASH_BYTES = 256 * 1024 * 1024;
