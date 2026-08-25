import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * The protocol's non-claims.
 *
 * These are neither boilerplate nor optional. `docs/requirements.md` states them and
 * every contract they apply to repeats them in its NatSpec, for a reason specific to this
 * domain: an aviation asset registry that lets a reader infer legal title or airworthiness
 * from a green checkmark is misleading about something carrying real safety and legal
 * weight.
 *
 * They render **adjacent to the claim they qualify**, never collected in a footer where
 * nobody reads them. A "Verified" chip without its qualifier is the failure mode, and it
 * is the one thing in this design system that must never be dropped for space.
 */
export type NonClaimVariant = "title" | "airworthiness" | "maintenance" | "attestation";

const FULL: Record<NonClaimVariant, string> = {
  title:
    "On-chain ownership is protocol state. It is not legal title under the law of any jurisdiction, and not registered ownership with any civil aviation authority.",
  airworthiness:
    "Verified records that an authorised protocol role attested to this asset at a point in time. It is not an airworthiness certification.",
  maintenance:
    "A recorded maintenance event is not a regulatory approval, not a certificate of release to service, and not a determination of airworthiness by any civil aviation authority.",
  attestation:
    "This record reflects what an authorised protocol role attested, and when. It is not a verification of real-world corporate identity or approval status.",
};

const SHORT: Record<NonClaimVariant, string> = {
  title: "Not legal title",
  airworthiness: "Not an airworthiness certification",
  maintenance: "Not a regulatory approval",
  attestation: "Not an identity verification",
};

export function NonClaim({
  variant,
  display = "inline",
  className,
}: {
  variant: NonClaimVariant;
  /** `inline` sits beside a field; `block` heads a section. */
  display?: "inline" | "block";
  className?: string;
}) {
  if (display === "block") {
    return (
      <p
        className={cn(
          "rounded-xs bg-sunken shadow-inset-sm px-3 py-2 text-xs leading-relaxed text-ink-2",
          className,
        )}
      >
        {FULL[variant]}
      </p>
    );
  }

  return (
    <span
      title={FULL[variant]}
      className={cn(
        "cursor-help text-2xs text-ink-3 underline decoration-dotted underline-offset-2",
        className,
      )}
    >
      {SHORT[variant]}
    </span>
  );
}
