import { ArrowRight, Github } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";
import { PixelOctopus } from "@/components/pixel-octopus";

export function Hero() {
  return (
    <section id="top" className="relative">
      <div className="mx-auto max-w-3xl px-5 pb-20 pt-20 sm:px-6 sm:pb-24 sm:pt-28">
        <div className="flex justify-center">
          <PixelOctopus scale={4} />
        </div>

        <div className="mt-7 flex justify-center">
          <span className="inline-flex items-center gap-2 border border-border-subtle bg-surface-1 px-2.5 py-1 text-[10px] font-bold uppercase tracking-control text-secondary">
            <span className="h-1.5 w-1.5 bg-term-green animate-pulse-soft" />
            v0.1 · open source · for claude code
          </span>
        </div>

        <h1 className="mt-8 text-center text-[32px] font-bold leading-[1.1] tracking-tight text-foreground sm:text-[44px] lg:text-[52px]">
          <span className="block">too many terminals,</span>
          <span className="block">
            not enough{" "}
            <span className="relative">
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
          orchestrate a swarm of agents from one workspace — instead of ten panicked terminals.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          <a href="#install" className={buttonClassName({ variant: "primary", size: "md" })}>
            install sentiph
            <ArrowRight />
          </a>
          <a
            href="https://github.com/josephg29/octogent-sentiph"
            target="_blank"
            rel="noreferrer"
            className={buttonClassName({ variant: "ghost", size: "md" })}
          >
            <Github />
            github
          </a>
        </div>
      </div>
    </section>
  );
}
