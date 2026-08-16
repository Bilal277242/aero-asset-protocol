"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  Plane,
  Store,
  Activity,
  Handshake,
  Building2,
  BadgeCheck,
  FileText,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "./theme-toggle";

/**
 * The application shell.
 *
 * Navigation is organised by **what the connected account can do**, not by contract. Three
 * tiers: public surfaces that always exist, account surfaces that appear when a wallet is
 * connected, and an ops tier for role-gated consoles.
 *
 * The protocol has eleven roles; giving each one a nav item would produce eleven
 * near-identical dashboards. A single address on Sepolia holds both ORG_VERIFIER and
 * ASSET_VERIFIER — that person should see two work queues on one screen, not navigate
 * between two places that look the same. So privileged work lives *inside* the subject
 * pages: an ORG_VERIFIER sees verify and suspend on the organization itself, where the
 * record they are judging is in front of them. The ops tier is consequently empty, and
 * `hasOperations` currently only reserves the shape for a console that earns its own page.
 *
 * Standing is passed in rather than resolved here, so this component stays presentational
 * and testable without a chain.
 */
export type NavStanding = {
  connected: boolean;
  /** True when the address holds any operational role at all. */
  hasOperations: boolean;
};

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  tier: "public" | "account" | "ops";
};

/**
 * Every entry here must resolve to a route that exists.
 *
 * An earlier version carried `/registry`, `/protocol` and `/ops` from the design phase,
 * before those surfaces were built — three nav items that 404'd, and a duplicate `/assets`
 * href that highlighted two rows at once and collided on React's key. Nav is the one place
 * a broken link is guaranteed to be found by a user rather than a test, so it lists only
 * pages that are actually implemented.
 */
const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Activity, tier: "public" },
  { href: "/assets", label: "Assets", icon: Plane, tier: "public" },
  { href: "/marketplace", label: "Market", icon: Store, tier: "public" },
  { href: "/organizations", label: "Organizations", icon: Building2, tier: "public" },
  { href: "/credentials", label: "Credentials", icon: BadgeCheck, tier: "public" },
  { href: "/documents", label: "Documents", icon: FileText, tier: "public" },
  { href: "/maintenance", label: "Maintenance", icon: Wrench, tier: "public" },
  { href: "/trades", label: "My trades", icon: Handshake, tier: "account" },
];

export function AppShell({
  standing = { connected: false, hasOperations: false },
  network = "Sepolia",
  children,
}: {
  standing?: NavStanding;
  network?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  // A route change should never leave the drawer covering the page it navigated to.
  React.useEffect(() => setOpen(false), [pathname]);

  const visible = NAV.filter((i) => {
    if (i.tier === "public") return true;
    if (i.tier === "account") return standing.connected;
    return standing.hasOperations;
  });

  return (
    <div className="min-h-screen bg-ground">
      <TopBar network={network} onMenu={() => setOpen((v) => !v)} menuOpen={open} />

      <div className="mx-auto flex w-full max-w-[1600px]">
        <Sidebar items={visible} pathname={pathname} open={open} onClose={() => setOpen(false)} />

        <main
          id="main"
          className="min-w-0 flex-1 px-4 py-5 tablet:px-6 laptop:px-8 laptop:py-6"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

function TopBar({
  network,
  onMenu,
  menuOpen,
}: {
  network: string;
  onMenu: () => void;
  menuOpen: boolean;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-panel">
      <div className="mx-auto flex h-12 w-full max-w-[1600px] items-center gap-3 px-4 tablet:px-6">
        <Button
          variant="ghost"
          size="icon"
          className="laptop:hidden"
          onClick={onMenu}
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={menuOpen}
          aria-controls="app-sidebar"
        >
          {menuOpen ? <X /> : <Menu />}
        </Button>

        <Link href="/" className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-bold tracking-tight text-ink">AEROASSET</span>
          <span className="hidden font-mono text-3xs uppercase text-ink-3 tablet:inline">
            Asset registry &amp; settlement
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="hidden tablet:inline-flex">
            {network}
          </Badge>
          <ThemeToggle />
          {/* Wallet connection lands in the chain phase. */}
          <Button size="sm" variant="primary" disabled>
            Connect
          </Button>
        </div>
      </div>
    </header>
  );
}

const GROUPS: { tier: NavItem["tier"]; label: string }[] = [
  { tier: "public", label: "Registry" },
  { tier: "account", label: "Account" },
  { tier: "ops", label: "Operations" },
];

/**
 * The permanent column and the mobile drawer are rendered separately rather than as one
 * element that slides.
 *
 * A single element toggled between `translate-x-0` and `-translate-x-full` has two
 * problems that are easy to miss and were both real here: while translated off-screen it
 * stays in the tab order, so keyboard users tab into invisible links; and it keeps
 * contributing to the document's scroll width, which lets the whole page slide sideways
 * on a phone. Rendering the drawer only when it is open removes both by construction.
 */
function Sidebar({
  items,
  pathname,
  open,
  onClose,
}: {
  items: NavItem[];
  pathname: string;
  open: boolean;
  onClose: () => void;
}) {
  // Escape closes the drawer — expected of anything that behaves like a dialog.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {/* Permanent column, laptop and above. */}
      <nav
        aria-label="Primary"
        className="sticky top-12 hidden h-[calc(100vh-48px)] w-[220px] shrink-0 border-r border-rule bg-panel laptop:block"
      >
        <NavContents items={items} pathname={pathname} />
      </nav>

      {/* Drawer, below laptop, mounted only while open. */}
      {open && (
        <div className="laptop:hidden">
          <div
            className="fixed inset-0 z-30 animate-fade-in bg-ink/40"
            onClick={onClose}
            aria-hidden="true"
          />
          <nav
            id="app-sidebar"
            aria-label="Primary"
            className="fixed inset-y-0 left-0 top-12 z-40 w-[220px] animate-slide-in border-r border-rule bg-panel"
          >
            <NavContents items={items} pathname={pathname} />
          </nav>
        </div>
      )}
    </>
  );
}

function NavContents({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-3">
      {GROUPS.map((g) => {
        const inGroup = items.filter((i) => i.tier === g.tier);
        if (inGroup.length === 0) return null;
        return (
          <div key={g.tier}>
            <p className="label-key px-2 pb-1.5">{g.label}</p>
            <ul className="grid gap-0.5">
              {inGroup.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded px-2 py-1.5 text-sm transition-colors",
                        active
                          ? "bg-accent-subtle font-medium text-accent"
                          : "text-ink-2 hover:bg-sunken hover:text-ink",
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden="true" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      <p className="mt-auto px-2 font-mono text-3xs leading-relaxed text-ink-3">
        Testnet deployment. Not audited by an independent third party. Not for use with real
        funds.
      </p>
    </div>
  );
}
