const ITEMS = [
  {
    label: "01 · sessions",
    title: "Multiple Claude Code terminals from one app.",
    body: "Launch as many full Claude Code sessions as you need directly from Sentiph. They all run as real PTY terminals — the full Claude Code experience, just not scattered across a dozen windows.",
    terminal: [
      "[1] agents  canvas",
      "  ● api-refactor    running",
      "  ● frontend        running",
      "  ● db-migration    running",
      "  ○ tests           idle",
      "",
      "press [+] to launch another →",
    ],
    span: "lg:col-span-2",
  },
  {
    label: "02 · tentacles",
    title: "Scoped context per session.",
    body: "Each session lives inside a tentacle — a folder with its own CONTEXT.md, task list, and notes. Agents read the right context for their job instead of reconstructing it from scratch every time.",
    terminal: [
      ".sentiph/tentacles/",
      "  api-refactor/",
      "    CONTEXT.md",
      "    todo.md",
      "  frontend/",
      "    CONTEXT.md",
      "    todo.md",
    ],
    span: "lg:col-span-1",
  },
  {
    label: "03 · activity",
    title: "Token usage across every session.",
    body: "Sentiph tracks what every session is spending across every project — tokens, cost, model, session count. The GitHub commits view shows the work that came out of it.",
    terminal: [
      "claude token usage",
      "  873.4m tokens · 164 sessions",
      "  peak day  apr 23  847.4m",
      "  avg/session      5.3m",
      "  top model        opus-4-7",
      "  best streak      18d",
    ],
    span: "lg:col-span-1",
  },
  {
    label: "04 · observe",
    title: "See what every agent actually did.",
    body: "Every session run is recorded — success rate, duration, token cost, errors, and idle time per agent. Stop guessing whether an agent got stuck. Know.",
    terminal: [
      "observability",
      "  total runs    80",
      "  avg duration  90.6m",
      "  total cost    $0.00",
      "",
      "  time distribution by agent",
      "  error heatmap (7d, hourly)",
    ],
    span: "lg:col-span-2",
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
            Everything you need to run Claude Code at scale.
          </h2>
        </div>

        <div className="grid gap-px bg-border-mid lg:grid-cols-3">
          {ITEMS.map((item) => (
            <article
              key={item.label}
              className={`flex flex-col bg-canvas p-7 ${item.span}`}
            >
              <div className="text-[10px] font-bold uppercase tracking-control text-muted">
                {item.label}
              </div>
              <h3 className="mt-2.5 text-[15px] font-bold tracking-control text-foreground sm:text-[17px]">
                {item.title}
              </h3>
              <p className="mt-2.5 max-w-prose text-[13px] leading-relaxed text-secondary">
                {item.body}
              </p>

              <div className="mt-auto pt-5">
                <div className="border border-border-strong bg-surface-1">
                  <div className="flex items-center gap-1.5 border-b border-border-strong px-3 py-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-border-strong" aria-hidden />
                    <span className="h-1.5 w-1.5 rounded-full bg-border-strong" aria-hidden />
                    <span className="h-1.5 w-1.5 rounded-full bg-border-strong" aria-hidden />
                  </div>
                  <pre className="overflow-x-auto p-3.5 text-[11px] leading-[1.7] text-secondary">
                    {item.terminal.join("\n")}
                  </pre>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
