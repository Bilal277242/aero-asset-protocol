import type { AddressDrift } from "@/lib/contracts/addressBook";

/**
 * Shown when the committed address snapshot disagrees with `ProtocolAddressRegistry`.
 *
 * The app has already switched to the on-chain values by the time this renders — the
 * registry is authoritative per architecture decision D3. The banner exists because a
 * silent switch would hide the actual problem, which is almost always that someone
 * redeployed and did not re-run `npm run codegen`.
 */
export function AddressBookDriftBanner({
  drift,
  unset,
}: {
  drift: AddressDrift[];
  unset: string[];
}) {
  if (drift.length === 0 && unset.length === 0) return null;

  return (
    <div className="mb-6 rounded border border-[var(--warn)] bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] p-4">
      {drift.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-[var(--warn)]">
            Address book is stale
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            The committed snapshot disagrees with the on-chain registry.{" "}
            <strong className="text-[var(--text)]">
              The app is using the on-chain values.
            </strong>{" "}
            Re-run <code className="font-mono">npm run codegen</code> and commit the result.
          </p>
          <table className="mt-3 w-full text-left font-mono text-xs">
            <thead className="text-[var(--muted)]">
              <tr>
                <th className="py-1 pr-4 font-normal">Key</th>
                <th className="py-1 pr-4 font-normal">Snapshot</th>
                <th className="py-1 font-normal">On chain (used)</th>
              </tr>
            </thead>
            <tbody>
              {drift.map((d) => (
                <tr key={d.key} className="border-t border-[var(--border)]">
                  <td className="py-1 pr-4">{d.key}</td>
                  <td className="py-1 pr-4 text-[var(--muted)] line-through">{d.snapshot}</td>
                  <td className="py-1 text-[var(--ok)]">{d.onChain}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {unset.length > 0 && (
        <p className="mt-3 text-xs text-[var(--bad)]">
          <strong>Unset in the registry:</strong> {unset.join(", ")}. Any call routed
          through these will revert with <code className="font-mono">AddressNotRegistered</code>.
          This is a deployment defect — <code className="font-mono">ConfigureProtocol</code>{" "}
          did not complete.
        </p>
      )}
    </div>
  );
}
