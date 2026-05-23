import { CopyButton } from "@/components/copy-button";

const LINES = [
  "git clone https://github.com/josephg29/sentiph",
  "cd sentiph && pnpm install && pnpm build",
  "npm install -g . && sentiph",
];

const COMMAND = LINES.join("\n");

export function Install() {
  return (
    <section id="install" className="border-t border-border-mid">
      <div className="mx-auto max-w-3xl px-5 py-16 sm:px-6 sm:py-24">
        <div className="mb-10">
          <div className="text-[10px] font-bold uppercase tracking-control text-muted">
            install
          </div>
          <h2 className="mt-2 text-2xl font-bold tracking-control text-foreground sm:text-3xl">
            Up in three commands.
          </h2>
          <p className="mt-3 max-w-md text-[13px] leading-relaxed text-secondary">
            Requires Node 22+, pnpm, and the Claude CLI. Not on npm yet — clone and install
            globally.
          </p>
        </div>

        {/* Terminal block — dark like the real app's terminal */}
        <div className="border border-border-strong" style={{ background: "var(--term-bg)" }}>
          <div
            className="flex items-center justify-between border-b px-3.5 py-2.5"
            style={{ borderColor: "#333", background: "var(--term-header)" }}
          >
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-control" style={{ color: "#aaa" }}>
              <span
                className="h-1.5 w-1.5 bg-term-green"
                style={{ animation: "pulse-soft 2.4s ease-in-out infinite" }}
                aria-hidden
              />
              terminal
            </div>
            <CopyButton value={COMMAND} />
          </div>
          <pre
            className="overflow-x-auto p-4 text-[12.5px] leading-[1.8]"
            style={{ color: "#fafafa" }}
          >
            {LINES.map((line, i) => (
              <div key={i} className="whitespace-pre">
                <span className="select-none" style={{ color: "#555" }}>$ </span>
                {line}
              </div>
            ))}
            <div className="mt-2" style={{ color: "var(--term-green)" }}>
              ↳ ui at http://localhost:8787
            </div>
          </pre>
        </div>

        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1">
          {["node 22+", "pnpm", "claude cli", "git"].map((req) => (
            <span key={req} className="text-[10px] font-bold uppercase tracking-control text-muted">
              · {req}
            </span>
          ))}
        </div>

        <p className="mt-5 text-[11px] uppercase tracking-control text-muted">
          <a
            href="https://github.com/josephg29/sentiph#docs"
            target="_blank"
            rel="noreferrer"
            className="border-b border-transparent transition-colors hover:border-secondary hover:text-foreground"
          >
            full setup docs →
          </a>
        </p>
      </div>
    </section>
  );
}
