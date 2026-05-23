const ITEMS = [
  {
    label: "01 · agents",
    title: "All your sessions in one canvas.",
    body: "The agents view shows every running Claude Code session as a node. See what's active, what's idle, and what's connected to which tentacle — without switching tabs.",
    terminal: [
      "[1] agents  canvas",
      "  ● api-refactor    running",
      "  ● frontend        running",
      "  ○ db-migration    idle",
      "  ○ tests           idle",
      "",
      "press 1-9 to switch views",
    ],
    span: "lg:col-span-2",
  },
  {
    label: "02 · deck",
    title: "Create tentacles. Launch agents.",
    body: "A tentacle is a scoped job container: context, notes, and a task list for one slice of work. Create one, then launch a Claude Code agent directly into it.",
    terminal: [
      "create first tentacle",
      "  start the deck by creating",
      "  a tentacle for your codebase",
      "",
      "open agent",
      "  provider: claude code",
      "  [launch]",
    ],
    span: "lg:col-span-1",
  },
  {
    label: "03 · activity",
    title: "Token usage across every project.",
    body: "See how many tokens and dollars your agents are spending — per session, per project, per model. GitHub commits are pulled in alongside so you can connect cost to output.",
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
    title: "Agent observability built in.",
    body: "Every agent run is recorded. Success rate, duration, token cost, and errors — per agent, across all sessions. Error heatmaps show when and where things go wrong.",
    terminal: [
      "observability",
      "  total runs    80",
      "  success rate  0%",
      "  total cost    $0.00",
      "  avg duration  90.6m",
      "",
      "  time distribution by agent →",
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
            Orchestrate. Track. Observe.
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
