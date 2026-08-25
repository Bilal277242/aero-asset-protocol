"use client";

import * as React from "react";
import type { Connector } from "wagmi";
import { ArrowLeft, Check, Copy, ExternalLink, LogOut, QrCode as QrCodeIcon, Users, Wallet } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/data/states";
import { QrCode } from "./qr-code";
import { useAccountState } from "@/hooks/useAccountState";
import { useNetworkGuard } from "@/hooks/useNetworkGuard";
import { useWalletConnectPairing } from "@/hooks/useWalletConnectPairing";
import type { ExplainedError } from "@/lib/web3/errors/explain";
import { explorerAddress } from "@/config/env";
import { shortHex } from "@/components/protocol/chain-value";

/**
 * Wallet connection.
 *
 * Connecting requests account access and nothing else. There is no signature at connect
 * time, no `wallet_requestPermissions`, and no code path anywhere in this application
 * that signs an arbitrary message — a connect flow that asks you to sign something is
 * indistinguishable from a phishing flow, and users should never be trained to accept it.
 *
 * Two connectors are offered, never merged into one undifferentiated list: a browser
 * extension opens its own popup the instant it is clicked, where WalletConnect instead
 * needs a pairing code shown *before* clicking can mean anything. `account.injectedConnectors`
 * and `account.walletConnectConnector` come from `useAccountState`, which is also where
 * the split is explained in full.
 */
