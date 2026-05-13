import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "octogent — too many terminals, not enough tentacles",
  description:
    "Octogent gives every Claude Code session its own scoped context, todo list, and notes — so one developer can orchestrate a swarm of agents without losing track.",
  metadataBase: new URL("https://octogent.dev"),
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "octogent — multi-agent orchestration for claude code",
    description:
      "Scoped tentacles, parallel swarms, and inter-agent messaging. The control layer your terminals were missing.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "octogent",
    description:
      "Scoped tentacles, parallel swarms, and inter-agent messaging for Claude Code.",
  },
};

export const viewport: Viewport = {
  themeColor: "#fafafa",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
