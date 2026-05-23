import { Star } from "lucide-react";
import { SentiphMark } from "@/components/sentiph-mark";

const LINKS: Array<{ label: string; href: string; external?: boolean }> = [
  { label: "github", href: "https://github.com/josephg29/sentiph", external: true },
  { label: "docs", href: "https://github.com/josephg29/sentiph/blob/main/README.md", external: true },
  { label: "mit", href: "https://github.com/josephg29/sentiph/blob/main/LICENSE", external: true },
  { label: "issues", href: "https://github.com/josephg29/sentiph/issues", external: true },
];

export function Footer() {
  return (
    <footer className="border-t border-border-subtle">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5">
            <SentiphMark scale={1.5} />
            <div>
              <span className="text-[11px] font-bold uppercase tracking-control text-foreground">
                sentiph
              </span>
              <span className="ml-2 hidden text-[11px] uppercase tracking-control text-muted sm:inline">
                · too many terminals, not enough tentacles
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
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

            <a
              href="https://github.com/josephg29/sentiph"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-7 items-center gap-1.5 border border-foreground bg-foreground px-2.5 text-[10px] font-bold uppercase tracking-control text-canvas transition-colors hover:border-neutral-700 hover:bg-neutral-700"
            >
              <Star className="size-2.5 fill-current" aria-hidden />
              star
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
