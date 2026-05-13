import { Github } from "lucide-react";
import { OctogentMark } from "@/components/octogent-mark";

export function Nav() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border-subtle bg-canvas/80 backdrop-blur-md">
      <div className="mx-auto flex h-12 max-w-3xl items-center justify-between px-5 sm:px-6">
        <a href="#top" className="flex items-center gap-2.5" aria-label="Octogent home">
          <OctogentMark scale={1.5} />
          <span className="text-[11px] font-bold uppercase tracking-control text-foreground">
            octogent
          </span>
        </a>

        <a
          href="https://github.com/hesamsheikh/octogent"
          target="_blank"
          rel="noreferrer"
          aria-label="Octogent on GitHub"
          className="inline-flex h-8 items-center gap-1.5 px-2 text-[11px] font-bold uppercase tracking-control text-secondary transition-colors hover:text-foreground"
        >
          <Github className="size-3.5" />
          github
        </a>
      </div>
    </header>
  );
}
