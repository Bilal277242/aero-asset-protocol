"use client";

import { useContractRead } from "./useContractRead";
import { useAccountState } from "./useAccountState";
import { readRoles, type RoleSet } from "@/lib/api/roles";
import type { IdentityViewer } from "@/lib/api/identity-actions";

const EMPTY: RoleSet = {
  DEFAULT_ADMIN: false,
  PROTOCOL_ADMIN: false,
  PAUSER: false,
  ORG_VERIFIER: false,
  ASSET_VERIFIER: false,
  CREDENTIAL_ISSUER: false,
  ARBITRATOR: false,
  FEE_MANAGER: false,
  ASSET_MINTER: false,
  ESCROW_FACTORY: false,
  SETTLEMENT: false,
};

/**
 * Which protocol roles the connected account holds, read from `RoleManager`.
 *
 * The chain is the authority. This hook exists so the interface can avoid offering
 * controls that would revert — it is not, and cannot be, a security boundary. Every one
 * of these actions is gated on-chain regardless of what the UI renders.
 *
 * While the read is in flight, every role reports false. Hiding a control briefly and
 * then revealing it is the right failure direction; the reverse would flash admin
 * controls at everyone on every page load.
 */
export function useRoles(): { roles: RoleSet; isLoading: boolean; viewer: IdentityViewer } {
  const account = useAccountState();

  const query = useContractRead(
    ["roles", account.address ?? ""],
    ({ client, book, blockNumber }) => readRoles(client, book, account.address, blockNumber),
    { enabled: account.isConnected, staleTime: 60_000 },
  );

  const roles = query.data ?? EMPTY;

  return {
    roles,
    isLoading: query.isLoading,
    viewer: {
      address: account.address,
      isConnected: account.isConnected,
      roles,
    },
  };
}
