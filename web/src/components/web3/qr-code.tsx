"use client";

import * as React from "react";
import qrcode from "qrcode-generator";

/**
 * A WalletConnect pairing code, rendered locally.
 *
 * `qrcode-generator` is a pure, dependency-free matrix encoder — no canvas, no network,
 * no wallet-icon CDN. The SVG below is built directly from its output as a single `<path>`
 * (one subpath per dark module, combined) rather than one `<rect>` per module: a typical
 * WalletConnect URI encodes to a few thousand modules, and a few thousand DOM nodes for a
 * dialog that is open for seconds is the kind of cost worth avoiding when combining them
 * costs nothing.
 *
 * **Fixed black-on-white, deliberately not themed.** Everywhere else in this system,
 * colour follows the CSS custom properties so light and dark mode are one design, not two.
 * This is the one exception, because a QR code's scannability depends on *absolute*
 * contrast, not contrast relative to a themed panel — a "correctly" dark-mode-tinted code
 * with grey-on-charcoal modules is a code a phone camera can fail to lock onto. The white
 * quiet zone around it exists for the same reason: most scanners expect that margin.
 */
export function QrCode({
  value,
  size = 220,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  const { total, path } = React.useMemo(() => buildQr(value), [value]);

  return (
    <svg
      viewBox={`0 0 ${total} ${total}`}
      width={size}
      height={size}
      role="img"
      aria-label="WalletConnect pairing code — scan with a mobile wallet"
      className={className}
      shapeRendering="crispEdges"
    >
      <rect width={total} height={total} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}

/** Modules of white margin around the code. The minimum most scanners expect. */
const QUIET_ZONE = 2;

function buildQr(value: string): { total: number; path: string } {
  // Type number 0 = let the encoder pick the smallest version that fits `value`.
  // Error-correction 'M' (~15% recoverable) — WalletConnect's own reference UIs use the
  // same level; lower would shrink the grid at the cost of tolerating less damage or
  // glare when a phone camera reads it off a screen rather than paper.
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();

  const count = qr.getModuleCount();
  const segments: string[] = [];
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) {
        const x = col + QUIET_ZONE;
        const y = row + QUIET_ZONE;
        segments.push(`M${x} ${y}h1v1h-1z`);
      }
    }
  }

  return { total: count + QUIET_ZONE * 2, path: segments.join("") };
}
