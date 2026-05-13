import { cn } from "@/lib/utils";

// Sprite mirrored from apps/web/src/components/EmptyOctopus.tsx (normal expression,
// neutral tentacles). 16 columns × 14 rows. Each glyph = one cell:
//   ' ' transparent · '#' outline · '@' body · 'o' eye
const SPRITE = [
  "    ########    ",
  "   #@@@@@@@@#   ",
  "  #@@@@@@@@@@#  ",
  " #@@@@@@@@@@@@# ",
  " #@@oo@@@@oo@@# ",
  " #@@oo@@@@oo@@# ",
  " #@@@@@@@@@@@@# ",
  " #@@@@@@@@@@@@# ",
  " #@@@@@@@@@@@@# ",
  " #@@@@@@@@@@@@# ",
  " #@@# #@@# #@@# ",
  " #@@# #@@# #@@# ",
  " #@@# #@@# #@@# ",
  "  ##   ##   ##  ",
] as const;

const SPRITE_W = 16;
const SPRITE_H = SPRITE.length;

export interface PixelOctopusProps {
  scale?: number;
  bodyColor?: string;
  outlineColor?: string;
  className?: string;
  title?: string;
}

export function PixelOctopus({
  scale = 4,
  bodyColor = "var(--term-red)",
  outlineColor = "#111",
  className,
  title,
}: PixelOctopusProps) {
  const cells: React.ReactElement[] = [];
  for (let y = 0; y < SPRITE_H; y++) {
    const row = SPRITE[y];
    if (!row) continue;
    for (let x = 0; x < SPRITE_W; x++) {
      const ch = row[x];
      if (ch === " ") continue;
      const fill = ch === "@" ? bodyColor : outlineColor;
      cells.push(
        <rect
          key={`${x}-${y}`}
          x={x * scale}
          y={y * scale}
          width={scale}
          height={scale}
          fill={fill}
        />,
      );
    }
  }

  return (
    <svg
      width={SPRITE_W * scale}
      height={SPRITE_H * scale}
      viewBox={`0 0 ${SPRITE_W * scale} ${SPRITE_H * scale}`}
      shapeRendering="crispEdges"
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn("block", className)}
    >
      {cells}
    </svg>
  );
}
