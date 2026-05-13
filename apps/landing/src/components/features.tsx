const ITEMS = [
  {
    label: "01 · tentacles",
    title: "scoped context",
    body: "a tentacle is a folder of agent-readable markdown — CONTEXT.md, todo.md, notes. agents stop reconstructing your codebase from chat history.",
  },
  {
    label: "02 · swarms",
    title: "parallel agents",
    body: "spawn child agents directly from todo.md checkbox items. run them in worktrees or shared — the orchestrator stays the source of truth.",
  },
  {
    label: "03 · messaging",
    title: "they talk back",
    body: "workers report completion, blockers, and handoffs to the parent. no human-in-the-loop for the boring updates.",
  },
];

export function Features() {
  return (
    <section id="features" className="border-t border-border-subtle">
      <div className="mx-auto max-w-3xl px-5 py-20 sm:px-6 sm:py-24">
        <div className="grid gap-10 md:grid-cols-3 md:gap-8">
          {ITEMS.map((item) => (
            <article key={item.title}>
              <div className="text-[10px] font-bold uppercase tracking-control text-muted">
                {item.label}
              </div>
              <h3 className="mt-2 text-[15px] font-bold text-foreground">{item.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-secondary">
                {item.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
