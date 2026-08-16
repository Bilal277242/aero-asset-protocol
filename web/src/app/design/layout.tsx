import type { Metadata } from "next";

// The page itself is a client component and so cannot export metadata; this layout
// supplies it.
export const metadata: Metadata = {
  title: "Design system",
  description:
    "Every token and component in the AeroAsset interface, rendered rather than described.",
};

export default function DesignLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
