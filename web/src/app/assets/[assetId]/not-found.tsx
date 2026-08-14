import Link from "next/link";

/**
 * A miss here is genuinely ambiguous and the copy says so: `getPassport` reverts
 * `AssetNotFound` both for an id that was never issued and for one on a *different*
 * deployment. The second case is the one that wastes an hour, so it is named.
 */
export default function AssetNotFound() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">No such asset</h1>
      <p className="mt-3 text-sm text-[var(--muted)]">
        Nothing is registered under that id. Asset ids are sequential and start at 1, so
        this is either an id that has not been issued yet, or an id from a different
        deployment of the protocol.
      </p>
      <p className="mt-3 text-sm text-[var(--muted)]">
        <Link href="/status" className="underline">
          Protocol status
        </Link>{" "}
        shows which chain and which contracts this app is pointed at, and how many assets
        the registry currently holds.
      </p>
    </div>
  );
}
