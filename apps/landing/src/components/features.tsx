const ITEMS = [
  {
    label: "01 · context",
    title: "Context that lives in files, not conversation threads.",
    body: "Each session is backed by a tentacle — a folder with CONTEXT.md, todo.md, and notes. Agents read the right context for their job from disk. Close a window, restart the server, the context is still there.",
    terminal: [
      ".sentiph/tentacles/api-refactor/",
      "  CONTEXT.md   ← what this job owns",
      "  todo.md      ← executable task list",
      "  notes.md     ← handoff state",
      "",
      "agents read these files directly.",
      "no rebuilding from chat history.",
    ],
    span: "lg:col-span-2",
  },
  {
    label: "02 · orchestration",
    title: "One session can run the others.",
    body: "A parent Claude Code session can spawn worker sessions, assign them todo items, and get messages back. You stay at the top. Workers handle the parallel work.",
    terminal: [
      "sentiph (parent)",
      "  → spawning workers...",
      "  ● worker-1   api-refactor",
      "  ● worker-2   frontend",
      "  ● worker-3   tests",
    ],
    span: "lg:col-span-1",
  },
  {
    label: "03 · visibility",
    title: "Every agent, in one canvas.",
    body: "The agents view shows all running sessions as nodes. See what's active, what's idle, and which tentacle each one is attached to — without digging through terminal tabs.",
    terminal: [
      "[1] agents  canvas",
      "  ● api-refactor    running",
      "  ● frontend        running",
      "  ○ db-migration    idle",
      "  ○ tests           idle",
      "",
      "press [1-9] to switch views",
    ],
    span: "lg:col-span-1",
  },
  {
    label: "04 · observability",
    title: "What is every agent actually spending?",
    body: "Token usage, cost, session count, and run duration tracked across every session and every project. The observe view breaks it down per agent — success rate, time distribution, error heatmap.",
    terminal: [
      "activity · all projects",
      "  873.4m tokens · 164 sessions",
      "  top model   claude-opus-4-7",
      "  best streak 18 days",
      "",
      "observe · per agent",
      "  avg duration  90.6m",
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
            The layer that was missing.
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
