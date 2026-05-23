"use client";

import { useEffect, useRef, useState } from "react";

// ─── Canvas layout ────────────────────────────────────────────

const DEMO_H = 500;
const CHROME_H = 36;
const CANVAS_W = 270;
const CANVAS_H = DEMO_H - CHROME_H;

const ROOT = { x: 135, y: CANVAS_H / 2 };

const AGENTS = [
  { id: "api", x: 68,  y: 94,  label: "api-refactor", status: "live"    },
  { id: "fe",  x: 204, y: 84,  label: "frontend",     status: "live"    },
  { id: "db",  x: 62,  y: 346, label: "db-migrate",   status: "idle"    },
  { id: "ts",  x: 210, y: 352, label: "tests",        status: "waiting" },
] as const;

type Status = (typeof AGENTS)[number]["status"];

const STATUS_COLOR: Record<Status, string> = {
  live:    "#25a244",
  idle:    "#888",
  waiting: "#b87000",
};

// ─── Terminal data ────────────────────────────────────────────

type LineKind = "prompt" | "success" | "working" | "dim" | "blank";

const TERM1: Array<{ k: LineKind; s: string }> = [
  { k: "prompt",  s: "$ sentiph start api-refactor" },
  { k: "success", s: "↳ session started" },
  { k: "blank",   s: "" },
  { k: "working", s: "⟳  refactor auth middleware" },
  { k: "dim",     s: "   reading auth.ts (847 lines)" },
  { k: "dim",     s: "   analyzing token flow..." },
  { k: "success", s: "✓  analysis complete" },
  { k: "dim",     s: "   writing improved version..." },
  { k: "success", s: "✓  auth.ts updated (234 lines)" },
  { k: "blank",   s: "" },
  { k: "working", s: "⟳  running test suite" },
  { k: "success", s: "   18 / 18 passed" },
];

const TERM2: Array<{ k: LineKind; s: string }> = [
  { k: "prompt",  s: "$ sentiph start frontend" },
  { k: "success", s: "↳ session started" },
  { k: "blank",   s: "" },
  { k: "working", s: "⟳  dashboard redesign" },
  { k: "dim",     s: "   reading Dashboard.tsx..." },
  { k: "dim",     s: "   planning component tree..." },
  { k: "success", s: "✓  design spec ready" },
  { k: "dim",     s: "   writing components..." },
  { k: "success", s: "✓  Dashboard.tsx updated" },
  { k: "dim",     s: "   checking types..." },
  { k: "success", s: "✓  0 errors · 2 warnings" },
  { k: "blank",   s: "" },
];

function lineColor(k: LineKind): string {
  switch (k) {
    case "prompt":  return "#555";
    case "success": return "#25a244";
    case "working": return "#b87000";
    case "dim":     return "#666";
    default:        return "#e8e8e8";
  }
}

// ─── Sub-components ───────────────────────────────────────────

