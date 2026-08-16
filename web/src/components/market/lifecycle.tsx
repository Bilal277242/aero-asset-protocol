import { Check, Circle, X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { EscrowStatus } from "@/lib/contracts/generated/enums";

/**
 * The trade lifecycle, exactly as the contracts implement it.
 *
 * Read from `Escrow.sol` rather than assumed. Two things about it are worth stating
 * plainly, because both are commonly assumed and neither is true here:
 *
 * **There is no inspection or verification state.** Nothing in the escrow gates release
 * on a survey, an inspection or a third-party sign-off. The buyer funds, and releases
 * when satisfied. Any diligence happens off-chain, before funding, using the asset
 * passport. A UI that implied a protocol-enforced inspection step would be inventing a
 * protection that does not exist.
 *
 * **Ownership moves inside `release`, not after it.** `_settle()` calls
 * `settleTransfer`, then `markSold`, then pays the fee and the seller — all in one
 * transaction. There is no separate transfer step to wait for.
 */
export type LifecycleStage = {
  key: string;
  label: string;
  detail: string;
};

const STAGES: LifecycleStage[] = [
  { key: "listed", label: "Listed", detail: "The owner offers a verified asset at a price." },
  { key: "offered", label: "Offer accepted", detail: "The seller accepts; an escrow is deployed and terms freeze." },
  { key: "funded", label: "Funded", detail: "The buyer deposits the exact price. The asset locks." },
  { key: "released", label: "Settled", detail: "Title, fee and proceeds move in one transaction." },
];

export function LifecycleTrack({
  status,
  className,
}: {
  status: number;
  className?: string;
}) {
  // Terminal states that are not "settled" break the track rather than completing it.
  const refunded = status === EscrowStatus.REFUNDED;
  const cancelled = status === EscrowStatus.CANCELLED;
  const disputed = status === EscrowStatus.DISPUTED;

  const reached =
    status === EscrowStatus.RELEASED
      ? 4
      : status === EscrowStatus.FUNDED || disputed
        ? 3
        : status === EscrowStatus.AWAITING_FUNDING
          ? 2
          : refunded || cancelled
            ? 2
            : 1;

  return (
    <div className={cn("grid gap-2", className)}>
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
        {STAGES.map((stage, i) => {
          const index = i + 1;
          const done = index <= reached && !((refunded || cancelled) && index >= reached);
          const current = index === reached;
          const broken = (refunded || cancelled) && index === reached;

          return (
            <li key={stage.key} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border",
                  broken && "border-adverse bg-adverse text-ink-inv",
                  !broken && done && "border-confirmed bg-confirmed text-ink-inv",
                  !broken && !done && current && "border-accent text-accent",
                  !broken && !done && !current && "border-rule text-ink-3",
                )}
              >
                {broken ? (
                  <X className="size-3" aria-hidden="true" />
                ) : done ? (
                  <Check className="size-3" aria-hidden="true" />
                ) : (
                  <Circle className="size-2 fill-current" aria-hidden="true" />
                )}
              </span>
              <span
                className={cn(
                  "text-xs",
                  done || current ? "font-medium text-ink" : "text-ink-3",
                )}
              >
                {stage.label}
              </span>
              {i < STAGES.length - 1 && (
                <span
                  className={cn("mx-1 h-px w-6", index < reached ? "bg-confirmed" : "bg-rule")}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>

      {disputed && (
        <p className="flex items-start gap-1.5 text-xs text-adverse">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Frozen pending arbitration. An arbitrator resolves it to exactly one party, or
          anyone refunds the buyer in full once the window closes.
        </p>
      )}
      {refunded && (
        <p className="text-xs text-ink-2">
          Ended in a refund. The asset never moved and the lock was released.
        </p>
      )}
      {cancelled && (
        <p className="text-xs text-ink-2">
          Abandoned before funding. No money moved and no lock was ever taken.
        </p>
      )}
    </div>
  );
}

/**
 * The one thing this protocol does not do, stated where a buyer will look for it.
 *
 * Users arriving from conventional escrow expect an inspection period enforced by the
 * intermediary. There is none here, and implying otherwise would be the most damaging
 * kind of interface lie.
 */
export function NoInspectionNotice({ className }: { className?: string }) {
  return (
    <div className={cn("rounded border border-blocked/40 bg-blocked-bg p-3", className)}>
      <p className="text-sm font-medium text-ink">There is no inspection period</p>
      <p className="mt-1 max-w-[80ch] text-xs leading-relaxed text-ink-2">
        The escrow has no survey, inspection or sign-off state. Once you fund, the only
        ways out are releasing to the seller, raising a dispute before the settlement
        deadline, or waiting out that deadline and taking a refund less the timeout
        penalty. <strong className="font-medium text-ink">Do your diligence before you
        fund</strong> — the asset passport is the record to read, and any physical
        inspection is a matter between you and the seller.
      </p>
    </div>
  );
}
