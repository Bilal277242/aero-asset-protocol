import type { Metadata } from "next";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/ui/toast";
import { themeScript } from "@/components/layout/theme-toggle";
import { Web3Provider } from "@/lib/web3/providers";

export const metadata: Metadata = {
  title: {
    default: "AeroAsset",
    template: "%s · AeroAsset",
  },
  description:
    "Verified registry, digital passport and escrowed settlement for aircraft, engines and components.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs before first paint so the correct theme is applied without a flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:border focus:border-rule focus:bg-panel focus:px-3 focus:py-2 focus:text-sm"
        >
          Skip to content
        </a>
        <Web3Provider>
          <TooltipProvider delayDuration={200}>
            <ToastProvider>{children}</ToastProvider>
          </TooltipProvider>
        </Web3Provider>
      </body>
    </html>
  );
}
