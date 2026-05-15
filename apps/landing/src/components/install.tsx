import { CopyButton } from "@/components/copy-button";

const LINES = [
  "git clone https://github.com/josephg29/octogent-sentiph",
  "cd octogent-sentiph && pnpm install && pnpm build",
  "npm install -g . && sentiph",
];

const COMMAND = LINES.join("\n");

export function Install() {
  return (
    <section id="install" className="border-t border-border-subtle">
      <div className="mx-auto max-w-3xl px-5 py-20 sm:px-6 sm:py-24">
        <div className="text-center">
          <div className="text-[10px] font-bold uppercase tracking-control text-muted">
            install
          </div>
          <h2 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">
            run it locally.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-[13.5px] leading-relaxed text-secondary">
            not on npm yet. clone, build, install globally. requires node 22+, claude, git.
          </p>
        </div>

        <div className="mx-auto mt-8 max-w-xl border border-border-strong bg-terminal-bg">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-control text-white/60">
              <span className="h-1.5 w-1.5 bg-term-green" />
              terminal
            </div>
            <CopyButton value={COMMAND} />
          </div>
          <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-[1.7] text-white">
            {LINES.map((line, i) => (
              <div key={i} className="whitespace-pre">
                <span className="select-none text-white/35">$ </span>
                {line}
              </div>
            ))}
            <div className="mt-1.5 text-term-green">↳ ui at http://localhost:8787</div>
          </pre>
        </div>

        <p className="mt-6 text-center text-[11px] uppercase tracking-control text-muted">
          <a
            href="https://github.com/josephg29/octogent-sentiph#docs"
            target="_blank"
            rel="noreferrer"
            className="border-b border-transparent transition-colors hover:border-foreground/40 hover:text-foreground"
          >
            full docs →
          </a>
        </p>
      </div>
    </section>
  );
}
