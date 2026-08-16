import type { Address, PublicClient } from "viem";
import {
  assetRegistryAbi,
  credentialRegistryAbi,
  feeManagerAbi,
  marketplaceAbi,
  organizationRegistryAbi,
  roleManagerAbi,
} from "@/lib/contracts/generated/abis";
import { requireAddress, type AddressBook } from "@/lib/contracts/addressBook";
import { value } from "@/hooks/useContractRead";
import { readRoleHolders } from "./roles";
import type { ProtocolRole } from "./role-catalog";
import { PAUSABLE_MODULES, type PausableModule } from "./admin-catalog";
import { abiEvent, blockTimes, scanLogs } from "./logs";
import { DEPLOYED_AT_BLOCK, SETTLEMENT_TOKEN } from "@/config/env";

/**
 * Live protocol state for the admin console.
 *
 * The design point of this module is that **nothing about authorization is assumed**.
 * Which roles exist is compiled in; who holds them, whether a module is paused, and
 * whether an action can be executed at all are read from the chain every time.
 *
 * The consequence worth spelling out: on this deployment `PROTOCOL_ADMIN` and
 * `FEE_MANAGER` are held solely by `ProtocolTimelock`, so *no wallet can execute their
 * actions directly* — a direct call reverts with `MissingRole`. That is derived here from
 * the holder list rather than hardcoded, because a hardcoded flag would keep claiming
 * "timelocked" after a role moved, or keep offering a button after one was locked down.
 */

type Entry = { status: "success"; result: unknown } | { status: "failure" };

export type ModuleState = {
  key: PausableModule;
  address: Address | null;
  /** Null when the read failed — distinct from "running". */
  paused: boolean | null;
};

export type RoleHolders = {
  role: ProtocolRole | "DEFAULT_ADMIN";
  label: string;
  permits: string;
  holders: Address[];
  /** Every holder is a contract, so no wallet can execute this role's actions. */
  contractsOnly: boolean;
  /** The timelock is among the holders. Actions are governance-gated. */
  viaTimelock: boolean;
};

export type FeeConfig = {
  treasury: Address | null;
  saleFeeBps: number | null;
  maxFeeBps: number | null;
  settlementToken: Address;
  settlementTokenAllowed: boolean | null;
  /** `FEE_TYPE_MARKETPLACE`, needed to set the rate. Read, never hardcoded. */
  feeType: `0x${string}` | null;
};

export type AdminState = {
  modules: ModuleState[];
  pausedCount: number;
  roles: RoleHolders[];
  fees: FeeConfig;
  timelock: Address | null;
  counts: {
    organizations: number;
    credentials: number;
    assets: number;
    listings: number;
  };
};

/**
 * Reads everything the console needs, at one pinned height.
 *
 * `allowFailure` throughout: a single unset address-book key must degrade one row, not
 * the whole console. An admin screen that goes blank during an incident is worse than
 * useless.
 */
export async function readAdminState(
  client: PublicClient,
  book: AddressBook,
  blockNumber: bigint,
): Promise<AdminState> {
  const modulesWithAddress = PAUSABLE_MODULES.map((key) => ({
    key,
    address: (book[key] ?? null) as Address | null,
  }));
  const present = modulesWithAddress.filter(
    (m): m is { key: PausableModule; address: Address } => m.address !== null,
  );

  const [pauseResults, configResults, roles] = await Promise.all([
    client.multicall({
      contracts: present.map((m) => ({
        // `paused()` is identical across every module built on ProtocolModuleUpgradeable,
        // so one ABI answers for all nine.
        address: m.address,
        abi: organizationRegistryAbi,
        functionName: "paused" as const,
      })),
      allowFailure: true,
      blockNumber,
    }),
    readConfig(client, book, blockNumber),
    readRoleHolders(client, book, blockNumber).catch(() => []),
  ]);

  const pausedByKey = new Map<string, boolean | null>();
  present.forEach((m, i) => {
    pausedByKey.set(m.key, value<boolean>(pauseResults[i] as Entry));
  });

  const modules: ModuleState[] = modulesWithAddress.map((m) => ({
    key: m.key,
    address: m.address,
    paused: m.address ? (pausedByKey.get(m.key) ?? null) : null,
  }));

  const timelock = (book.PROTOCOL_TIMELOCK ?? null) as Address | null;

  return {
    modules,
    pausedCount: modules.filter((m) => m.paused === true).length,
    roles: roles.map((r) => annotate(r, timelock)),
    fees: configResults.fees,
    timelock,
    counts: configResults.counts,
  };
}

