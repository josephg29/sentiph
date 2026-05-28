function TerminalLine({ line }: { line: string }) {
  if (line === "") return <div>&nbsp;</div>;

  if (line.includes("○")) {
    return <div className="text-muted">{line}</div>;
  }

  if (line.includes("●") || line.includes("running")) {
    return (
      <div>
        {line.split(/(●|running)/).map((part, i) =>
          part === "●" || part === "running" ? (
            <span key={i} className="text-term-green">
              {part}
            </span>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </div>
    );
  }

  if (line.trim().startsWith("spawning")) {
    return <div className="text-muted">{line}</div>;
  }

  return <div>{line}</div>;
}

const ITEMS = [
  {
    label: "01 · agents",
    title: "Every session in one canvas.",
    body: "Launch as many Claude Code sessions as you need and see them all in one view. Know what is running, what is idle, and what each one is working on.",
    terminal: [
      "[1] agents",
      "  ● api-refactor    running",
      "  ● frontend        running",
      "  ○ db-migration    idle",
      "  ○ tests           idle",
    ],
  },
  {
    label: "02 · orchestration",
    title: "One session runs the others.",
    body: "A parent Claude Code session can spawn worker sessions, assign them work, and receive status back. Parallel jobs without the tab switching.",
    terminal: [
      "sentiph (parent)",
      "  spawning workers...",
      "  ● worker-1   api-refactor",
      "  ● worker-2   frontend",
      "  ● worker-3   tests",
    ],
  },
  {
    label: "03 · observability",
    title: "Track what every agent spends.",
    body: "Token usage, cost, session count, and run duration across every session and project. Per-agent success rates and error heatmaps in the observe view.",
    terminal: [
      "activity",
      "  873.4m tokens · 164 sessions",
      "  top model   claude-opus-4-7",
      "",
      "observe · per agent",
      "  avg duration  90.6m",
    ],
  },
] as const;

export function Features() {
  return (
    <section id="features" className="border-t border-border-mid">
      <div className="mx-auto max-w-5xl px-5 py-16 sm:px-6 sm:py-24">
        <div className="mb-12">
          <div className="text-[10px] font-bold uppercase tracking-control text-muted">
            what it does
          </div>
          <h2 className="mt-2 text-2xl font-bold tracking-control text-foreground sm:text-3xl">
            The layer that was missing.
          </h2>
        </div>

        <div className="grid gap-px bg-border-mid sm:grid-cols-3">
          {ITEMS.map((item) => (
            <article
              key={item.label}
              className="flex flex-col bg-canvas p-7 transition-colors hover:bg-surface-1"
            >
              <div className="text-[10px] font-bold uppercase tracking-control text-muted">
                {item.label}
              </div>
              <h3 className="mt-2.5 text-[15px] font-bold tracking-control text-foreground">
                {item.title}
              </h3>
              <p className="mt-2.5 text-[13px] leading-relaxed text-secondary">{item.body}</p>

              <div className="mt-auto pt-5">
                <div className="border border-border-strong bg-surface-2">
                  <div className="flex items-center gap-1.5 border-b border-border-strong px-3 py-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-border-strong" aria-hidden />
                    <span className="h-1.5 w-1.5 rounded-full bg-border-strong" aria-hidden />
                    <span className="h-1.5 w-1.5 rounded-full bg-border-strong" aria-hidden />
                  </div>
                  <div className="overflow-x-auto p-3.5 text-[11px] leading-[1.7] text-secondary font-mono">
                    {item.terminal.map((line, i) => (
                      <TerminalLine key={i} line={line} />
                    ))}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
