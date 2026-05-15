import { OctogentMark } from "@/components/octogent-mark";

const LINKS: Array<{ label: string; href: string; external?: boolean }> = [
  { label: "github", href: "https://github.com/josephg29/octogent-sentiph", external: true },
  { label: "docs", href: "https://github.com/josephg29/octogent-sentiph#docs", external: true },
  { label: "mit", href: "https://github.com/josephg29/octogent-sentiph/blob/main/LICENSE", external: true },
];

export function Footer() {
  return (
    <footer className="border-t border-border-subtle">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-5 py-8 sm:px-6">
        <div className="flex items-center gap-2.5">
          <OctogentMark scale={1.5} />
          <span className="text-[11px] font-bold uppercase tracking-control text-foreground">
            sentiph
          </span>
          <span className="hidden text-[11px] uppercase tracking-control text-muted sm:inline">
            · too many terminals, not enough tentacles
          </span>
        </div>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              {...(link.external ? { target: "_blank", rel: "noreferrer" } : {})}
              className="text-[11px] font-bold uppercase tracking-control text-secondary transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
