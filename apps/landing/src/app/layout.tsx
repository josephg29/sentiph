import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "sentiph — multi-agent orchestration for Claude Code",
  description:
    "Sentiph gives every Claude Code session its own scoped context, todo list, and notes — so one developer can orchestrate a swarm of agents without losing track.",
  metadataBase: new URL("https://github.com/josephg29/sentiph"),
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "sentiph — multi-agent orchestration for claude code",
    description:
      "Scoped tentacles, parallel swarms, and inter-agent messaging. The control layer your terminals were missing.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "sentiph",
    description:
      "Scoped tentacles, parallel swarms, and inter-agent messaging for Claude Code.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0c0c0c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={spaceGrotesk.variable}>
      <body>
        <Nav />
        {children}
        <Footer />
      </body>
    </html>
  );
}
