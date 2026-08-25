import { ShieldCheck, ShieldAlert, Scale } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/time";

/**
 * The distinction this whole product rests on.
 *
 * "Verified" in this protocol means precisely one thing: an account holding
 * `ASSET_VERIFIER_ROLE` called `verifyAsset` at a recorded moment, crediting a named
 * organization. It is an attestation with provenance attached.
 *
 * It is **not** an airworthiness certification, not a determination by any civil aviation
 * authority, and not evidence of legal title. Those distinctions carry real safety and
 * financial weight in this domain, so they are stated side by side and given equal
 * visual footing rather than compressed into a footnote.
 */
export function VerificationNotice({
  verified,
  verifiedAt,
  verifierOrgId,
  verifierVerified,
  className,
}: {
  verified: boolean;
  verifiedAt: number;
  verifierOrgId: bigint;
  /** Whether the crediting organization is still verified now. */
  verifierVerified: boolean | null;
  className?: string;
}) {
  return (
    <section
      className={cn("overflow-hidden rounded-md bg-panel shadow-raised", className)}
      aria-label="Verification status"
    >
      <div className="grid gap-px bg-rule tablet:grid-cols-2">
        {/* What the protocol asserts */}
        <div className="bg-panel p-4">
          <div className="flex items-start gap-2.5">
            {verified ? (
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-confirmed" aria-hidden="true" />
            ) : (
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-blocked" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p className="label-key">Protocol verification</p>
              <p
                className={cn(
                  "mt-0.5 text-md font-semibold tracking-tight",
                  verified ? "text-confirmed" : "text-blocked",
                )}
              >
                {verified ? "Attested on-chain" : "Not attested"}
              </p>

              {verified ? (
                <dl className="mt-2 grid gap-1 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-3">Attested</dt>
                    <dd className="font-mono text-ink">{formatDate(verifiedAt)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-3">Credited to</dt>
                    <dd className="font-mono text-ink">Organization #{verifierOrgId.toString()}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-3">That organization now</dt>
                    <dd
                      className={cn(
                        "font-mono",
                        verifierVerified === false ? "text-blocked" : "text-ink",
                      )}
                    >
                      {verifierVerified === null
                        ? "unknown"
                        : verifierVerified
                          ? "still verified"
                          : "no longer verified"}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-1.5 text-xs leading-relaxed text-ink-2">
                  No asset verifier has attested to this record. It cannot be listed for
                  sale until one does.
                </p>
              )}

              <p className="mt-2.5 text-xs leading-relaxed text-ink-2">
                {verified ? (
                  <>
                    An account holding the asset-verifier role called{" "}
                    <code className="font-mono text-2xs">verifyAsset</code> at the moment
                    shown. That is the entire claim: a named role made a statement on a
                    recorded date.
                  </>
                ) : (
                  <>
                    Attestation is a separate act from registration. Registering a record
                    says only that a verified organization introduced it; nothing here has
                    been checked by an asset verifier.
                  </>
                )}
              </p>

              {verified && verifierVerified === false && (
                <p className="mt-2 rounded-xs border border-blocked/40 bg-blocked-bg px-2 py-1.5 text-xs leading-relaxed text-ink-2">
                  The crediting organization has since lost its verified standing. The
                  attestation is not retroactively invalidated — history here is
                  append-only — but the context around it has changed.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* What it explicitly is not */}
        <div className="bg-sunken p-4">
          <div className="flex items-start gap-2.5">
            <Scale className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden="true" />
            <div className="min-w-0">
              <p className="label-key">Legal and regulatory certification</p>
              <p className="mt-0.5 text-md font-semibold tracking-tight text-ink-2">
                Not established here
              </p>

              <ul className="mt-2 grid gap-1.5 text-xs leading-relaxed text-ink-2">
                <li className="flex gap-1.5">
                  <span aria-hidden="true">·</span>
                  <span>
                    <strong className="font-medium text-ink">Not airworthiness.</strong> This
                    protocol is not a civil aviation authority and makes no determination
                    about the condition or airworthiness of any asset.
                  </span>
                </li>
                <li className="flex gap-1.5">
                  <span aria-hidden="true">·</span>
                  <span>
                    <strong className="font-medium text-ink">Not legal title.</strong>{" "}
                    On-chain ownership is protocol state. Title is a matter for the relevant
                    authority and the law of the jurisdiction involved.
                  </span>
                </li>
                <li className="flex gap-1.5">
                  <span aria-hidden="true">·</span>
                  <span>
                    <strong className="font-medium text-ink">Not a release to service.</strong>{" "}
                    Recorded maintenance is not a regulatory approval or a certificate of
                    release to service.
                  </span>
                </li>
                <li className="flex gap-1.5">
                  <span aria-hidden="true">·</span>
                  <span>
                    <strong className="font-medium text-ink">Not identity verification.</strong>{" "}
                    An organization record reflects an attestation, not a check of real-world
                    corporate identity or approval status.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
