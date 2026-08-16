"use client";

import * as React from "react";
import { LogOut, Wallet, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ErrorState } from "@/components/data/states";
import { useAccountState } from "@/hooks/useAccountState";
import { useNetworkGuard } from "@/hooks/useNetworkGuard";
import { explorerAddress } from "@/config/env";
import { shortHex } from "@/components/protocol/chain-value";

/**
 * Wallet connection.
 *
 * Connecting requests account access and nothing else. There is no signature at connect
 * time, no `wallet_requestPermissions`, and no code path anywhere in this application
 * that signs an arbitrary message — a connect flow that asks you to sign something is
 * indistinguishable from a phishing flow, and users should never be trained to accept it.
 */
export function ConnectButton() {
  const account = useAccountState();
  const network = useNetworkGuard();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (account.status === "connected") setOpen(false);
  }, [account.status]);

  if (account.status === "connected" && account.address) {
    return <AccountMenu address={account.address} onDisconnect={account.disconnect} wrongNetwork={network.isWrongNetwork} />;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="primary" loading={account.isConnecting}>
          <Wallet />
          Connect
        </Button>
      </DialogTrigger>

      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Connect a wallet</DialogTitle>
          <DialogDescription>
            This grants read access to your address only. You will not be asked to sign
            anything, and nothing can move without a transaction you approve.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="grid gap-2">
          {account.walletDetected === false ? (
            <ErrorState
              kind="not-found"
              title="No wallet detected"
              cause="No browser wallet extension announced itself on this page."
              remedy="Install a wallet extension such as MetaMask or Rabby, then reload. You can browse everything here without one — only transactions need a wallet."
            />
          ) : account.connectors.length === 0 ? (
            <ErrorState
              kind="not-found"
              title="No connectors available"
              cause="The application started without any wallet connector configured."
            />
          ) : (
            account.connectors.map((connector) => (
              <button
                key={connector.uid}
                type="button"
                onClick={() => account.connect(connector.uid)}
                className="flex items-center gap-3 rounded border border-rule bg-panel px-3 py-2.5 text-left transition-colors hover:border-ink-3 hover:bg-sunken"
              >
                <Wallet className="size-4 text-ink-3" aria-hidden="true" />
                <span className="text-sm font-medium text-ink">{connector.name}</span>
              </button>
            ))
          )}

          {account.error && (
            <ErrorState
              kind={account.error.tone === "rejected" ? "permission" : "infrastructure"}
              title={account.error.title}
              cause={account.error.cause}
              remedy={account.error.remedy}
            />
          )}

          <p className="mt-1 text-2xs leading-relaxed text-ink-3">
            Sepolia testnet. This application never holds a private key and cannot move
            anything without your approval.
          </p>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function AccountMenu({
  address,
  onDisconnect,
  wrongNetwork,
}: {
  address: string;
  onDisconnect: () => void;
  wrongNetwork: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="secondary" className="font-mono">
          <span
            className={`size-1.5 rounded-full ${wrongNetwork ? "bg-adverse" : "bg-confirmed"}`}
            aria-hidden="true"
          />
          {shortHex(address)}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-[220px]">
        <DropdownMenuLabel>Connected account</DropdownMenuLabel>
        <div className="px-2 pb-1.5">
          <p className="break-all font-mono text-2xs text-ink-2">{address}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={explorerAddress(address)} target="_blank" rel="noreferrer noopener">
            <ExternalLink className="size-3.5" />
            View on Etherscan
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem destructive onSelect={onDisconnect}>
          <LogOut className="size-3.5" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