function CanvasGraph() {
  const vw = CANVAS_W;
  const vh = CANVAS_H;

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{
        background: "#fafafa",
        backgroundImage: "radial-gradient(circle, #d4d4d4 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${vw} ${vh}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: "block" }}
      >
        <defs>
          {AGENTS.filter(a => a.status === "live").map(a => (
            <path
              key={`def-${a.id}`}
              id={`mp-${a.id}`}
              d={`M ${ROOT.x} ${ROOT.y} L ${a.x} ${a.y}`}
            />
          ))}
        </defs>

        {/* Edges */}
        {AGENTS.map(a => (
          <line
            key={`edge-${a.id}`}
            x1={ROOT.x} y1={ROOT.y}
            x2={a.x} y2={a.y}
            stroke={a.status === "live" ? "#cacaca" : "#e4e4e4"}
            strokeWidth={1}
          />
        ))}

        {/* Activity dots flowing along live edges */}
        {AGENTS.filter(a => a.status === "live").map(a =>
          [0, 0.62, 1.24].map((delay, di) => (
            <circle key={`dot-${a.id}-${di}`} r={2.5} fill={STATUS_COLOR.live} opacity={0.88}>
              <animateMotion dur="1.9s" repeatCount="indefinite" begin={`${delay}s`}>
                <mpath href={`#mp-${a.id}`} />
              </animateMotion>
            </circle>
          ))
        )}

        {/* Root node */}
        <rect
          x={ROOT.x - 12} y={ROOT.y - 12}
          width={24} height={24}
          fill="#111"
        />
        <text
          x={ROOT.x} y={ROOT.y + 5}
          textAnchor="middle"
          fontSize={11}
          fontWeight="bold"
          fontFamily="monospace"
          fill="#fafafa"
        >
          S
        </text>

        {/* Agent nodes */}
        {AGENTS.map(a => {
          const col = STATUS_COLOR[a.status];
          return (
            <g key={`node-${a.id}`}>
              {a.status === "live" && (
                <circle cx={a.x} cy={a.y} r={20} fill="none" stroke={col} strokeWidth={1} opacity={0.22} />
              )}
              <circle
                cx={a.x} cy={a.y} r={13}
                fill={a.status === "live" ? "#f0f0f0" : "#f4f4f4"}
                stroke={col}
                strokeWidth={1.5}
                strokeDasharray={a.status === "waiting" ? "3 2" : undefined}
              />
              {/* Status pip */}
              <circle cx={a.x + 8} cy={a.y - 8} r={3.5} fill={col} />
              {/* Label */}
              <text
                x={a.x} y={a.y + 27}
                textAnchor="middle"
                fontSize={7.5}
                fontFamily="monospace"
                letterSpacing={0.8}
                fill="#aaa"
              >
                {a.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div
        className="absolute bottom-3 left-3 font-bold uppercase"
        style={{ fontSize: 8.5, color: "#c0c0c0", letterSpacing: "0.08em", fontFamily: "var(--font-mono)" }}
      >
        4 agents · 2 live
      </div>
    </div>
  );
}

interface TermColProps {
  label: string;
  tag: string;
  lines: Array<{ k: LineKind; s: string }>;
  startDelay: number;
  inView: boolean;
}

function TerminalColumn({ label, tag, lines, startDelay, inView }: TermColProps) {
  return (
    <div className="flex flex-col flex-1 min-w-0" style={{ borderRight: "1px solid #1c1c1c" }}>
      {/* Column header */}
      <div
        className="flex items-center justify-between shrink-0 px-3 py-2 gap-2"
        style={{
          background: "linear-gradient(to bottom, #242424, #171717)",
          borderBottom: "1px solid #1a1a1a",
          minHeight: 40,
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="shrink-0 h-1.5 w-1.5"
            style={{ background: STATUS_COLOR.live, animation: "pulse-soft 2.4s ease-in-out infinite" }}
          />
          <span
            className="font-bold uppercase truncate"
            style={{ fontSize: 9.5, color: "#ccc", letterSpacing: "0.08em", fontFamily: "var(--font-mono)" }}
          >
            {label}
          </span>
          <span
            className="shrink-0 px-1 border"
            style={{ fontSize: 8, color: "#555", borderColor: "#333", letterSpacing: "0.06em", fontFamily: "var(--font-mono)", textTransform: "uppercase" }}
          >
            {tag}
          </span>
        </div>
        <span
          className="shrink-0 px-1.5 py-0.5 border font-bold uppercase"
          style={{ fontSize: 8, color: "#25a244", borderColor: "#1d3d22", letterSpacing: "0.08em", fontFamily: "var(--font-mono)" }}
        >
          live
        </span>
      </div>

      {/* Terminal output */}
      <div className="flex-1 overflow-hidden p-3.5">
        {lines.map((line, i) => (
          <div
            key={i}
            className="whitespace-pre"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              lineHeight: 1.75,
              color: lineColor(line.k),
              opacity: inView ? undefined : 0,
              ...(inView
                ? {
                    animation: "fade-up 0.22s ease both",
                    animationDelay: `${startDelay + i * 155}ms`,
                  }
                : {}),
            }}
          >
            {line.s || " "}
          </div>
        ))}

        {inView && (
          <span
            style={{
              display: "inline-block",
              width: "0.55em",
              height: "0.82em",
              background: "#fafafa",
              verticalAlign: "-0.05em",
              marginTop: 2,
              animation: "blink 1.1s step-end infinite",
              animationDelay: `${startDelay + lines.length * 155}ms`,
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────

export function DemoUI() {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold: 0.1 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

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
          <p className="mt-3 max-w-md text-[13px] leading-relaxed text-secondary">
            Agent graph on the left. Live terminals on the right. Everything in one window.
          </p>
        </div>

        {/* Demo frame */}
        <div
          ref={ref}
          className="overflow-hidden border border-border-strong"
          style={{ height: DEMO_H }}
        >
          {/* App chrome — dark header */}
          <div
            className="flex items-stretch shrink-0"
            style={{ height: CHROME_H, background: "#111", borderBottom: "1px solid #1e1e1e" }}
          >
            {/* Brand */}
            <div
              className="flex items-center gap-2 px-3 shrink-0"
              style={{ borderRight: "1px solid #1e1e1e" }}
            >
              <div
                className="flex items-center justify-center shrink-0"
                style={{ width: 15, height: 15, background: "#fafafa" }}
              >
                <span
                  style={{ fontSize: 7, fontWeight: 700, color: "#111", fontFamily: "monospace", lineHeight: 1 }}
                >
                  S
                </span>
              </div>
              <span
                className="font-bold uppercase"
                style={{ fontSize: 9, color: "#555", letterSpacing: "0.1em", fontFamily: "var(--font-mono)" }}
              >
                sentiph
              </span>
            </div>

            {/* Nav tabs */}
            {(
              [
                { n: 1, label: "agents",   active: true  },
                { n: 2, label: "activity", active: false },
                { n: 3, label: "observe",  active: false },
              ] as const
            ).map(tab => (
              <div
                key={tab.n}
                className="flex items-center gap-1.5 px-3 shrink-0 select-none"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  background: tab.active ? "#fafafa" : "transparent",
                  color:      tab.active ? "#111"    : "#444",
                  borderRight: "1px solid #1e1e1e",
                  cursor: "default",
                }}
              >
                <span style={{ color: tab.active ? "#555" : "#2a2a2a" }}>[{tab.n}]</span>
                {tab.label}
              </div>
            ))}

            {/* Usage stats — right side */}
            <div
              className="flex items-center ml-auto px-3 shrink-0"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                color: "#3a3a3a",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              873.4m tokens · $48.20
            </div>
          </div>

          {/* App body */}
          <div
            className="flex overflow-hidden"
            style={{ height: CANVAS_H }}
          >
            {/* Canvas panel */}
            <div
              className="shrink-0 overflow-hidden"
              style={{ width: CANVAS_W, borderRight: "1px solid #1e1e1e" }}
            >
              <CanvasGraph />
            </div>

            {/* Terminal panel */}
            <div className="flex flex-1 min-w-0 overflow-hidden" style={{ background: "#111" }}>
              <TerminalColumn
                label="api-refactor"
                tag="session · 01"
                lines={TERM1}
                startDelay={300}
                inView={inView}
              />
              <TerminalColumn
                label="frontend"
                tag="session · 02"
                lines={TERM2}
                startDelay={620}
                inView={inView}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
