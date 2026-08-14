import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "AeroAsset Protocol",
  description:
    "Verified aviation asset registry, digital passport, and escrowed marketplace on Ethereum.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="border-b border-[var(--border)]">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4 text-sm">
            <Link href="/" className="font-semibold tracking-tight">
              AeroAsset
            </Link>
            <Link href="/market" className="text-[var(--muted)] hover:text-[var(--text)]">
              Market
            </Link>
            <Link href="/status" className="text-[var(--muted)] hover:text-[var(--text)]">
              Status
            </Link>
            <span className="ml-auto rounded border border-[var(--border)] px-2 py-1 font-mono text-xs text-[var(--muted)]">
              Sepolia testnet
            </span>
          </nav>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>

        <footer className="mx-auto max-w-6xl px-6 py-10 text-xs text-[var(--muted)]">
          <p>
            Testnet deployment. Not audited by an independent third party and not for use
            with real funds.
          </p>
        </footer>
      </body>
    </html>
  );
}
