/**
 * The protocol's non-claims.
 *
 * These are not boilerplate and they are not optional. `docs/requirements.md` states
 * them, and every contract they apply to repeats them in its NatSpec. The reason is
 * specific to this domain: an aviation asset registry that lets a reader infer legal
 * title or airworthiness from a green checkmark is actively misleading about something
 * that carries real-world safety and legal weight.
 *
 * They render **adjacent to the claim they qualify**, never collected in a footer where
 * nobody reads them. A "Verified" chip without its qualifier is the failure mode.
 */
export type NonClaimVariant = "title" | "airworthiness" | "maintenance" | "attestation";

const TEXT: Record<NonClaimVariant, string> = {
  title:
    "On-chain ownership is protocol state, not legal title under the law of any jurisdiction, and not registered ownership with any civil aviation authority.",
  airworthiness:
    "Verified records that an authorised protocol role attested to this asset at a point in time. It is not an airworthiness certification.",
  maintenance:
    "A recorded maintenance event is not a regulatory approval, not a certificate of release to service, and not a determination of airworthiness by any civil aviation authority.",
  attestation:
    "This record reflects what an authorised protocol role attested and when. It is not a verification of real-world corporate identity or approval status.",
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
}: {
  variant: NonClaimVariant;
  display?: "inline" | "block";
}) {
  if (display === "block") {
    return (
      <p className="rounded border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-xs leading-relaxed text-[var(--muted)]">
        {TEXT[variant]}
      </p>
    );
  }

  return (
    <span
      title={TEXT[variant]}
      className="cursor-help text-xs text-[var(--muted)] underline decoration-dotted underline-offset-2"
    >
      {SHORT[variant]}
    </span>
  );
}
