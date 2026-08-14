import type { Address, PublicClient } from "viem";
import {
  ADDRESS_KEYS,
  KEY_TO_ARTIFACT,
  deployments,
  isSupportedChain,
  type AddressBook,
  type SupportedChainId,
} from "@/generated/addresses";
import { protocolAddressRegistryAbi } from "@/generated/abis";

export type AddressBookKey = keyof typeof ADDRESS_KEYS;

export type AddressDrift = {
  key: AddressBookKey;
  /** What the committed snapshot claims. */
  snapshot: Address | null;
  /** What `ProtocolAddressRegistry` actually says. Authoritative. */
  onChain: Address | null;
};

export type ResolvedAddressBook = {
  chainId: SupportedChainId;
  /** Resolved addresses — on-chain values where they exist, snapshot otherwise. */
  addresses: AddressBook;
  /** Keys where the snapshot and the chain disagree. Empty is the healthy case. */
  drift: AddressDrift[];
  /** Keys the registry has never had set. A deployment defect if non-empty. */
  unset: AddressBookKey[];
};

/**
 * The snapshot committed at codegen time.
 *
 * Used to render immediately without waiting on a round trip. It is a cache, and
 * {@link resolveAddressBook} is the source of truth.
 */
export function snapshotAddressBook(chainId: number): AddressBook | null {
  if (!isSupportedChain(chainId)) return null;
  const entry = deployments[chainId];

  const out = {} as AddressBook;
  for (const key of Object.keys(ADDRESS_KEYS) as AddressBookKey[]) {
    const artifactKey = KEY_TO_ARTIFACT[key] as keyof typeof entry.addresses;
    const value = entry.addresses[artifactKey] as Address | undefined;
    if (value) out[key] = value;
  }
  return out;
}

/**
 * Reads every module address from `ProtocolAddressRegistry` in one multicall.
 *
 * This is the authority, per architecture decision D3: modules rotate and the registry
 * is what every contract itself resolves through. When the committed snapshot disagrees,
 * the registry wins and the caller surfaces a drift banner.
 *
 * It also catches a class of mistake that is easy to make and hard to see. The
 * deployment artifact records both proxies and implementations, and calling an
 * implementation reads empty storage and returns plausible zeroes rather than failing.
 * Resolving through the registry can only ever yield proxies.
 *
 * `tryGetAddress` is used rather than `getAddress` because the latter reverts on an
 * unset key, which would fail the whole multicall for one missing module.
 */
export async function resolveAddressBook(
  client: PublicClient,
  chainId: number,
  registry: Address,
): Promise<ResolvedAddressBook> {
  if (!isSupportedChain(chainId)) {
    throw new Error(`unsupported chain ${chainId}`);
  }

  const keys = Object.keys(ADDRESS_KEYS) as AddressBookKey[];

  const results = await client.multicall({
    contracts: keys.map((key) => ({
      address: registry,
      abi: protocolAddressRegistryAbi,
      functionName: "tryGetAddress" as const,
      args: [ADDRESS_KEYS[key]],
    })),
    allowFailure: true,
  });

  const snapshot = snapshotAddressBook(chainId);
  const addresses = {} as AddressBook;
  const drift: AddressDrift[] = [];
  const unset: AddressBookKey[] = [];

  keys.forEach((key, i) => {
    const result = results[i];
    const onChain =
      result?.status === "success" && result.result !== ZERO ? (result.result as Address) : null;
    const fromSnapshot = snapshot?.[key] ?? null;

    if (onChain === null) {
      unset.push(key);
      if (fromSnapshot) addresses[key] = fromSnapshot;
      return;
    }

    // The chain is authoritative.
    addresses[key] = onChain;

    if (fromSnapshot && !sameAddress(fromSnapshot, onChain)) {
      drift.push({ key, snapshot: fromSnapshot, onChain });
    }
  });

  return { chainId, addresses, drift, unset };
}

const ZERO = "0x0000000000000000000000000000000000000000";

function sameAddress(a: Address, b: Address): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