export function ConnectButton() {
  const account = useAccountState();
  const network = useNetworkGuard();
  const [open, setOpen] = React.useState(false);
  const [pane, setPane] = React.useState<"select" | "walletconnect">("select");

  React.useEffect(() => {
    if (account.status === "connected") setOpen(false);
  }, [account.status]);

  // Always re-enter at the picker, and drop any error from a previous attempt — a stale
  // "signature declined" from ten minutes ago has no business greeting someone who just
  // reopened this dialog to try again. Depends only on `open`: `account.resetError` is
  // wagmi's mutation reset function, stable for the connection's lifetime, and `account`
  // is a fresh object every render (it is the return value of a hook), so listing it
  // would re-run this on every render rather than only when the dialog opens or closes.
  const { resetError } = account;
  React.useEffect(() => {
    if (!open) {
      setPane("select");
      resetError();
    }
  }, [open, resetError]);

  if (account.status === "connected" && account.address) {
    return (
      <AccountMenu
        address={account.address}
        isContract={account.isContract}
        onDisconnect={account.disconnect}
        wrongNetwork={network.isWrongNetwork}
      />
    );
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
        {pane === "walletconnect" && account.walletConnectConnector ? (
          <WalletConnectPane
            connector={account.walletConnectConnector}
            onBack={() => {
              account.resetError();
              setPane("select");
            }}
            onConnect={(connectorId) => account.connect(connectorId)}
            error={account.error}
          />
        ) : (
          <SelectWalletPane
            walletDetected={account.walletDetected}
            injectedConnectors={account.injectedConnectors}
            walletConnectConnector={account.walletConnectConnector}
            onConnectInjected={(connectorId) => account.connect(connectorId)}
            onChooseWalletConnect={() => {
              account.resetError();
              setPane("walletconnect");
            }}
            error={account.error}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────── wallet picker ────

function SelectWalletPane({
  walletDetected,
  injectedConnectors,
  walletConnectConnector,
  onConnectInjected,
  onChooseWalletConnect,
  error,
}: {
  walletDetected: boolean | null;
  injectedConnectors: readonly Connector[];
  walletConnectConnector: Connector | null;
  onConnectInjected: (connectorId: string) => void;
  onChooseWalletConnect: () => void;
  error: ExplainedError | null;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Connect a wallet</DialogTitle>
        <DialogDescription>
          This grants read access to your address only. You will not be asked to sign
          anything, and nothing can move without a transaction you approve.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="grid gap-2">
        {walletDetected === false ? (
          <ErrorState
            kind="not-found"
            title="No browser wallet detected"
            cause="No extension announced itself on this page."
            remedy="Install a wallet extension such as MetaMask or Rabby, then reload — or connect with WalletConnect below to use a mobile wallet instead."
          />
        ) : injectedConnectors.length === 0 ? null : (
          injectedConnectors.map((connector) => (
            <button
              key={connector.uid}
              type="button"
              onClick={() => onConnectInjected(connector.uid)}
              className="flex items-center gap-3 rounded-md bg-panel shadow-raised px-3 py-2.5 text-left transition-colors hover:border-ink-3 hover:bg-sunken"
            >
              <Wallet className="size-4 text-ink-3" aria-hidden="true" />
              <span className="text-sm font-medium text-ink">{connector.name}</span>
            </button>
          ))
        )}

        {walletConnectConnector && (
          <button
            type="button"
            onClick={onChooseWalletConnect}
            className="flex items-center gap-3 rounded-md bg-panel shadow-raised px-3 py-2.5 text-left transition-colors hover:border-ink-3 hover:bg-sunken"
          >
            <QrCodeIcon className="size-4 text-ink-3" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">WalletConnect</span>
              <span className="block text-2xs text-ink-3">Scan with a mobile wallet</span>
            </span>
          </button>
        )}

        {walletDetected !== false && injectedConnectors.length === 0 && !walletConnectConnector && (
          <ErrorState
            kind="not-found"
            title="No connectors available"
            cause="The application started without any wallet connector configured."
          />
        )}

        {error && (
          <ErrorState
            kind={error.tone === "rejected" ? "permission" : "infrastructure"}
            title={error.title}
            cause={error.cause}
            remedy={error.remedy}
          />
        )}

        <p className="mt-1 text-2xs leading-relaxed text-ink-3">
          Sepolia testnet. This application never holds a private key and cannot move
          anything without your approval.
        </p>
      </DialogBody>
    </>
  );
}

// ──────────────────────────────────────────────────── WalletConnect pane ────

/**
 * The WalletConnect pairing screen: a QR code and the same pairing URI as text, built by
 * this app rather than WalletConnect's own bundled modal (`lib/web3/config.ts` explains
 * why — `showQrModal: false` keeps that modal's own dependency, `@reown/appkit`, from ever
 * loading). The pairing itself — attaching to the SDK's `display_uri` event and starting
 * `connect()` — lives in `useWalletConnectPairing`, not here; this component only renders
 * whatever that hook reports.
 */
function WalletConnectPane({
  connector,
  onBack,
  onConnect,
  error,
}: {
  connector: Connector;
  onBack: () => void;
  onConnect: (connectorId: string) => void;
  error: ExplainedError | null;
}) {
  const { uri, error: providerError } = useWalletConnectPairing(connector, onConnect);
  const [copied, setCopied] = React.useState(false);

  const copyUri = () => {
    if (!uri) return;
    void navigator.clipboard.writeText(uri).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  };

  const shown = providerError ?? error;

  return (
    <>
      <DialogHeader>
        <button
          type="button"
          onClick={onBack}
          className="mb-1.5 inline-flex items-center gap-1 text-2xs text-ink-3 transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-3" aria-hidden="true" />
          Back
        </button>
        <DialogTitle>Scan with WalletConnect</DialogTitle>
        <DialogDescription>
          Open a WalletConnect-compatible wallet on your phone and scan this code, or paste
          the link into it directly.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="grid justify-items-center gap-3">
        {shown ? (
          <ErrorState
            className="w-full"
            kind={shown.tone === "rejected" ? "permission" : "infrastructure"}
            title={shown.title}
            cause={shown.cause}
            remedy={shown.remedy}
          />
        ) : uri ? (
          <QrCode value={uri} className="rounded-sm" />
        ) : (
          <div className="flex size-[220px] items-center justify-center rounded-sm bg-sunken shadow-inset-sm">
            <Spinner className="size-6 text-ink-3" />
          </div>
        )}

        {uri && !shown && (
          <Button size="sm" variant="secondary" onClick={copyUri} className="w-full">
            {copied ? <Check className="text-confirmed" /> : <Copy />}
            {copied ? "Copied" : "Copy connection link"}
          </Button>
        )}

        <p className="text-2xs leading-relaxed text-ink-3">
          Sepolia testnet. This code expires after a few minutes — reopen this dialog for a
          fresh one if it does.
        </p>
      </DialogBody>
    </>
  );
}

// ────────────────────────────────────────────────────────── account menu ────

function AccountMenu({
  address,
  isContract,
  onDisconnect,
  wrongNetwork,
}: {
  address: string;
  isContract: boolean | null;
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

        {isContract === true && (
          <div className="mx-2 mb-1.5 rounded-xs bg-sunken shadow-inset-sm px-2 py-1.5">
            <Badge variant="outline" className="gap-1">
              <Users className="size-2.5" aria-hidden="true" />
              Smart contract wallet
            </Badge>
            <p className="mt-1 text-2xs leading-relaxed text-ink-3">
              Bytecode is present at this address. Transactions from it may need
              confirmation from additional signers before they are mined.
            </p>
          </div>
        )}

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
