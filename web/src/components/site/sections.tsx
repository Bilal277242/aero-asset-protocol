import * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Layout primitives for the public site.
 *
 * Kept separate from `components/ui` because these carry marketing rhythm — wide measures,
 * generous vertical spacing — that would be wrong inside the application, where density is
 * the point.
 */

export function Container({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[1280px] px-4 tablet:px-6", className)}>
      {children}
    </div>
  );
}

export function Section({
  id,
  tone = "ground",
  className,
  children,
}: {
  id?: string;
  /** `panel` lifts a band out of the page to separate adjacent sections without a rule. */
  tone?: "ground" | "panel";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        "border-b border-rule py-12 laptop:py-16",
        tone === "panel" ? "bg-panel" : "bg-ground",
        className,
      )}
    >
      <Container>{children}</Container>
    </section>
  );
}

export function SectionHead({
  eyebrow,
  title,
  lede,
  align = "left",
  as = "h2",
  className,
}: {
  eyebrow?: string;
  title: string;
  lede?: React.ReactNode;
  align?: "left" | "center";
  /**
   * Every page needs exactly one level-one heading, and on these pages the first
   * section head *is* the page title. Pass `as="h1"` there so the document does not
   * start at level two — a heading hierarchy that skips h1 is a genuine screen-reader
   * defect, not a formality.
   */
  as?: "h1" | "h2";
  className?: string;
}) {
  const Heading = as;
  return (
    <div
      className={cn(
        "max-w-[62ch]",
        align === "center" && "mx-auto text-center",
        className,
      )}
    >
      {eyebrow && <p className="label-key mb-2">{eyebrow}</p>}
      <Heading className="text-balance text-2xl font-semibold tracking-tight text-ink laptop:text-3xl">
        {title}
      </Heading>
      {lede && <p className="mt-3 text-md leading-relaxed text-ink-2">{lede}</p>}
    </div>
  );
}

/**
 * A capability card.
 *
 * `fact` carries a value verified against the deployed contracts. It is monospace because
 * it is a protocol fact rather than a marketing number — the same distinction the whole
 * design system uses.
 */
export function FeatureCard({
  icon: Icon,
  title,
  children,
  fact,
  className,
}: {
  icon?: React.ElementType;
  title: string;
  children: React.ReactNode;
  fact?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded border border-rule bg-panel p-4", className)}>
      {Icon && <Icon className="mb-3 size-5 text-accent" aria-hidden="true" />}
      <h3 className="text-md font-semibold tracking-tight text-ink">{title}</h3>
      <div className="mt-1.5 text-sm leading-relaxed text-ink-2">{children}</div>
      {fact && (
        <p className="mt-3 border-t border-rule-2 pt-2.5 font-mono text-2xs text-ink-3">{fact}</p>
      )}
    </div>
  );
}

/**
 * A numbered sequence.
 *
 * Numbered because these genuinely are ordered — a trade cannot be funded before it is
 * accepted. Numbering that does not encode real order is decoration.
 */
export function Steps({
  steps,
  className,
}: {
  steps: { title: string; body: React.ReactNode; note?: string }[];
  className?: string;
}) {
  return (
    <ol className={cn("grid gap-px overflow-hidden rounded border border-rule bg-rule", className)}>
      {steps.map((s, i) => (
        <li key={s.title} className="grid gap-1 bg-panel p-4 tablet:grid-cols-[40px_1fr] tablet:gap-4">
          <span className="font-mono text-sm font-bold text-accent">
            {String(i + 1).padStart(2, "0")}
          </span>
          <div>
            <h3 className="text-md font-semibold tracking-tight text-ink">{s.title}</h3>
            <div className="mt-1 text-sm leading-relaxed text-ink-2">{s.body}</div>
            {s.note && <p className="mt-1.5 font-mono text-2xs text-ink-3">{s.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** A key/value strip of protocol parameters. Every value here is read from the deployment. */
export function FactStrip({
  facts,
  className,
}: {
  facts: { label: string; value: string; note?: string }[];
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid gap-px overflow-hidden rounded border border-rule bg-rule",
        "tablet:grid-cols-2 laptop:grid-cols-4",
        className,
      )}
    >
      {facts.map((f) => (
        <div key={f.label} className="bg-panel p-3">
          <dt className="label-key">{f.label}</dt>
          <dd className="mt-0.5 font-mono text-lg font-semibold tracking-tight text-ink">
            {f.value}
          </dd>
          {f.note && <p className="mt-0.5 text-2xs leading-snug text-ink-3">{f.note}</p>}
        </div>
      ))}
    </dl>
  );
}

export function CTABand({
  title,
  lede,
  primary,
  secondary,
  className,
}: {
  title: string;
  lede?: React.ReactNode;
  primary: { href: string; label: string };
  secondary?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded border border-rule bg-panel px-5 py-8 text-center laptop:px-10 laptop:py-12",
        className,
      )}
    >
      <h2 className="text-balance text-xl font-semibold tracking-tight text-ink laptop:text-2xl">
        {title}
      </h2>
      {lede && (
        <p className="mx-auto mt-2 max-w-[56ch] text-sm leading-relaxed text-ink-2">{lede}</p>
      )}
      <div className="mt-5 flex flex-col justify-center gap-2 tablet:flex-row">
        <Link
          href={primary.href}
          className="inline-flex h-10 items-center justify-center rounded bg-accent px-5 text-base font-medium text-accent-ink transition-colors hover:bg-accent-hover"
        >
          {primary.label}
        </Link>
        {secondary && (
          <Link
            href={secondary.href}
            className="inline-flex h-10 items-center justify-center rounded border border-rule bg-panel px-5 text-base font-medium text-ink transition-colors hover:border-ink-3 hover:bg-sunken"
          >
            {secondary.label}
          </Link>
        )}
      </div>
    </div>
  );
}

/** A link out of the site, with the affordance made explicit. */
export function ExternalLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={cn("inline-flex items-center gap-1 text-accent hover:underline", className)}
    >
      {children}
      <ArrowUpRight className="size-3.5" aria-hidden="true" />
    </a>
  );
}

/**
 * Marks content that is illustrative rather than read from the chain.
 *
 * The brief forbids invented statistics, and the honest way to keep sample data on the
 * page is to label it every single time rather than hope the reader infers it.
 */
export function SampleNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 font-mono text-2xs leading-relaxed text-ink-3">
      <span className="text-blocked">Sample · </span>
      {children}
    </p>
  );
}
