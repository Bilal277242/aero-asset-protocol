import { decodeError, type DecodedError } from "./decode";

/**
 * Turns a decoded error into something a person can act on.
 *
 * The structure is always the same: what happened, why, and what to do next. A message
 * that stops at "why" leaves the user stuck; one that stops at "what" leaves them
 * guessing. `detail` carries the verbatim decoded error so it stays searchable and
 * reportable.
 *
 * Roughly forty of the protocol's errors are reachable by an ordinary user and get
 * written copy below. The remainder — initialization, UUPS, machine-role — fall through
 * to a verbatim rendering, which is still far better than "Transaction failed".
 */

export type ErrorTone = "rejected" | "blocked" | "infrastructure" | "failed";

export type ExplainedError = {
  tone: ErrorTone;
  title: string;
  cause?: string;
  remedy?: string;
  /** Verbatim, selectable technical detail. */
  detail?: string;
};

type Formatter = (args: readonly unknown[]) => Omit<ExplainedError, "tone" | "detail">;

const addr = (v: unknown) => {
  const s = String(v ?? "");
  return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
};
const num = (v: unknown) => String(v ?? "");

/**
 * Copy for the errors a user can actually hit.
 *
 * Keyed by error name. Where two contracts declare the same name they also mean the same
 * thing, so one entry serves both.
 */
