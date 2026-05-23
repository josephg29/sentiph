import { Star } from "lucide-react";
import { SentiphMark } from "@/components/sentiph-mark";

async function getStarCount(): Promise<number | null> {
  try {
    const res = await fetch("https://api.github.com/repos/josephg29/sentiph", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { stargazers_count: number };
    return data.stargazers_count;
  } catch {
    return null;
  }
}

export async function Nav() {
  const stars = await getStarCount();

  return (
    <header className="fixed left-0 right-0 top-0 z-50 flex justify-center px-4 pt-3">
      <nav
        aria-label="Main navigation"
        className="flex w-full max-w-4xl items-center justify-between border border-border-mid bg-canvas/90 px-4 py-2 backdrop-blur-sm"
      >
        <a href="#top" className="flex items-center gap-2.5" aria-label="Sentiph home">
          <SentiphMark scale={1.5} />
          <span className="text-[11px] font-bold uppercase tracking-control text-foreground">
            sentiph
          </span>
        </a>

        <div className="flex items-center gap-4">
          <a
            href="https://github.com/josephg29/sentiph/blob/main/README.md"
            target="_blank"
            rel="noreferrer"
            className="hidden border-b border-transparent text-[10px] font-bold uppercase tracking-control text-secondary transition-colors hover:border-secondary hover:text-foreground sm:block"
          >
            docs
          </a>

          <a
            href="https://github.com/josephg29/sentiph"
            target="_blank"
            rel="noreferrer"
            aria-label={`Star Sentiph on GitHub${stars !== null ? ` — ${stars.toLocaleString()} stars` : ""}`}
            className="inline-flex h-7 items-center gap-1.5 border border-foreground bg-foreground px-3 text-[10px] font-bold uppercase tracking-control text-canvas transition-colors hover:bg-transparent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            <Star className="size-3 fill-current" aria-hidden />
            <span>star</span>
            {stars !== null && (
              <span className="opacity-50 tabular-nums">{stars.toLocaleString()}</span>
            )}
          </a>
        </div>
      </nav>
    </header>
  );
}
