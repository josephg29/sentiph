"use client";

import { useState } from "react";
import Image from "next/image";

const TABS = [
  {
    n: 1,
    label: "agents",
    src: "/preview_agents.jpg",
    alt: "Sentiph agents canvas — 8 active sessions fanned out from the central mascot in a force-directed graph",
  },
  {
    n: 3,
    label: "activity",
    src: "/preview_3.jpg",
    alt: "Sentiph activity view — Claude token usage charts and GitHub commit metrics",
  },
  {
    n: 9,
    label: "observe",
    src: "/preview_6.jpg",
    alt: "Sentiph observe dashboard — per-agent success rates, time distribution, and token usage table",
  },
] as const;

export function DemoUI() {
  const [active, setActive] = useState(0);

  return (
    <section className="border-t border-border-mid">
      <div className="mx-auto max-w-5xl px-5 py-16 sm:px-6 sm:py-24">
        <div className="mb-10">
          <div className="text-[10px] font-bold uppercase tracking-control text-muted">
            preview
          </div>
          <h2 className="mt-2 text-2xl font-bold tracking-control text-foreground sm:text-3xl">
            The actual workspace.
          </h2>
        </div>

        <div className="overflow-hidden border border-border-strong">
          {/* App chrome nav — mirrors the real app's tab bar */}
          <div
            className="flex items-stretch"
            style={{ height: 36, background: "#111", borderBottom: "1px solid #1e1e1e" }}
          >
            {TABS.map((tab, i) => (
              <button
                key={tab.n}
                onClick={() => setActive(i)}
                className="flex items-center gap-1.5 px-4 select-none"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  background: i === active ? "#fafafa" : "transparent",
                  color: i === active ? "#111" : "#444",
                  borderRight: "1px solid #1e1e1e",
                  cursor: "pointer",
                  border: i === active ? "none" : "none",
                  borderRightColor: "#1e1e1e",
                  borderRightWidth: 1,
                  borderRightStyle: "solid",
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                <span style={{ color: i === active ? "#555" : "#2a2a2a" }}>
                  [{tab.n}]
                </span>
                {tab.label}
              </button>
            ))}
            <div
              className="flex items-center ml-auto px-4 select-none"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "#2d2d2d",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              press 1–9 to navigate
            </div>
          </div>

          {/* Screenshot stack — all rendered, only active visible */}
          <div className="relative w-full" style={{ aspectRatio: "16/10" }}>
            {TABS.map((tab, i) => (
              <Image
                key={tab.src}
                src={tab.src}
                alt={tab.alt}
                fill
                priority={i === 0}
                className="object-cover object-top"
                style={{
                  opacity: i === active ? 1 : 0,
                  transition: "opacity 0.25s ease",
                }}
                sizes="(max-width: 1280px) 100vw, 1024px"
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
