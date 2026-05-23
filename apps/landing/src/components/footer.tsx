import { SentiphMark } from "@/components/sentiph-mark";

const LINKS: Array<{ label: string; href: string }> = [
  { label: "github", href: "https://github.com/josephg29/sentiph" },
  { label: "docs", href: "https://github.com/josephg29/sentiph/blob/main/README.md" },
  { label: "license", href: "https://github.com/josephg29/sentiph/blob/main/LICENSE" },
  { label: "issues", href: "https://github.com/josephg29/sentiph/issues" },
];

export function Footer() {
  return (
    <footer className="border-t border-border-mid">
      <div className="mx-auto max-w-5xl px-5 py-7 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
          <a href="#top" className="flex items-center gap-2.5" aria-label="Sentiph home">
            <SentiphMark scale={1.5} />
            <span className="text-[11px] font-bold uppercase tracking-control text-muted">
              sentiph
            </span>
          </a>

          <nav aria-label="Footer links" className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-bold uppercase tracking-control text-muted transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
