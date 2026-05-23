import Image from "next/image";

const SHOTS = [
  {
    src: "/preview_2.jpg",
    alt: "Sentiph deck view showing terminal columns with active Claude Code sessions",
    label: "deck",
    detail: "active terminals side by side",
  },
  {
    src: "/preview_3.jpg",
    alt: "Sentiph swarm mode with multiple agent workers running in parallel",
    label: "swarm",
    detail: "agents working in parallel",
  },
  {
    src: "/preview_4.jpg",
    alt: "Tentacle context panel showing todo list and context files",
    label: "tentacle panel",
    detail: "todo and context",
  },
  {
    src: "/preview_5.jpg",
    alt: "Sentiph orchestrator coordinating child agent sessions",
    label: "orchestrator",
    detail: "one parent, many workers",
  },
  {
    src: "/preview_6.jpg",
    alt: "Sentiph inter-agent messaging view",
    label: "messaging",
    detail: "workers report back",
  },
];

function TerminalChrome({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-border-strong bg-surface-2 px-3.5 py-2">
      <span className="h-2 w-2 rounded-full bg-[#ff5f57]" aria-hidden />
      <span className="h-2 w-2 rounded-full bg-[#febc2e]" aria-hidden />
      <span className="h-2 w-2 rounded-full bg-[#28c840]" aria-hidden />
      <span className="ml-3 font-mono text-[9px] font-bold uppercase tracking-control text-muted">
        {label}
      </span>
    </div>
  );
}

export function Screenshots() {
  const [featured, ...rest] = SHOTS;

  return (
    <section id="screenshots" className="border-t border-border-subtle bg-surface-1">
      <div className="mx-auto max-w-5xl px-5 py-20 sm:px-6 sm:py-28">
        <div className="mb-14">
          <div className="font-mono text-[10px] font-bold uppercase tracking-control text-muted">
            the workspace
          </div>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-display text-foreground sm:text-4xl">
            See it in action.
          </h2>
        </div>

        {/* Featured */}
        <div className="relative overflow-hidden border border-border-strong shadow-xl">
          <TerminalChrome label={`sentiph · ${featured.label} — ${featured.detail}`} />
          <div className="relative w-full" style={{ aspectRatio: "16/10" }}>
            <Image
              src={featured.src}
              alt={featured.alt}
              fill
              className="object-cover object-top"
              sizes="(max-width: 1280px) 100vw, 1024px"
            />
          </div>
        </div>

        {/* Gallery: asymmetric 2+2 */}
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {rest.map((shot) => (
            <div key={shot.src} className="overflow-hidden border border-border-strong">
              <TerminalChrome label={shot.label} />
              <div className="relative w-full" style={{ aspectRatio: "4/3" }}>
                <Image
                  src={shot.src}
                  alt={shot.alt}
                  fill
                  className="object-cover object-top"
                  sizes="(max-width: 640px) 50vw, (max-width: 1280px) 25vw, 256px"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
