import Image from "next/image";

const SHOTS = [
  {
    src: "/preview_2.jpg",
    alt: "Sentiph deck view showing terminal columns with active Claude Code sessions",
    label: "deck · active terminals side by side",
  },
  {
    src: "/preview_3.jpg",
    alt: "Sentiph swarm mode with multiple agent workers running in parallel",
    label: "swarm · agents working in parallel",
  },
  {
    src: "/preview_4.jpg",
    alt: "Tentacle context panel showing todo list and context files",
    label: "tentacle panel · todo and context",
  },
  {
    src: "/preview_5.jpg",
    alt: "Sentiph orchestrator coordinating child agent sessions",
    label: "orchestrator · one parent, many workers",
  },
  {
    src: "/preview_6.jpg",
    alt: "Sentiph inter-agent messaging view",
    label: "messaging · workers report back",
  },
];

export function Screenshots() {
  const [featured, ...rest] = SHOTS;

  return (
    <section id="screenshots" className="border-t border-border-subtle bg-surface-1">
      <div className="mx-auto max-w-5xl px-5 py-20 sm:px-6 sm:py-24">
        <div className="mb-10 text-center sm:mb-12">
          <div className="text-[10px] font-bold uppercase tracking-control text-muted">
            the workspace
          </div>
          <h2 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">
            see it in action.
          </h2>
        </div>

        {/* Featured screenshot */}
        <div className="overflow-hidden border border-border-strong shadow-md">
          <div className="flex items-center gap-2 border-b border-border-strong bg-surface-2 px-3.5 py-2.5">
            <span className="h-2 w-2 rounded-full bg-[#ff5f57]" aria-hidden />
            <span className="h-2 w-2 rounded-full bg-[#febc2e]" aria-hidden />
            <span className="h-2 w-2 rounded-full bg-[#28c840]" aria-hidden />
            <span className="ml-3 text-[10px] font-bold uppercase tracking-control text-muted">
              {featured.label}
            </span>
          </div>
          <div className="relative w-full" style={{ aspectRatio: "16/10" }}>
            <Image
              src={featured.src}
              alt={featured.alt}
              fill
              className="object-cover object-top"
              sizes="(max-width: 1280px) 100vw, 1280px"
            />
          </div>
        </div>

        {/* 4-column grid */}
        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {rest.map((shot) => (
            <div key={shot.src} className="overflow-hidden border border-border-strong">
              <div className="flex items-center gap-1.5 border-b border-border-strong bg-surface-2 px-2.5 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-border-strong/40" aria-hidden />
                <span className="h-1.5 w-1.5 rounded-full bg-border-strong/40" aria-hidden />
                <span className="h-1.5 w-1.5 rounded-full bg-border-strong/40" aria-hidden />
                <span className="ml-1.5 truncate text-[9px] font-bold uppercase tracking-control text-muted">
                  {shot.label.split("·")[0]?.trim()}
                </span>
              </div>
              <div className="relative w-full" style={{ aspectRatio: "4/3" }}>
                <Image
                  src={shot.src}
                  alt={shot.alt}
                  fill
                  className="object-cover object-top"
                  sizes="(max-width: 640px) 50vw, (max-width: 1280px) 25vw, 320px"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
