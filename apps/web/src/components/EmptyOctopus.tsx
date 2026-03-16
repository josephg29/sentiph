import { useEffect, useRef } from "react";

/*
 * Pixel-art octopus rendered via Canvas 2D.
 * Shape based on classic pixel ghost/invader: outlined dome, square eyes,
 * jagged 3-tooth tentacle bottom.
 *
 * Sprite is 14 × 15 pixels, drawn at SCALE px per pixel.
 */

const SCALE = 14; // CSS pixels per sprite pixel

const B = "B"; // body (accent fill)
const O = "O"; // outline (dark)
const E = "E"; // eye (dark)
const _ = ""; // transparent

// Full body — outlined dome with square eyes, jagged bottom with 3 teeth.
// prettier-ignore
const HEAD: string[][] = [
  [_,_,_,_,O,O,O,O,O,O,_,_,_,_], // 0
  [_,_,_,O,B,B,B,B,B,B,O,_,_,_], // 1
  [_,_,O,B,B,B,B,B,B,B,B,O,_,_], // 2
  [_,O,B,B,B,B,B,B,B,B,B,B,O,_], // 3
  [_,O,B,E,E,B,B,B,B,E,E,B,O,_], // 4  eyes
  [_,O,B,E,E,B,B,B,B,E,E,B,O,_], // 5  eyes
  [_,O,B,B,B,B,B,B,B,B,B,B,O,_], // 6
  [_,O,B,B,B,B,B,B,B,B,B,B,O,_], // 7
  [_,O,B,B,B,B,B,B,B,B,B,B,O,_], // 8
  [_,O,B,B,B,B,B,B,B,B,B,B,O,_], // 9
];

// Static tentacle split — always drawn.
// prettier-ignore
const TENTACLE_TOP: string[][] = [
  [_,O,B,B,O,O,B,B,O,O,B,B,O,_], // 10  three equal splits
];

// 3-tooth rectangular bottom — neutral (square ghost-style bumps).
// prettier-ignore
const TAIL_NEUTRAL: string[][] = [
  [_,O,B,B,O,O,B,B,O,O,B,B,O,_], // 11
  [_,O,B,B,O,O,B,B,O,O,B,B,O,_], // 12
  [_,_,O,O,_,_,O,O,_,_,O,O,_,_], // 13  bottom caps
];

// prettier-ignore
const TAIL_RIGHT: string[][] = [
  [_,_,O,B,B,O,O,B,B,O,O,B,B,O], // 11  shifted right
  [_,_,O,B,B,O,O,B,B,O,O,B,B,O], // 12
  [_,_,_,O,O,_,_,O,O,_,_,O,O,_], // 13
];

// prettier-ignore
const TAIL_LEFT: string[][] = [
  [O,B,B,O,O,B,B,O,O,B,B,O,_,_], // 11  shifted left
  [O,B,B,O,O,B,B,O,O,B,B,O,_,_], // 12
  [_,O,O,_,_,O,O,_,_,O,O,_,_,_], // 13
];

// center → right → center → left → repeat
const TAIL_FRAMES = [TAIL_NEUTRAL, TAIL_RIGHT, TAIL_NEUTRAL, TAIL_LEFT];
const FRAME_MS = 350;

const SPRITE_W = 14;
const SPRITE_H = HEAD.length + TENTACLE_TOP.length + TAIL_NEUTRAL.length;

function drawSprite(
  ctx: CanvasRenderingContext2D,
  accentColor: string,
  tailFrame: string[][],
) {
  ctx.clearRect(0, 0, SPRITE_W * SCALE, SPRITE_H * SCALE);

  const layers = [...HEAD, ...TENTACLE_TOP, ...tailFrame];
  for (let y = 0; y < layers.length; y++) {
    const row = layers[y]!;
    for (let x = 0; x < row.length; x++) {
      const cell = row[x];
      if (!cell) continue;
      ctx.fillStyle =
        cell === E || cell === O ? "#000000" : accentColor;
      ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
    }
  }
}

type OctopusGlyphProps = {
  animated?: boolean;
  className?: string;
  color?: string;
  testId?: string;
};

export const OctopusGlyph = ({ animated = true, className, color, testId }: OctopusGlyphProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;

    const accentColor =
      color ??
      (getComputedStyle(document.documentElement)
        .getPropertyValue("--accent-primary")
        .trim() || "#d4a017");

    drawSprite(ctx, accentColor, TAIL_FRAMES[frameRef.current]!);

    if (!animated) return;

    const id = setInterval(() => {
      frameRef.current = (frameRef.current + 1) % TAIL_FRAMES.length;
      drawSprite(ctx, accentColor, TAIL_FRAMES[frameRef.current]!);
    }, FRAME_MS);

    return () => clearInterval(id);
  }, [animated, color]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      width={SPRITE_W * SCALE}
      height={SPRITE_H * SCALE}
      data-testid={testId}
      aria-hidden="true"
    />
  );
};

export const EmptyOctopus = () => {
  return <OctopusGlyph className="octopus-svg" testId="empty-octopus" />;
};
