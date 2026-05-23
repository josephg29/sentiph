import Image from "next/image";

const SHOTS = [
  {
    src: "/preview_2.jpg",
    alt: "Sentiph deck view showing options to create a session or open an agent",
    label: "deck",
  },
  {
    src: "/preview_3.jpg",
    alt: "Sentiph activity view showing Claude token usage charts and GitHub commits",
    label: "activity",
  },
  {
    src: "/preview_6.jpg",
    alt: "Sentiph observe view showing per-agent success rates and time distribution",
    label: "observe",
  },
  {
    src: "/preview_4.jpg",
    alt: "Sentiph code intel view tracking files edited by agents",
    label: "code intel",
  },
];

function TerminalChrome({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-border-strong bg-surface-2 px-3.5 py-2">
      <span className="h-2 w-2 rounded-full bg-[#ff5f57]" aria-hidden />
      <span className="h-2 w-2 rounded-full bg-[#febc2e]" aria-hidden />
      <span className="h-2 w-2 rounded-full bg-[#28c840]" aria-hidden />
      <span className="ml-3 text-[9px] font-bold uppercase tracking-control text-secondary">
        sentiph · {label}
      </span>
    </div>
  );
}

export function Screenshots() {
  const [featured, ...rest] = SHOTS;

  return (
    <section id="screenshots" className="border-t border-border-mid bg-surface-1">
      <div className="mx-auto max-w-5xl px-5 py-16 sm:px-6 sm:py-24">
        <div className="mb-12">
          <div className="text-[10px] font-bold uppercase tracking-control text-muted">
            the workspace
          </div>
          <h2 className="mt-2 text-2xl font-bold tracking-control text-foreground sm:text-3xl">
            See it in action.
          </h2>
        </div>

        <div className="overflow-hidden border border-border-strong shadow-sm">
          <TerminalChrome label={featured.label} />
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

        <div className="mt-2 grid grid-cols-3 gap-2">
          {rest.map((shot) => (
            <div key={shot.src} className="overflow-hidden border border-border-strong">
              <TerminalChrome label={shot.label} />
              <div className="relative w-full" style={{ aspectRatio: "4/3" }}>
                <Image
                  src={shot.src}
                  alt={shot.alt}
                  fill
                  className="object-cover object-top"
                  sizes="(max-width: 640px) 100vw, (max-width: 1280px) 33vw, 340px"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
