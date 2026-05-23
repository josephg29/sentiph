import { Star } from "lucide-react";

export function StarCta() {
  return (
    <section
      className="border-t border-border-strong"
      style={{ background: "var(--term-bg)" }}
    >
      <div className="mx-auto max-w-5xl px-5 py-20 sm:px-6 sm:py-28">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
          {/* Headline */}
          <div>
            <div
              className="text-[10px] font-bold uppercase tracking-control"
              style={{ color: "#555" }}
            >
              open source
            </div>
            <h2
              className="mt-3 text-[34px] font-bold leading-[1.05] tracking-control sm:text-[48px] lg:text-[56px]"
              style={{ color: "#fafafa" }}
            >
              <span className="block">Every star helps</span>
              <span className="block">a developer find this.</span>
            </h2>
            <p
              className="mt-5 max-w-sm text-[13.5px] leading-relaxed"
              style={{ color: "#888" }}
            >
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
              className="inline-flex h-11 items-center gap-2.5 px-6 text-[11px] font-bold uppercase tracking-control transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{
                background: "#fafafa",
                color: "#111",
                border: "1px solid #fafafa",
              }}
            >
              <Star className="size-3.5 fill-current" aria-hidden />
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
                  <dt className="text-[9px] font-bold uppercase tracking-control" style={{ color: "#444" }}>
                    {dt}
                  </dt>
                  <dd className="mt-0.5 text-[12px] font-bold uppercase tracking-control" style={{ color: "#888" }}>
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