/**
 * Classifies a role by who holds it.
 *
 * `contractsOnly` is decided by bytecode, not by a name list: an address with code cannot
 * sign a transaction, so a role held exclusively by contracts is one no operator will
 * ever exercise from a wallet, whatever it is called.
 */
function annotate(
  r: { role: ProtocolRole | "DEFAULT_ADMIN"; label: string; permits: string; holders: Address[] },
  timelock: Address | null,
): RoleHolders {
  const viaTimelock =
    timelock !== null && r.holders.some((h) => h.toLowerCase() === timelock.toLowerCase());

  return {
    ...r,
    viaTimelock,
    // Filled in by `markContractHolders`; false here so a failed bytecode read never
    // upgrades a role's apparent reachability.
    contractsOnly: false,
  };
}

/**
 * Marks which roles are held only by contracts.
 *
 * Split from the main read because it needs one `getCode` per distinct holder and should
 * not delay the console's first paint. Failures leave `contractsOnly` false, which is the
 * safe direction: the console then shows the action as reachable and the contract refuses
 * it, rather than hiding something an operator could legitimately do.
 */
export async function markContractHolders(
  client: PublicClient,
  roles: RoleHolders[],
  blockNumber: bigint,
): Promise<RoleHolders[]> {
  const unique = [...new Set(roles.flatMap((r) => r.holders.map((h) => h.toLowerCase())))];
  if (unique.length === 0) return roles;

  const codes = await Promise.allSettled(
    unique.map((address) => client.getCode({ address: address as Address, blockNumber })),
  );

  const isContract = new Map<string, boolean>();
  codes.forEach((result, i) => {
    const key = unique[i];
    if (key === undefined) return;
    if (result.status === "fulfilled") {
      isContract.set(key, (result.value?.length ?? 0) > 2);
    }
  });

  return roles.map((r) => ({
    ...r,
    contractsOnly:
      r.holders.length > 0 &&
      r.holders.every((h) => isContract.get(h.toLowerCase()) === true),
  }));
}

/**
 * Privileged events only.
 *
 * A general activity feed answers "what happened"; this answers "what did somebody with a
 * role do". Registrations and listings are excluded — they are permissionless, and
 * burying six role grants under four hundred asset registrations is how an admin console
 * stops being read.
 *
 * `Paused`/`Unpaused` carry no arguments at all, so the module is identified by which
 * address emitted them. Every other event here names its own subject.
 */
export type PrivilegedEvent = {
  id: string;
  title: string;
  detail: string;
  blockNumber: bigint;
  timestamp: number | null;
  txHash: `0x${string}`;
  /** The account that submitted it, when recoverable. */
  by: Address | null;
};

export async function readPrivilegedActivity(
  client: PublicClient,
  book: AddressBook,
  blockNumber: bigint,
  limit = 40,
): Promise<PrivilegedEvent[]> {
  const sources: { address: Address; abi: readonly unknown[]; event: string; describe: (a: Record<string, unknown>) => { title: string; detail: string } }[] = [];

  const push = (
    key: keyof typeof book & string,
    abi: readonly unknown[],
    event: string,
    describe: (a: Record<string, unknown>) => { title: string; detail: string },
  ) => {
    const address = book[key] as Address | undefined;
    if (address) sources.push({ address, abi, event, describe });
  };

  push("ORGANIZATION_REGISTRY", organizationRegistryAbi, "OrganizationStatusChanged", (a) => ({
    title: "Organization status changed",
    detail: `Organization #${a.orgId} → status ${a.newStatus}`,
  }));
  push("CREDENTIAL_REGISTRY", credentialRegistryAbi, "CredentialStatusChanged", (a) => ({
    title: "Credential status changed",
    detail: `Credential #${a.credentialId} → status ${a.newStatus}`,
  }));
  push("ASSET_REGISTRY", assetRegistryAbi, "AssetVerificationChanged", (a) => ({
    title: a.verified ? "Asset verified" : "Asset verification withdrawn",
    detail: `Asset #${a.assetId}`,
  }));

  const roleManager = book.ROLE_MANAGER as Address | undefined;
  if (roleManager) {
    sources.push({
      address: roleManager,
      abi: roleManagerAbi,
      event: "RoleGranted",
      describe: (a) => ({ title: "Role granted", detail: `to ${a.account}` }),
    });
    sources.push({
      address: roleManager,
      abi: roleManagerAbi,
      event: "RoleRevoked",
      describe: (a) => ({ title: "Role revoked", detail: `from ${a.account}` }),
    });
  }

  const scans = await Promise.allSettled(
    sources.map((s) =>
      scanLogs(client, {
        address: s.address,
        event: abiEvent(s.abi, s.event),
        fromBlock: BigInt(DEPLOYED_AT_BLOCK),
        toBlock: blockNumber,
      }),
    ),
  );

  const items: PrivilegedEvent[] = [];
  scans.forEach((result, i) => {
    const source = sources[i];
    if (!source || result.status !== "fulfilled") return;
    for (const log of result.value) {
      const { title, detail } = source.describe(log.args);
      items.push({
        id: `${log.transactionHash}-${log.logIndex}`,
        title,
        detail,
        blockNumber: log.blockNumber,
        timestamp: null,
        txHash: log.transactionHash,
        by: null,
      });
    }
  });

  items.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : b.blockNumber < a.blockNumber ? -1 : 0));
  const top = items.slice(0, limit);

  const times = await blockTimes(client, top.map((i) => i.blockNumber));
  return top.map((i) => ({ ...i, timestamp: times.get(i.blockNumber) ?? null }));
}