const COPY: Record<string, Formatter> = {
  // ── Marketplace: listings ────────────────────────────────────────────────
  ListingNotFound: (a) => ({
    title: "That listing does not exist",
    cause: `No listing with id ${num(a[0])} has ever been created.`,
    remedy: "Check the link you followed, or browse the market for current listings.",
  }),
  ListingNotActive: (a) => ({
    title: "This listing is no longer open",
    cause: `Listing ${num(a[0])} has left the active state, so offers can no longer be made or accepted against it.`,
    remedy: "If it lapsed by time alone, anyone can record the expiry. Otherwise the seller must create a new listing.",
  }),
  ListingNotExpired: (a) => ({
    title: "This listing has not expired yet",
    cause: `Listing ${num(a[0])} runs until its deadline, which has not passed.`,
    remedy: "Expiry can only be recorded once the deadline is genuinely behind us.",
  }),
  AssetAlreadyListed: (a) => ({
    title: "This asset is already listed",
    cause: `Asset ${num(a[0])} has an active listing, number ${num(a[1])}. The protocol permits only one at a time.`,
    remedy: "Cancel the existing listing before creating another.",
  }),
  AssetNotVerified: (a) => ({
    title: "This asset has not been verified",
    cause: `Asset ${num(a[0])} has never been attested to by an asset verifier, and only verified assets may be listed.`,
    remedy: "Ask an account holding the asset-verifier role to verify it first.",
  }),
  AssetNotTransferable: (a) => ({
    title: "This asset cannot be transferred right now",
    cause: `Asset ${num(a[0])} is either frozen by a terminal status or locked by a settlement in progress.`,
    remedy: "A settlement lock clears when that trade completes or times out. A freeze requires the status to change first.",
  }),
  ComponentIsInstalled: (a) => ({
    title: "This component is fitted to an airframe",
    cause: `Component ${num(a[0])} is installed on asset ${num(a[1])}. Selling it in place would leave the airframe claiming parts its owner does not own.`,
    remedy: "Remove it from the airframe, then list it.",
  }),
  EscrowInProgress: (a) => ({
    title: "A trade is already in progress",
    cause: `Listing ${num(a[0])} has escrow ${num(a[1])} open against it.`,
    remedy: "Wait for that trade to settle, be cancelled, or time out.",
  }),
  PriceTooLow: () => ({
    title: "The price must be above zero",
    remedy: "Enter a price in the settlement token's base units.",
  }),
  DeadlineInPast: (a) => ({
    title: "That deadline has already passed",
    cause: `The deadline given was ${num(a[0])}, and the chain's clock currently reads ${num(a[1])}.`,
    remedy: "Choose a time in the future. The chain's clock decides, not your device's.",
  }),
  DeadlineTooFar: (a) => ({
    title: "That deadline is too far out",
    cause: `The latest permitted deadline is ${num(a[1])}; ${num(a[0])} was requested.`,
    remedy: "Listings are capped at one year so a stale listing cannot hold an asset's only slot indefinitely.",
  }),
  NotListingSeller: (a) => ({
    title: "Only the seller can do that",
    cause: `Listing ${num(a[0])} belongs to a different account than ${addr(a[1])}.`,
    remedy: "Switch to the account that created the listing.",
  }),
  SellerNoLongerOwner: (a) => ({
    title: "This asset changed hands",
    cause: `The listing recorded ${addr(a[1])} as the seller, but ${addr(a[2])} owns asset ${num(a[0])} now.`,
    remedy: "The listing can no longer be accepted. The current owner must list it again.",
  }),

  // ── Marketplace: offers ──────────────────────────────────────────────────
  OfferNotFound: (a) => ({
    title: "That offer does not exist",
    cause: `No offer with id ${num(a[0])} has been made.`,
  }),
  OfferNotActive: (a) => ({
    title: "This offer is no longer open",
    cause: `Offer ${num(a[0])} has been withdrawn, rejected, accepted, or has passed its deadline.`,
    remedy: "The buyer can make a fresh offer if the listing is still active.",
  }),
  OfferNotExpired: (a) => ({
    title: "This offer has not expired yet",
    cause: `Offer ${num(a[0])} is still within its window.`,
  }),
  NotOfferBuyer: (a) => ({
    title: "Only the buyer can do that",
    cause: `Offer ${num(a[0])} was made by a different account than ${addr(a[1])}.`,
    remedy: "Switch to the account that made the offer.",
  }),
  SelfOffer: () => ({
    title: "You cannot bid on your own listing",
    remedy: "Offers must come from an account other than the seller.",
  }),

  // ── Escrow ───────────────────────────────────────────────────────────────
  NotEscrowBuyer: (a) => ({
    title: "Only the buyer can do that",
    cause: `This escrow's buyer is ${addr(a[1])}; the call came from ${addr(a[0])}.`,
    remedy: "Release is buyer-only by design, so a seller cannot take payment without the buyer confirming delivery.",
  }),
  NotEscrowParty: (a) => ({
    title: "You are not party to this trade",
    cause: `${addr(a[0])} is neither the buyer nor the seller of this escrow.`,
  }),
  IncorrectFundingAmount: (a) => ({
    title: "The deposit did not arrive in full",
    cause: `The escrow measured ${num(a[1])} received against ${num(a[0])} required.`,
    remedy: "The amount is measured as a balance delta, so a token that deducts a transfer fee will always fall short. Check the settlement token.",
  }),
  FundingDeadlinePassed: (a) => ({
    title: "The funding window has closed",
    cause: `Funding closed at ${num(a[0])}; the chain's clock reads ${num(a[1])}.`,
    remedy: "This trade can now be cancelled by anyone. No funds moved.",
  }),
  FundingDeadlineNotPassed: (a) => ({
    title: "The funding window is still open",
    cause: `Anyone may cancel after ${num(a[0])}; it is currently ${num(a[1])}.`,
    remedy: "Until then, only the buyer or the seller can cancel.",
  }),
  SettlementDeadlineNotPassed: (a) => ({
    title: "It is too early to claim a timeout",
    cause: `The settlement deadline is ${num(a[0])}; the chain's clock reads ${num(a[1])}.`,
    remedy: "After that deadline anyone can refund the buyer, less the timeout penalty.",
  }),
  SettlementDeadlinePassed: (a) => ({
    title: "It is too late to raise a dispute",
    cause: `Disputes close at ${num(a[0])}; it is now ${num(a[1])}.`,
    remedy: "This is deliberate — a last-second dispute must not be able to block the refund path.",
  }),
  DisputeDeadlineNotPassed: (a) => ({
    title: "Arbitration still has time",
    cause: `The arbitrator has until ${num(a[0])}; it is currently ${num(a[1])}.`,
    remedy: "After that, anyone can refund the buyer in full.",
  }),
  NothingToWithdraw: (a) => ({
    title: "Nothing is owed to that account",
    cause: `${addr(a[0])} has no undelivered payout held by this escrow.`,
  }),
  FeeExceedsPrice: (a) => ({
    title: "The fee exceeds the price",
    cause: `A fee of ${num(a[0])} was quoted against a price of ${num(a[1])}.`,
  }),
  InvalidEscrowTransition: () => ({
    title: "This escrow is not in a state that allows that",
    remedy: "Refresh the trade — its status likely changed since the page loaded.",
  }),

  // ── Assets and ownership ─────────────────────────────────────────────────
  AssetNotFound: (a) => ({
    title: "That asset does not exist",
    cause: `No asset with id ${num(a[0])} is registered.`,
    remedy: "Ids are sequential from 1. This may also be an id from a different deployment.",
  }),
  AssetTerminal: (a) => ({
    title: "This asset is retired or destroyed",
    cause: `Asset ${num(a[0])} holds a terminal status, which freezes it.`,
    remedy: "A retired asset can be returned to service by its owner. A destroyed one needs a governance action.",
  }),
  AssetLockedBySettlement: (a) => ({
    title: "A trade is holding this asset",
    cause: `Asset ${num(a[0])} is locked by escrow ${addr(a[1])}.`,
    remedy: "The lock clears when that trade settles or times out. This prevents a seller freezing an asset after a buyer has funded.",
  }),
  NotAssetOwner: (a) => ({
    title: "You do not own this asset",
    cause: `Asset ${num(a[0])} belongs to ${addr(a[2])}; the call came from ${addr(a[1])}.`,
  }),
  NotPendingOwner: (a) => ({
    title: "This transfer was not offered to you",
    cause: `Asset ${num(a[0])} is offered to ${addr(a[2])}, not ${addr(a[1])}.`,
  }),
  NoPendingTransfer: (a) => ({
    title: "No transfer is pending",
    cause: `Asset ${num(a[0])} has no outstanding transfer offer.`,
  }),
  TransferOfferExpired: (a) => ({
    title: "This transfer offer has expired",
    cause: `The offer on asset ${num(a[0])} ended at ${num(a[1])}.`,
    remedy: "The owner must start a new transfer. Note the record still shows a pending owner — nothing clears it.",
  }),
  AssetTransferFrozen: (a) => ({
    title: "Transfers are frozen for this asset",
    cause: `Asset ${num(a[0])} has a terminal status, which freezes transfers.`,
  }),
  SerialNumberTaken: (a) => ({
    title: "That serial number is already registered",
    cause: `The commitment is held by asset ${num(a[1])}.`,
    remedy: "If this is a genuine duplicate, the existing registration must be resolved first.",
  }),

  // ── Identity ─────────────────────────────────────────────────────────────
  OrganizationNotFound: (a) => ({
    title: "That organization does not exist",
    cause: `No organization with id ${num(a[0])} is registered.`,
  }),
  OrganizationNotVerified: (a) => ({
    title: "This organization is not verified",
    cause: `Organization ${num(a[0])} is not in the verified state, so it cannot introduce records.`,
    remedy: "An account holding the organization-verifier role must verify it.",
  }),
  NotActingForOrganization: (a) => ({
    title: "You cannot act for that organization",
    cause: `${addr(a[1])} is neither an admin nor an operator of organization ${num(a[0])}.`,
    remedy: "The organization's admin can add you as an operator.",
  }),
  NotOrganizationAdmin: (a) => ({
    title: "Only the organization's admin can do that",
    cause: `${addr(a[1])} is not the admin of organization ${num(a[0])}.`,
  }),
  OrganizationNameTaken: (a) => ({
    title: "That name is already registered",
    cause: `Organization ${num(a[1])} already holds this name commitment.`,
  }),
  DuplicateValidCredential: (a) => ({
    title: "A valid credential of this type already exists",
    cause: `Organization ${num(a[0])} already holds credential ${num(a[2])} of this type.`,
    remedy: "Revoke the existing credential first, or let it lapse. The protocol permits only one valid credential per type.",
  }),
  CredentialNotValid: (a) => ({
    title: "This credential is not valid",
    cause: `Credential ${num(a[0])} is suspended, revoked, or past its expiry.`,
  }),
  NoValidMaintenanceCredential: (a) => ({
    title: "This organization cannot record maintenance",
    cause: `Organization ${num(a[0])} holds no valid maintenance-authority credential.`,
    remedy: "A credential issuer must grant one before maintenance can be recorded.",
  }),
  NotAuthorizedMro: (a) => ({
    title: "Only maintenance organizations can record maintenance",
    cause: `Organization ${num(a[0])} is not registered as an MRO.`,
  }),

  // ── Documents ────────────────────────────────────────────────────────────
  DocumentNotFound: (a) => ({
    title: "That document does not exist",
    cause: `No document with id ${num(a[0])} is registered.`,
  }),
  DocumentHashTaken: (a) => ({
    title: "This document is already registered",
    cause: `The same hash is held by document ${num(a[1])}.`,
    remedy: "An identical file cannot be registered twice against the same asset.",
  }),
  NotDocumentController: (a) => ({
    title: "You cannot modify this document",
    cause: `${addr(a[1])} controls neither asset ${num(a[0])} nor the issuing organization.`,
  }),
  IssuedAtInFuture: (a) => ({
    title: "The issue date is in the future",
    cause: `${num(a[0])} is ahead of the chain's clock at ${num(a[1])}.`,
  }),

  // ── Components ───────────────────────────────────────────────────────────
  PositionOccupied: (a) => ({
    title: "That position is already occupied",
    cause: `Position ${num(a[2])} on asset ${num(a[0])} holds component ${num(a[3])}.`,
    remedy: "Remove the existing component, or install into a free position.",
  }),
  ParentNotAircraft: (a) => ({
    title: "Components can only be fitted to an airframe",
    cause: `Asset ${num(a[0])} is not an aircraft.`,
  }),
  ComponentNotInstalled: (a) => ({
    title: "This component is not installed",
    cause: `Asset ${num(a[0])} is not currently fitted to anything.`,
  }),
  UseInstallComponent: () => ({
    title: "Use the install action instead",
    remedy: "Installed status requires a parent and a position, which the generic status setter does not carry.",
  }),

  // ── Access control and system ────────────────────────────────────────────
  MissingRole: (a) => ({
    title: "This account lacks the required role",
    cause: `${addr(a[1])} does not hold the role this action requires.`,
    remedy: "Protocol roles are granted through governance and take effect after the timelock delay.",
  }),
  EnforcedPause: () => ({
    title: "This module is paused",
    cause: "An operator halted this part of the protocol, most likely in response to an incident.",
    remedy: "Refunds and timeout claims keep working while paused. Restarting requires a timelocked governance action.",
  }),
  TokenNotAllowed: (a) => ({
    title: "That settlement token is not allowlisted",
    cause: `${addr(a[0])} is not permitted for settlement.`,
    remedy: "Allowlisting a token is a governance action behind the timelock.",
  }),
  ReentrancyGuardReentrantCall: () => ({
    title: "Reentrant call refused",
    cause: "The contract detected a nested call into a function that moves value.",
  }),
  SafeERC20FailedOperation: (a) => ({
    title: "The token transfer failed",
    cause: `The settlement token at ${addr(a[0])} rejected the transfer.`,
    remedy: "Sepolia USDC enforces a blacklist. If an account is blocked, its payout becomes claimable later rather than blocking settlement for everyone.",
  }),
};

