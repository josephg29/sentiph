import { Star } from "lucide-react";
import { PixelOctopus } from "@/components/pixel-octopus";

export function StarCta() {
  return (
    <section className="border-t border-border-strong bg-terminal-bg">
      <div className="mx-auto max-w-3xl px-5 py-24 text-center sm:px-6 sm:py-32">
        {/* Pixel octopus in white */}
        <div className="flex justify-center">
          <PixelOctopus scale={4} bodyColor="#ffffff" outlineColor="#ffffff" />
        </div>

        <h2 className="mt-10 text-[26px] font-bold leading-[1.2] tracking-tight text-white sm:text-[34px]">
          every ★ helps another developer<br className="hidden sm:block" />
          {" "}escape terminal chaos.
        </h2>

        <p className="mx-auto mt-5 max-w-sm text-balance text-[13.5px] leading-relaxed text-white/55">
          sentiph is free, open source, and mit licensed. your star
          helps more developers find it.
        </p>

        <div className="mt-9">
          <a
            href="https://github.com/josephg29/sentiph"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-12 items-center gap-3 border border-white bg-white px-7 text-[12px] font-bold uppercase tracking-control text-black transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-terminal-bg"
          >
            <Star className="size-4 fill-current" aria-hidden />
            star on github
          </a>
        </div>

        {/* Divider */}
        <div className="mx-auto mt-12 w-16 border-t border-white/10" />

        {/* Quick stats row */}
        <dl className="mt-8 flex flex-wrap justify-center gap-x-10 gap-y-4">
          {[
            { dt: "license", dd: "mit" },
            { dt: "language", dd: "typescript" },
            { dt: "runtime", dd: "node 22+" },
            { dt: "requires", dd: "claude code" },
          ].map(({ dt, dd }) => (
            <div key={dt} className="text-center">
              <dt className="text-[9px] font-bold uppercase tracking-control text-white/30">
                {dt}
              </dt>
              <dd className="mt-0.5 text-[12px] font-bold uppercase tracking-control text-white/70">
                {dd}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-10 text-[10px] uppercase tracking-control text-white/20">
          github.com/josephg29/sentiph
        </p>
      </div>
    </section>
  );
}
