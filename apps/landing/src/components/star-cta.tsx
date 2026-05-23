import { Star } from "lucide-react";

export function StarCta() {
  return (
    <section className="border-t border-border-strong bg-surface-1">
      <div className="mx-auto max-w-5xl px-5 py-24 sm:px-6 sm:py-32">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_auto] lg:items-end">
          {/* Headline */}
          <div>
            <div className="font-mono text-[10px] font-bold uppercase tracking-control text-muted">
              open source
            </div>
            <h2 className="mt-4 font-display text-[36px] font-bold leading-[1.0] tracking-display text-foreground sm:text-[52px] lg:text-[64px]">
              <span className="block">Every star</span>
              <span className="block">helps a developer</span>
              <span className="block text-accent">find this.</span>
            </h2>
            <p className="mt-6 max-w-sm text-[14px] leading-relaxed text-secondary">
              Sentiph is free, MIT licensed, and built in the open. No accounts, no
              telemetry, no paywalls.
            </p>
          </div>

          {/* CTA + stats */}
          <div className="flex flex-col items-start gap-8 lg:items-end">
            <a
              href="https://github.com/josephg29/sentiph"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 items-center gap-3 border border-foreground bg-foreground px-6 font-mono text-[11px] font-bold uppercase tracking-control text-canvas transition-colors hover:bg-transparent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1"
            >
              <Star className="size-4 fill-current" aria-hidden />
              star on github
            </a>

            <dl className="flex flex-wrap gap-x-8 gap-y-4 lg:justify-end">
              {[
                { dt: "license", dd: "mit" },
                { dt: "language", dd: "typescript" },
                { dt: "runtime", dd: "node 22+" },
                { dt: "requires", dd: "claude code" },
              ].map(({ dt, dd }) => (
                <div key={dt}>
                  <dt className="font-mono text-[9px] font-bold uppercase tracking-control text-muted">
                    {dt}
                  </dt>
                  <dd className="mt-0.5 font-mono text-[12px] font-bold uppercase tracking-control text-secondary">
                    {dd}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}
