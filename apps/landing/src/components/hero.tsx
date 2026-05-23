import { ArrowRight, Star } from "lucide-react";

export function Hero() {
  return (
    <section id="top" className="pt-16">
      <div className="mx-auto max-w-3xl px-5 pb-16 pt-16 sm:px-6 lg:pt-24">
        <div className="inline-flex items-center gap-2 border border-border-mid bg-surface-1 px-2.5 py-1 text-[10px] font-bold uppercase tracking-control text-secondary">
          <span
            className="h-1.5 w-1.5 bg-term-green"
            style={{ animation: "pulse-soft 2.4s ease-in-out infinite" }}
            aria-hidden
          />
          v0.1 · open source · claude code
        </div>

        <h1 className="mt-6 text-[40px] font-bold leading-[1.1] tracking-control text-foreground sm:text-[52px] lg:text-[64px]">
          <span className="block">orchestrate</span>
          <span className="block">Claude Code agents</span>
          <span className="block">from one workspace.</span>
        </h1>

        <p className="mt-5 max-w-[420px] text-[14px] leading-[1.7] text-secondary">
          Run multiple full Claude Code sessions at once. Manage them, track what they
          spend, and coordinate parallel work without switching windows.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <a
            href="https://github.com/josephg29/sentiph"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-2 border border-foreground bg-foreground px-5 text-[11px] font-bold uppercase tracking-control text-canvas transition-colors hover:bg-transparent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            <Star className="size-3.5 fill-current" aria-hidden />
            star on github
          </a>
          <a
            href="#install"
            className="inline-flex h-10 items-center gap-2 border border-border-strong px-5 text-[11px] font-bold uppercase tracking-control text-secondary transition-colors hover:border-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            install
            <ArrowRight className="size-3.5" aria-hidden />
          </a>
        </div>

        <p className="mt-4 text-[10px] uppercase tracking-control text-muted">
          free · mit · node 22+ · requires claude code
        </p>
      </div>
    </section>
  );
}