export function explainError(error: unknown): ExplainedError {
  return explainDecoded(decodeError(error));
}

export function explainDecoded(decoded: DecodedError): ExplainedError {
  switch (decoded.kind) {
    case "user-rejected":
      return {
        tone: "rejected",
        title: "Signature declined",
        cause: "You dismissed the request in your wallet.",
        remedy: "Nothing was submitted and nothing was charged.",
      };

    case "no-wallet":
      return {
        tone: "blocked",
        title: "No wallet available",
        cause: "No browser wallet responded to the connection request.",
        remedy:
          "Install a wallet extension and reload. Browsing works without one — only transactions need a wallet.",
      };

    case "revert": {
      const formatter = COPY[decoded.name];
      const detail = decoded.argsAvailable
        ? `${decoded.name}(${decoded.args.map(String).join(", ")})`
        : `${decoded.name}(…)`;

      if (formatter && decoded.argsAvailable) {
        return { tone: "blocked", ...formatter(decoded.args), detail };
      }

      if (formatter) {
        // Named but argument-free. Every title and remedy in the table is written to
        // stand alone; only `cause` interpolates values, so it is the one part dropped.
        const { title, remedy } = formatter([]);
        return {
          tone: "blocked",
          title,
          remedy,
          detail,
        };
      }
      // Unmapped, but still named and typed — far more useful than a generic failure.
      return {
        tone: "blocked",
        title: "The protocol refused this action",
        cause: `It reverted with ${decoded.name}.`,
        remedy: "This condition has no written explanation yet. The raw error below identifies it exactly.",
        detail,
      };
    }

    case "revert-unknown":
      return {
        tone: "failed",
        title: "The transaction reverted",
        cause: decoded.reason ?? "The revert data did not match any known protocol error.",
        remedy: "This may mean the app's contract bindings are out of date. Check the protocol status page.",
        detail: decoded.data,
      };

    case "network":
      return {
        tone: "infrastructure",
        title: "Cannot reach the network",
        cause: "The RPC endpoint did not respond, or is rate-limiting requests.",
        remedy: "This is an infrastructure problem, not a protocol one. Nothing has changed on-chain.",
        detail: decoded.detail,
      };

    case "rpc":
      return {
        tone: "infrastructure",
        title: "The node rejected the request",
        cause: "The RPC endpoint returned an error before the transaction reached the protocol.",
        detail: decoded.detail,
      };

    default:
      return {
        tone: "failed",
        title: "Something went wrong",
        remedy: "The detail below is verbatim and safe to report.",
        detail: decoded.detail,
      };
  }
}

/** Which protocol errors have written copy. Used by the coverage test. */
export const explainedErrorNames = Object.keys(COPY);
