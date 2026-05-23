import { CopyButton } from "@/components/copy-button";

const LINES = [
  "git clone https://github.com/josephg29/sentiph",
  "cd sentiph && pnpm install && pnpm build",
  "npm install -g . && sentiph",
];

const COMMAND = LINES.join("\n");

export function Install() {
  return (
    <section id="install" className="border-t border-border-subtle">
      <div className="mx-auto max-w-3xl px-5 py-20 sm:px-6 sm:py-28">
        <div className="mb-12">
          <div className="font-mono text-[10px] font-bold uppercase tracking-control text-muted">
            install
          </div>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-display text-foreground sm:text-4xl">
            Up in three commands.
          </h2>
          <p className="mt-4 max-w-md text-[14px] leading-relaxed text-secondary">
            Requires Node 22+, pnpm, and the Claude CLI. Not on npm yet — clone and install
            globally.
          </p>
        </div>

        <div className="border border-border-strong bg-surface-1">
          <div className="flex items-center justify-between border-b border-border-strong px-3.5 py-2.5">
            <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-control text-muted">
              <span className="h-1.5 w-1.5 animate-pulse-soft bg-term-green" aria-hidden />
              terminal
            </div>
            <CopyButton value={COMMAND} />
          </div>
          <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-[1.8] text-foreground">
            {LINES.map((line, i) => (
              <div key={i} className="whitespace-pre">
                <span className="select-none text-muted">$ </span>
                {line}
              </div>
            ))}
            <div className="mt-2 text-accent">↳ ui at http://localhost:8787</div>
          </pre>
        </div>

        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-1">
          {["node 22+", "pnpm", "claude cli", "git"].map((req) => (
            <span key={req} className="font-mono text-[10px] font-bold uppercase tracking-control text-muted">
              · {req}
            </span>
          ))}
        </div>

        <p className="mt-6 font-mono text-[11px] uppercase tracking-control text-muted">
          <a
            href="https://github.com/josephg29/sentiph#docs"
            target="_blank"
            rel="noreferrer"
            className="border-b border-transparent transition-colors hover:border-foreground/40 hover:text-foreground"
          >
            full setup docs →
          </a>
        </p>
      </div>
    </section>
  );
}