async function readConfig(
  client: PublicClient,
  book: AddressBook,
  blockNumber: bigint,
): Promise<{ fees: FeeConfig; counts: AdminState["counts"] }> {
  const feeManager = book.FEE_MANAGER as Address | undefined;
  const marketplace = book.MARKETPLACE as Address | undefined;

  const contracts = [
    ...(feeManager
      ? ([
          { address: feeManager, abi: feeManagerAbi, functionName: "treasury" as const },
          { address: feeManager, abi: feeManagerAbi, functionName: "MAX_FEE_BPS" as const },
          {
            address: feeManager,
            abi: feeManagerAbi,
            functionName: "isTokenAllowed" as const,
            args: [SETTLEMENT_TOKEN],
          },
          // The fee-type key lives on FeeManager, not on the marketplace that charges it.
          { address: feeManager, abi: feeManagerAbi, functionName: "FEE_TYPE_MARKETPLACE" as const },
        ] as const)
      : []),
    ...(marketplace
      ? ([{ address: marketplace, abi: marketplaceAbi, functionName: "listingCount" as const }] as const)
      : []),
    {
      address: requireAddress(book, "ORGANIZATION_REGISTRY"),
      abi: organizationRegistryAbi,
      functionName: "organizationCount" as const,
    },
    {
      address: requireAddress(book, "CREDENTIAL_REGISTRY"),
      abi: credentialRegistryAbi,
      functionName: "credentialCount" as const,
    },
    {
      address: requireAddress(book, "ASSET_REGISTRY"),
      abi: assetRegistryAbi,
      functionName: "assetCount" as const,
    },
  ];

  const results = await client.multicall({
    contracts: contracts as never,
    allowFailure: true,
    blockNumber,
  });

  let i = 0;
  const treasury = feeManager ? value<Address>(results[i++] as Entry) : null;
  const maxFeeBps = feeManager ? value<number>(results[i++] as Entry) : null;
  const tokenAllowed = feeManager ? value<boolean>(results[i++] as Entry) : null;
  const saleFeeType = feeManager ? value<`0x${string}`>(results[i++] as Entry) : null;
  const listings = marketplace ? value<bigint>(results[i++] as Entry) : null;
  const organizations = value<bigint>(results[i++] as Entry);
  const credentials = value<bigint>(results[i++] as Entry);
  const assets = value<bigint>(results[i++] as Entry);

  // The sale fee rate is keyed by a fee-type identifier the marketplace owns, so it takes
  // a second call once that key is known.
  let saleFeeBps: number | null = null;
  if (feeManager && saleFeeType) {
    const [feeResult] = await client.multicall({
      contracts: [
        {
          address: feeManager,
          abi: feeManagerAbi,
          functionName: "feeBps",
          args: [saleFeeType],
        },
      ],
      allowFailure: true,
      blockNumber,
    });
    saleFeeBps = value<number>(feeResult as Entry);
  }

  return {
    fees: {
      treasury,
      saleFeeBps,
      maxFeeBps: maxFeeBps === null ? null : Number(maxFeeBps),
      settlementToken: SETTLEMENT_TOKEN as Address,
      settlementTokenAllowed: tokenAllowed,
      feeType: saleFeeType,
    },
    counts: {
      organizations: Number(organizations ?? 0n),
      credentials: Number(credentials ?? 0n),
      assets: Number(assets ?? 0n),
      listings: Number(listings ?? 0n),
    },
  };
}
