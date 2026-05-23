import Image from "next/image";
import { ArrowRight, Star } from "lucide-react";

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pt-16">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-5 pb-16 pt-16 sm:px-6 lg:grid-cols-[5fr_7fr] lg:items-center lg:gap-20 lg:pt-20">
        {/* Left: copy */}
        <div>
          <div className="inline-flex items-center gap-2 border border-border-mid bg-surface-1 px-2.5 py-1 text-[10px] font-bold uppercase tracking-control text-secondary">
            <span
              className="h-1.5 w-1.5 bg-term-green"
              style={{ animation: "pulse-soft 2.4s ease-in-out infinite" }}
              aria-hidden
            />
            v0.1 · open source · claude code
          </div>

          <h1 className="mt-6 text-[40px] font-bold leading-[1.1] tracking-control text-foreground sm:text-[52px] lg:text-[58px]">
            <span className="block">all your Claude Code</span>
            <span className="block">sessions, one place.</span>
          </h1>

          <p className="mt-5 max-w-[420px] text-[14px] leading-[1.7] text-secondary">
            Sentiph lets you run as many full Claude Code terminals as you need and manage
            them all from a single local app. Each session gets its own scoped context,
            notes, and task list so nothing bleeds into anything else.
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

        {/* Right: activity screenshot */}
        <div className="relative">
          <div className="overflow-hidden border border-border-strong bg-surface-2 shadow-sm">
            <div className="flex items-center gap-2 border-b border-border-strong bg-surface-2 px-3.5 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" aria-hidden />
              <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" aria-hidden />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" aria-hidden />
              <span className="ml-3 text-[10px] font-bold uppercase tracking-control text-secondary">
                sentiph · activity
              </span>
            </div>
            <div className="relative w-full" style={{ aspectRatio: "16/10" }}>
              <Image
                src="/preview_3.jpg"
                alt="Sentiph activity view showing Claude token usage charts and GitHub commits dashboard"
                fill
                className="object-cover object-top"
                priority
                sizes="(max-width: 1024px) 100vw, 58vw"
              />
            </div>
          </div>
          <div
            aria-hidden
            className="absolute -bottom-2 -right-2 -z-10 h-full w-full border border-border-strong"
          />
        </div>
      </div>
    </section>
  );
}
