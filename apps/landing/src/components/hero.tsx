import Image from "next/image";
import { ArrowRight, Star } from "lucide-react";

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pt-20">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-5 pb-20 pt-16 sm:px-6 lg:grid-cols-[5fr_7fr] lg:items-center lg:gap-20 lg:pt-24">
        {/* Left: copy */}
        <div>
          <div className="inline-flex items-center gap-2 border border-border-subtle bg-surface-1 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-control text-secondary">
            <span className="h-1.5 w-1.5 animate-pulse-soft bg-term-green" aria-hidden />
            v0.1 · open source · claude code
          </div>

          <h1 className="mt-6 font-display text-[44px] font-bold leading-[1.05] tracking-display text-foreground sm:text-[58px] lg:text-[64px]">
            <span className="block">ten agents.</span>
            <span className="block text-accent">one workspace.</span>
          </h1>

          <p className="mt-6 max-w-[400px] text-[15px] leading-[1.65] text-secondary">
            Sentiph gives every Claude Code session its own scoped context, todo list, and notes.
            Spawn, monitor, and coordinate a swarm of agents from a single view.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="https://github.com/josephg29/sentiph"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center gap-2 bg-accent px-5 font-mono text-[11px] font-bold uppercase tracking-control text-canvas transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              <Star className="size-3.5 fill-current" aria-hidden />
              star on github
            </a>
            <a
              href="#install"
              className="inline-flex h-11 items-center gap-2 border border-border-strong px-5 font-mono text-[11px] font-bold uppercase tracking-control text-secondary transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              install
              <ArrowRight className="size-3.5" aria-hidden />
            </a>
          </div>

          <p className="mt-5 font-mono text-[10px] uppercase tracking-control text-muted">
            free · mit · node 22+ · requires claude code
          </p>
        </div>

        {/* Right: product screenshot */}
        <div className="relative">
          <div className="relative overflow-hidden border border-border-strong shadow-2xl">
            <div className="flex items-center gap-2 border-b border-border-strong bg-surface-2 px-3.5 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" aria-hidden />
              <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" aria-hidden />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" aria-hidden />
              <span className="ml-3 font-mono text-[10px] font-bold uppercase tracking-control text-muted">
                sentiph · canvas
              </span>
            </div>
            <div className="relative w-full" style={{ aspectRatio: "16/10" }}>
              <Image
                src="/preview_1.jpg"
                alt="Sentiph canvas showing tentacle nodes connected to active Claude Code agent sessions"
                fill
                className="object-cover object-top"
                priority
                sizes="(max-width: 1024px) 100vw, 58vw"
              />
            </div>
          </div>
          {/* Offset accent frame */}
          <div
            aria-hidden
            className="absolute -bottom-3 -right-3 -z-10 h-full w-full border border-accent/20"
          />
        </div>
      </div>
    </section>
  );
}
