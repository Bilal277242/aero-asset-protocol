"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ConnectButton } from "@/components/web3/connect-button";
import { NetworkGuard } from "@/components/web3/network-guard";

const NAV = [
  { href: "/platform", label: "Platform" },
  { href: "/verification", label: "Verification" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/documentation", label: "Documentation" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

const REPO = "https://github.com/Bilal277242/aero-asset-protocol";

export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-ground">
      <SiteHeader />
      <div className="mx-auto w-full max-w-[1280px] px-4 tablet:px-6 empty:hidden">
        <NetworkGuard />
      </div>
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  React.useEffect(() => setOpen(false), [pathname]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-panel/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-full max-w-[1280px] items-center gap-4 px-4 tablet:px-6">
        <Link href="/" className="flex shrink-0 items-baseline gap-2">
          <span className="font-mono text-md font-bold tracking-tight text-ink">AEROASSET</span>
        </Link>

        <nav aria-label="Primary" className="ml-4 hidden laptop:flex laptop:items-center laptop:gap-1">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded px-2.5 py-1.5 text-sm transition-colors",
                  active ? "font-medium text-ink" : "text-ink-2 hover:bg-sunken hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="hidden tablet:inline-flex">
            Sepolia testnet
          </Badge>
          <ThemeToggle />
          <div className="hidden tablet:block">
            <ConnectButton />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="laptop:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="site-menu"
          >
            {open ? <X /> : <Menu />}
          </Button>
        </div>
      </div>

      {open && (
        <div id="site-menu" className="border-t border-rule bg-panel laptop:hidden">
          <nav aria-label="Primary mobile" className="mx-auto grid max-w-[1280px] gap-0.5 px-4 py-3">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded px-2 py-2 text-sm text-ink-2 transition-colors hover:bg-sunken hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
            <Button size="sm" variant="primary" asChild className="mt-2">
              <Link href="/marketplace">Explore marketplace</Link>
            </Button>
          </nav>
        </div>
      )}
    </header>
  );
}

function SiteFooter() {
  const columns: { title: string; links: { href: string; label: string; external?: boolean }[] }[] = [
    {
      title: "Platform",
      links: [
        { href: "/platform", label: "Overview" },
        { href: "/verification", label: "Verification" },
        { href: "/marketplace", label: "Marketplace" },
        { href: "/design", label: "Design system" },
      ],
    },
    {
      title: "Resources",
      links: [
        { href: "/documentation", label: "Documentation" },
        { href: `${REPO}/tree/main/docs`, label: "Specification", external: true },
        { href: `${REPO}/tree/main/audit`, label: "Internal audit", external: true },
        { href: `${REPO}`, label: "Source code", external: true },
      ],
    },
    {
      title: "Project",
      links: [
        { href: "/about", label: "About" },
        { href: "/contact", label: "Contact" },
        { href: `${REPO}/issues`, label: "Report an issue", external: true },
      ],
    },
  ];

  return (
    <footer className="border-t border-rule bg-panel">
      <div className="mx-auto w-full max-w-[1280px] px-4 py-10 tablet:px-6">
        <div className="grid gap-8 tablet:grid-cols-2 laptop:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div className="max-w-[38ch]">
            <span className="font-mono text-sm font-bold tracking-tight text-ink">AEROASSET</span>
            <p className="mt-2 text-xs leading-relaxed text-ink-2">
              Protocol infrastructure for aviation asset records — registry, digital passport,
              provenance and escrowed settlement for aircraft, engines and components.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge variant="outline">Sepolia · 11155111</Badge>
              <Badge variant="outline">MIT licence</Badge>
            </div>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <p className="label-key mb-2">{col.title}</p>
              <ul className="grid gap-1.5">
                {col.links.map((l) => (
                  <li key={l.href + l.label}>
                    <Link
                      href={l.href}
                      target={l.external ? "_blank" : undefined}
                      rel={l.external ? "noreferrer noopener" : undefined}
                      className="inline-flex items-center gap-1 text-xs text-ink-2 transition-colors hover:text-accent"
                    >
                      {l.label}
                      {l.external && <ArrowUpRight className="size-3" aria-hidden="true" />}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* The non-claims belong here in full as well as beside every record they qualify. */}
        <div className="mt-8 grid gap-2 border-t border-rule-2 pt-6">
          <p className="label-key">What this does not claim</p>
          <ul className="grid gap-1 text-xs leading-relaxed text-ink-2 laptop:grid-cols-2">
            <li>
              On-chain ownership is protocol state. It is not legal title under the law of any
              jurisdiction, and not registered ownership with any civil aviation authority.
            </li>
            <li>
              A protocol &ldquo;verified&rdquo; flag records an authorised role&rsquo;s attestation at a point
              in time. It is not an airworthiness certification.
            </li>
            <li>
              A recorded maintenance event is not a regulatory approval and not a certificate of
              release to service.
            </li>
            <li>
              Organization and credential records reflect an attestation, not the position of any
              civil aviation authority.
            </li>
          </ul>
        </div>

        <div className="mt-6 flex flex-col gap-2 border-t border-rule-2 pt-4 tablet:flex-row tablet:items-center tablet:justify-between">
          <p className="font-mono text-2xs text-ink-3">
            Testnet deployment · not independently audited · not for use with real funds
          </p>
          <p className="font-mono text-2xs text-ink-3">MIT licence · source available</p>
        </div>
      </div>
    </footer>
  );
}
