const ITEMS = [
  {
    label: "01 · tentacles",
    title: "Scoped context per job.",
    body: "A tentacle is a job container: CONTEXT.md, todo.md, notes. Agents stop reconstructing your codebase from chat history every session.",
    terminal: [
      ".sentiph/tentacles/",
      "  ├─ api-refactor/",
      "  │   ├─ CONTEXT.md",
      "  │   ├─ todo.md",
      "  │   └─ notes.md",
      "  └─ frontend-redesign/",
      "      ├─ CONTEXT.md",
      "      └─ todo.md",
    ],
    span: "lg:col-span-2",
  },
  {
    label: "02 · swarms",
    title: "Agents spawn agents.",
    body: "Spawn child Claude Code sessions from todo.md checkbox items. Isolated git worktrees, no context pasted between tabs.",
    terminal: [
      "# todo.md",
      "- [x] update schema",
      "- [ ] refactor auth",
      "- [ ] write tests",
      "",
      "> spawning 2 agents...",
      "  ✓ terminal-a ready",
      "  ✓ terminal-b ready",
    ],
    span: "lg:col-span-1",
  },
  {
    label: "03 · messaging",
    title: "Workers talk back.",
    body: "Workers report completion, blockers, and handoffs to the orchestrator. No human relay for routine status updates.",
    terminal: [
      "[worker-1 → sentiph]",
      "  ✓ auth refactor done",
      "  3 files changed",
      "",
      "[worker-2 → sentiph]",
      "  ✗ test failing:",
      "    src/auth.test.ts:47",
    ],
    span: "lg:col-span-1",
  },
  {
    label: "04 · canvas",
    title: "One view for everything.",
    body: "A force-directed canvas shows all running agents, their tentacle assignments, and live status. Switch to deck view for side-by-side terminal columns.",
    terminal: [
      "canvas view",
      "  ○ sentiph (orchestrator)",
      "  ├─ ○ api-refactor  [idle]",
      "  ├─ ● frontend      [running]",
      "  └─ ● tests         [running]",
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
            how it works
          </div>
          <h2 className="mt-2 text-2xl font-bold tracking-control text-foreground sm:text-3xl">
            Three ideas. One coherent system.
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
