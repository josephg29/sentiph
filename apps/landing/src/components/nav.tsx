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
    <header className="sticky top-0 z-40 w-full border-b border-border-subtle bg-canvas/80 backdrop-blur-md">
      <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-5 sm:px-6">
        <a href="#top" className="flex items-center gap-2.5" aria-label="Sentiph home">
          <SentiphMark scale={1.5} />
          <span className="text-[11px] font-bold uppercase tracking-control text-foreground">
            sentiph
          </span>
        </a>

        <div className="flex items-center gap-3">
          <a
            href="https://github.com/josephg29/sentiph/blob/main/README.md"
            target="_blank"
            rel="noreferrer"
            className="hidden items-center gap-1.5 text-[11px] font-bold uppercase tracking-control text-secondary transition-colors hover:text-foreground sm:inline-flex"
          >
            docs
          </a>

          <a
            href="https://github.com/josephg29/sentiph"
            target="_blank"
            rel="noreferrer"
            aria-label="Star Sentiph on GitHub"
            className="inline-flex h-8 items-center gap-2 border border-foreground bg-foreground px-3 text-[10px] font-bold uppercase tracking-control text-canvas transition-colors hover:border-neutral-700 hover:bg-neutral-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground focus-visible:ring-offset-1 focus-visible:ring-offset-canvas"
          >
            <Star className="size-3 fill-current" aria-hidden />
            <span>star</span>
            {stars !== null && (
              <span className="border-l border-canvas/20 pl-2 tabular-nums">
                {stars.toLocaleString()}
              </span>
            )}
          </a>
        </div>
      </div>
    </header>
  );
}
