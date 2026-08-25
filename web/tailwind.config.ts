import type { Config } from "tailwindcss";

/**
 * Tailwind is bound to the CSS custom properties declared in `globals.css`, never to
 * literal colours. That indirection is what makes the light and dark palettes a single
 * design decision rather than two parallel stylesheets that drift.
 */
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    // Deliberately replacing Tailwind's defaults rather than extending them. A palette
    // you can reach `bg-purple-400` from is a palette that will contain purple.
    colors: {
      transparent: "transparent",
      current: "currentColor",
      inherit: "inherit",

      ground: "var(--ground)",
      panel: "var(--panel)",
      raised: "var(--raised)",
      sunken: "var(--sunken)",

      ink: "var(--ink)",
      "ink-2": "var(--ink-2)",
      "ink-3": "var(--ink-3)",
      "ink-inv": "var(--ink-inv)",

      rule: "var(--rule)",
      "rule-2": "var(--rule-2)",
      "rule-strong": "var(--rule-strong)",

      accent: {
        DEFAULT: "var(--accent)",
        hover: "var(--accent-hover)",
        subtle: "var(--accent-subtle)",
        ink: "var(--accent-ink)",
      },

      // Named by meaning, not hue. `confirmed` stays "confirmed" if the green ever moves.
      confirmed: { DEFAULT: "var(--confirmed)", bg: "var(--confirmed-bg)" },
      blocked: { DEFAULT: "var(--blocked)", bg: "var(--blocked-bg)" },
      adverse: { DEFAULT: "var(--adverse)", bg: "var(--adverse-bg)" },
      unrecorded: { DEFAULT: "var(--unrecorded)", bg: "var(--unrecorded-bg)" },

      focus: "var(--focus)",
    },
    // Soft UI needs room for the shadow to turn the corner. A 4px radius under a 12px
    // blur reads as a smudged square, so the whole scale moves up; the small end is
    // kept for chips and inline marks, which would look like pills if they grew too.
    borderRadius: {
      none: "0",
      xs: "5px",
      sm: "7px",
      DEFAULT: "10px",
      md: "12px",
      lg: "16px",
      xl: "22px",
      full: "9999px",
    },
    fontFamily: {
      sans: "var(--font-sans)",
      mono: "var(--font-mono)",
    },
    fontSize: {
      "3xs": ["10px", { lineHeight: "14px", letterSpacing: "0.09em" }],
      "2xs": ["11px", { lineHeight: "16px", letterSpacing: "0.06em" }],
      xs: ["12px", { lineHeight: "17px" }],
      sm: ["13px", { lineHeight: "19px" }],
      base: ["14px", { lineHeight: "22px" }],
      md: ["15px", { lineHeight: "24px" }],
      lg: ["17px", { lineHeight: "26px" }],
      xl: ["21px", { lineHeight: "29px", letterSpacing: "-0.01em" }],
      "2xl": ["26px", { lineHeight: "33px", letterSpacing: "-0.02em" }],
      "3xl": ["32px", { lineHeight: "38px", letterSpacing: "-0.025em" }],
      "4xl": ["40px", { lineHeight: "46px", letterSpacing: "-0.03em" }],
    },
    // Restricted on purpose, but it was restricted *below what the components already
    // asked for*: `size-3.5` on every icon, `py-2.5` on half the surfaces, `h-7`/`h-9`
    // on buttons. Tailwind emits nothing for a value outside the scale, so those classes
    // silently did nothing and the icons fell back to lucide's intrinsic 24px. The gaps
    // the system actually uses are now in it.
    spacing: {
      0: "0",
      px: "1px",
      0.5: "2px",
      1: "4px",
      1.5: "6px",
      2: "8px",
      2.5: "10px",
      3: "12px",
      3.5: "14px",
      4: "16px",
      5: "20px",
      6: "24px",
      7: "28px",
      8: "32px",
      9: "36px",
      10: "40px",
      11: "44px",
      12: "48px",
      14: "56px",
      16: "64px",
      20: "80px",
      24: "96px",
    },
    // The neumorphic vocabulary. `raised` extrudes a surface from the page, `inset`
    // presses it in; everything else is a size of one of those two ideas.
    boxShadow: {
      none: "none",
      hairline: "var(--shadow-hairline)",
      "raised-sm": "var(--shadow-raised-sm)",
      raised: "var(--shadow-raised)",
      overlay: "var(--shadow-overlay)",
      modal: "var(--shadow-modal)",
      "inset-sm": "var(--shadow-inset-sm)",
      inset: "var(--shadow-inset)",
    },
    extend: {
      screens: {
        // Named for the machine, because the layout genuinely changes per device class.
        tablet: "640px",
        laptop: "1024px",
        desktop: "1440px",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "scale-in": {
          from: { opacity: "0", transform: "translate(-50%,-48%) scale(.98)" },
          to: { opacity: "1", transform: "translate(-50%,-50%) scale(1)" },
        },
        "slide-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        spin: { to: { transform: "rotate(360deg)" } },
      },
      animation: {
        "fade-in": "fade-in 120ms ease-out",
        "scale-in": "scale-in 140ms ease-out",
        "slide-in": "slide-in 140ms ease-out",
        shimmer: "shimmer 1.6s infinite",
        spin: "spin 700ms linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
