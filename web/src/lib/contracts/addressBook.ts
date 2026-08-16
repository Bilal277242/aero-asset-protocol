import { keccak256, toHex, type Address, type PublicClient } from "viem";
import { protocolAddressRegistryAbi } from "@/lib/contracts/generated/abis";
import { ADDRESS_BOOK_KEYS, type AddressBookKey } from "@/lib/contracts/generated/addresses";
import { ADDRESS_REGISTRY, ADDRESS_SNAPSHOT } from "@/config/env";

/**
 * Resolves every module address through `ProtocolAddressRegistry`.
 *
 * Exactly one address is configured; the other fourteen are read from the chain. That is
 * faithful to the protocol's own design — modules resolve their peers the same way — and
 * it means a redeploy that forgets to re-run codegen surfaces as a visible banner rather
 * than an app quietly reading a dead contract.
 *
 * **The registry always wins.** The committed snapshot exists so the first paint has
 * something to render, not as an authority.
 */

export type AddressBook = Partial<Record<AddressBookKey, Address>>;

export type ResolvedAddressBook = {
  addresses: AddressBook;
  /** Keys where the snapshot and the chain disagree. Non-empty means stale bindings. */
  drift: { key: AddressBookKey; snapshot?: Address; onChain: Address }[];
  /** Keys the registry has never had set. */
  unset: AddressBookKey[];
};

const ZERO = "0x0000000000000000000000000000000000000000";

/** `keccak256("aeroasset.address.<KEY>")`, matching `ProtocolAddressKeys`. */
export function addressKeyHash(key: AddressBookKey): `0x${string}` {
  return keccak256(toHex(`aeroasset.address.${key}`));
}

/** The committed snapshot, available synchronously so nothing renders empty. */
export function snapshotAddressBook(): AddressBook {
  const out: AddressBook = {};
  for (const key of ADDRESS_BOOK_KEYS) {
    const value = (ADDRESS_SNAPSHOT as Record<string, string | undefined>)[key];
    if (value) out[key] = value as Address;
  }
  return out;
}

export async function resolveAddressBook(client: PublicClient): Promise<ResolvedAddressBook> {
  const snapshot = snapshotAddressBook();

  const results = await client.multicall({
    contracts: ADDRESS_BOOK_KEYS.map((key) => ({
      address: ADDRESS_REGISTRY,
      abi: protocolAddressRegistryAbi,
      // `tryGetAddress` returns zero for an unset key; `getAddress` reverts. A missing
      // key is information, not a failure, so the whole read should not die for one.
      functionName: "tryGetAddress" as const,
      args: [addressKeyHash(key)],
    })),
    allowFailure: true,
  });

  const addresses: AddressBook = { ...snapshot };
  const drift: ResolvedAddressBook["drift"] = [];
  const unset: AddressBookKey[] = [];

  ADDRESS_BOOK_KEYS.forEach((key, i) => {
    const entry = results[i];
    if (!entry || entry.status !== "success") return;

    const onChain = entry.result as Address;
    if (!onChain || onChain === ZERO) {
      unset.push(key);
      return;
    }

    const known = snapshot[key];
    if (known && known.toLowerCase() !== onChain.toLowerCase()) {
      drift.push({ key, snapshot: known, onChain });
    }
    addresses[key] = onChain;
  });

  return { addresses, drift, unset };
}

/**
 * Reads one address, throwing a message that says what to do.
 *
 * `book.MARKETPLACE!` would be shorter and would fail as `undefined is not an address`
 * three frames away from the cause.
 */
export function requireAddress(book: AddressBook, key: AddressBookKey): Address {
  const value = book[key];
  if (!value) {
    throw new Error(
      `No address for ${key}. The protocol address registry has not set this key on ` +
        `this chain — check the protocol status page.`,
    );
  }
  return value;
}
