import Image from "next/image";
import { ArrowRight, Star } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";
import { PixelOctopus } from "@/components/pixel-octopus";

export function Hero() {
  return (
    <section id="top" className="relative">
      {/* Above-fold copy */}
      <div className="mx-auto max-w-3xl px-5 pb-12 pt-20 text-center sm:px-6 sm:pb-16 sm:pt-28">
        <div className="flex justify-center">
          <PixelOctopus scale={4} />
        </div>

        <div className="mt-7 flex justify-center">
          <span className="inline-flex items-center gap-2 border border-border-subtle bg-surface-1 px-2.5 py-1 text-[10px] font-bold uppercase tracking-control text-secondary">
            <span className="h-1.5 w-1.5 animate-pulse-soft bg-term-green" />
            v0.1 · open source · for claude code
          </span>
        </div>

        <h1 className="mt-8 text-[32px] font-bold leading-[1.1] tracking-tight text-foreground sm:text-[44px] lg:text-[52px]">
          <span className="block">too many terminals,</span>
          <span className="block">
            not enough{" "}
            <span className="relative inline-block">
              tentacles
              <svg
                aria-hidden
                viewBox="0 0 320 14"
                className="absolute -bottom-1.5 left-0 h-2 w-full text-term-red sm:-bottom-2 sm:h-3"
                preserveAspectRatio="none"
              >
                <path
                  d="M2 8 Q 40 2, 80 8 T 160 8 T 240 8 T 318 8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                />
              </svg>
            </span>
            .
          </span>
        </h1>

        <p className="mx-auto mt-7 max-w-xl text-balance text-center text-[14.5px] leading-relaxed text-secondary sm:text-[15.5px]">
          give every claude code session its own scoped context, todo list, and notes.
          orchestrate a swarm of agents from one workspace — instead of ten panicked
          terminals.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          <a
            href="https://github.com/josephg29/sentiph"
            target="_blank"
            rel="noreferrer"
            className={buttonClassName({ variant: "primary", size: "lg" })}
          >
            <Star className="fill-current" aria-hidden />
            star on github
          </a>
          <a href="#install" className={buttonClassName({ variant: "secondary", size: "lg" })}>
            install
            <ArrowRight aria-hidden />
          </a>
        </div>

        <p className="mt-4 text-[10px] uppercase tracking-control text-muted">
          free · mit license · no account required
        </p>
      </div>

      {/* Hero screenshot */}
      <div className="mx-auto max-w-5xl px-5 pb-20 sm:px-6 sm:pb-28">
        <div className="overflow-hidden border border-border-strong shadow-xl">
          {/* Terminal chrome */}
          <div className="flex items-center gap-2 border-b border-border-strong bg-surface-2 px-3.5 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" aria-hidden />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" aria-hidden />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" aria-hidden />
            <span className="ml-3 text-[10px] font-bold uppercase tracking-control text-muted">
              sentiph · canvas — agents and tentacles at a glance
            </span>
          </div>
          {/* Screenshot */}
          <div className="relative w-full" style={{ aspectRatio: "16/10" }}>
            <Image
              src="/preview_1.jpg"
              alt="Sentiph canvas showing tentacle nodes connected to active Claude Code agent sessions"
              fill
              className="object-cover object-top"
              priority
              sizes="(max-width: 1280px) 100vw, 1280px"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
