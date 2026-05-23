const ITEMS = [
  {
    label: "01 · tentacles",
    title: "scoped context",
    body: "a tentacle is a job container: CONTEXT.md, todo.md, notes. agents stop reconstructing your codebase from chat history every time they wake up.",
    terminal: [
      ".sentiph/tentacles/",
      "  ├─ api-refactor/",
      "  │   ├─ CONTEXT.md",
      "  │   ├─ todo.md",
      "  │   └─ notes.md",
      "  └─ frontend-redesign/",
      "      └─ todo.md",
    ],
  },
  {
    label: "02 · swarms",
    title: "agents spawn agents",
    body: "spawn child claude code sessions from todo.md checkbox items. run them in isolated git worktrees or shared workspace. no copy-pasting context.",
    terminal: [
      "# todo.md",
      "- [x] update schema",
      "- [ ] refactor auth module",
      "- [ ] write integration tests",
      "",
      "> spawning 2 agents...",
      "  ✓ terminal-a started",
      "  ✓ terminal-b started",
    ],
  },
  {
    label: "03 · messaging",
    title: "they talk back",
    body: "workers report completion, blockers, and handoffs to the parent. no human-in-the-loop for routine status updates — you see what matters.",
    terminal: [
      "[worker-1 → sentiph]",
      "  ✓ auth refactor done",
      "  3 files changed",
      "",
      "[worker-2 → sentiph]",
      "  ✗ test failing:",
      "    src/auth.test.ts:47",
    ],
  },
];

export function Features() {
  return (
    <section id="features" className="border-t border-border-subtle">
      <div className="mx-auto max-w-5xl px-5 py-20 sm:px-6 sm:py-24">
        <div className="mb-12 text-center sm:mb-16">
          <div className="text-[10px] font-bold uppercase tracking-control text-muted">
            how it works
          </div>
          <h2 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">
            three ideas. one coherent system.
          </h2>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {ITEMS.map((item) => (
            <article key={item.title} className="flex flex-col gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-control text-muted">
                  {item.label}
                </div>
                <h3 className="mt-1.5 text-[15px] font-bold text-foreground">{item.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-secondary">{item.body}</p>
              </div>

              {/* Inline terminal snippet */}
              <div className="mt-auto border border-border-strong bg-terminal-bg">
                <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-white/20" aria-hidden />
                  <span className="h-1.5 w-1.5 rounded-full bg-white/20" aria-hidden />
                  <span className="h-1.5 w-1.5 rounded-full bg-white/20" aria-hidden />
                </div>
                <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-[1.65] text-white/70">
                  {item.terminal.join("\n")}
                </pre>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
