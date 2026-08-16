"use client";

import { Button } from "@/components/ui/button";
import { Banner } from "@/components/data/states";
import { useNetworkGuard } from "@/hooks/useNetworkGuard";

/**
 * Wrong-network banner.
 *
 * Deliberately a banner rather than a blocking overlay. Reads go through this app's own
 * client and do not care what the wallet is pointed at, so browsing keeps working; only
 * writes are affected, and those are disabled individually with their own reason.
 *
 * Renders nothing when there is nothing wrong.
 */
export function NetworkGuard() {
  const network = useNetworkGuard();

  if (!network.isWrongNetwork) return null;

  return (
    <Banner
      tone="critical"
      title={`Your wallet is on the wrong network`}
      action={
        network.canSwitch ? (
          <Button size="sm" variant="primary" loading={network.isSwitching} onClick={network.switchToExpected}>
            Switch to {network.expectedChainName}
          </Button>
        ) : undefined
      }
    >
      This protocol is deployed on {network.expectedChainName} (chain{" "}
      {network.expectedChainId}); your wallet reports chain {network.currentChainId}. You
      can still browse — every read here uses this app&rsquo;s own connection — but
      transactions are disabled until you switch.
      {!network.canSwitch && " Your wallet does not support switching from a website, so change it in the wallet itself."}
      {network.error && (
        <span className="mt-1 block text-adverse">{network.error.title}</span>
      )}
    </Banner>
  );
}
