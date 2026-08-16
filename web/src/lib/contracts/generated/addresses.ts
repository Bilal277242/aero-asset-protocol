// GENERATED FILE - DO NOT EDIT.
// Produced by `npm run codegen` from deployments/<chainId>.json + broadcast receipts.
// Re-run codegen after any contract change; CI fails on a diff.

export const ADDRESS_BOOK_KEYS = [
  "AIRCRAFT_REGISTRY",
  "ASSET_OWNERSHIP",
  "ASSET_PASSPORT",
  "ASSET_REGISTRY",
  "COMPONENT_REGISTRY",
  "CREDENTIAL_REGISTRY",
  "DOCUMENT_REGISTRY",
  "ESCROW_FACTORY",
  "FEE_MANAGER",
  "MAINTENANCE_REGISTRY",
  "MARKETPLACE",
  "ORGANIZATION_REGISTRY",
  "PROTOCOL_TIMELOCK",
  "ROLE_MANAGER"
] as const;
export type AddressBookKey = (typeof ADDRESS_BOOK_KEYS)[number];

export type AddressBook = Record<string, `0x${string}`>;

export type Deployment = {
  addresses: AddressBook;
  /** First block containing a deployment receipt — the floor for every log scan. */
  deployedAtBlock: bigint;
};

export const deployments = {
  11155111: {
    addresses: {
      ROLE_MANAGER: "0x8C39Daef421BF14BB4Bb56712eDd8bc52CEF7126" as `0x${string}`,
      PROTOCOL_TIMELOCK: "0x9Ed700bD47c8782b6C428F0eDd50c2F7Ea57728F" as `0x${string}`,
      ORGANIZATION_REGISTRY: "0x64fBD54f4Cb8bA641a05a32C789924Be31722EBB" as `0x${string}`,
      CREDENTIAL_REGISTRY: "0xEdB1aE99c7F1a32b3A6a0F39c7F421386eC6d1e9" as `0x${string}`,
      ASSET_REGISTRY: "0x88E3A5094DFA93926f3B6D5ED57173D3473EA660" as `0x${string}`,
      ASSET_OWNERSHIP: "0xeA2b26E8B8d1ed33Fd2339478cd50465478Ad812" as `0x${string}`,
      AIRCRAFT_REGISTRY: "0xA68ff461Fe0F79ee9C9587EB5a20b896Cdd44f1C" as `0x${string}`,
      COMPONENT_REGISTRY: "0xe1d04AD09C240Adf4B494F89869fA4B06Add4B31" as `0x${string}`,
      DOCUMENT_REGISTRY: "0x6167260075f2300f01ce8152df65E724d985fE9f" as `0x${string}`,
      MAINTENANCE_REGISTRY: "0xe25c0A7F34cC30cB0bf37bBe990f332114F29B9B" as `0x${string}`,
      ASSET_PASSPORT: "0x057FA5385B4CbD4c6d0a5B5d109B171F883763e4" as `0x${string}`,
      MARKETPLACE: "0xA38072A464D8EDC2a7C74B84eC463e3E1eA36B86" as `0x${string}`,
      ESCROW_FACTORY: "0x3F0A2CC772d0e714970425beC8b31dd415E0c390" as `0x${string}`,
      FEE_MANAGER: "0xb69A4c294D994B94B097307F38adf9c1634CC083" as `0x${string}`,
      ADDRESS_REGISTRY: "0xc9cf5998604A65e2C115476b7D165CB7A68e6224" as `0x${string}`,
      ESCROW_IMPLEMENTATION: "0xfC317babD11079c5Edb75311C6a6146699C88006" as `0x${string}`,
    },
    deployedAtBlock: 11485840n,
  },
} as const satisfies Record<string, Deployment>;

export type SupportedChainId = keyof typeof deployments;

export function isSupportedChain(id: number | string): id is SupportedChainId {
  return String(id) in deployments;
}
