import { useEffect, useRef } from "react";

/*
 * Pixel-art octopus rendered via Canvas 2D.
 * Shape based on classic pixel ghost/invader: outlined dome, square eyes,
 * jagged 3-tooth tentacle bottom.
 *
 * Sprite is 16 × 14 pixels, drawn at SCALE px per pixel.
 */

const SCALE = 14; // CSS pixels per sprite pixel

const B = "B"; // body (accent fill)
const O = "O"; // outline (dark)
const E = "E"; // eye (dark)
const _ = ""; // transparent

// Full body — outlined dome with square eyes, jagged bottom with 3 teeth.
// prettier-ignore
const HEAD: string[][] = [
  [_,_,_,_,O,O,O,O,O,O,O,O,_,_,_,_], // 0
  [_,_,_,O,B,B,B,B,B,B,B,B,O,_,_,_], // 1
  [_,_,O,B,B,B,B,B,B,B,B,B,B,O,_,_], // 2
  [_,O,B,B,B,B,B,B,B,B,B,B,B,B,O,_], // 3
  [_,O,B,B,E,E,B,B,B,B,E,E,B,B,O,_], // 4  eyes
  [_,O,B,B,E,E,B,B,B,B,E,E,B,B,O,_], // 5  eyes
  [_,O,B,B,B,B,B,B,B,B,B,B,B,B,O,_], // 6
  [_,O,B,B,B,B,B,B,B,B,B,B,B,B,O,_], // 7
  [_,O,B,B,B,B,B,B,B,B,B,B,B,B,O,_], // 8
  [_,O,B,B,B,B,B,B,B,B,B,B,B,B,O,_], // 9
];

// Static tentacle split — always drawn.
// prettier-ignore
const TENTACLE_TOP: string[][] = [
  [_,O,B,B,O,_,O,B,B,O,_,O,B,B,O,_], // 10  three equal splits
];

// 3-tooth rectangular bottom — neutral (square ghost-style bumps).
// prettier-ignore
const TAIL_NEUTRAL: string[][] = [
  [_,O,B,B,O,_,O,B,B,O,_,O,B,B,O,_], // 11
  [_,O,B,B,O,_,O,B,B,O,_,O,B,B,O,_], // 12
  [_,_,O,O,_,_,_,O,O,_,_,_,O,O,_,_], // 13  bottom caps
];

// Legs bend right — top row stays anchored, lower rows shift 1px right.
// prettier-ignore
const TAIL_RIGHT: string[][] = [
  [_,O,B,B,O,_,O,B,B,O,_,O,B,B,O,_], // 11  straight (pivot)
  [_,_,O,B,B,O,_,O,B,B,O,_,O,B,B,O], // 12  bent 1px right
  [_,_,_,O,O,_,_,_,O,O,_,_,_,O,O,_], // 13  caps follow bend
];

// Legs bend left — top row stays anchored, lower rows shift 1px left.
// prettier-ignore
const TAIL_LEFT: string[][] = [
  [_,O,B,B,O,_,O,B,B,O,_,O,B,B,O,_], // 11  straight (pivot)
  [O,B,B,O,_,O,B,B,O,_,O,B,B,O,_,_], // 12  bent 1px left
  [_,O,O,_,_,_,O,O,_,_,_,O,O,_,_,_], // 13  caps follow bend
];

// Sway: center → right → center → left → repeat
const SWAY_FRAMES = [TAIL_NEUTRAL, TAIL_RIGHT, TAIL_NEUTRAL, TAIL_LEFT];

// Walk-up: all three legs extend and retract in unison.
// short (1 row + cap) → medium (2 rows + cap) → extended (3 rows + cap) → medium → repeat

// Frame 0 — all legs short
// prettier-ignore
const WALKUP_0: string[][] = [
  [_,O,B,B,O,_,O,B,B,O,_,O,B,B,O,_], // 10  all start
  [_,_,O,O,_,_,_,O,O,_,_,_,O,O,_,_], // 11  all cap
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_], // 12  empty
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_], // 13  empty
];
// Frame 1 — all legs medium
// prettier-ignore
const WALKUP_1: string[][] = [
  [_,O,B,B,O,_,O,B,B,O,_,O,B,B,O,_], // 10  all start
  [_,O,B,B,O,_,O,B,B,O,_,O,B,B,O,_], // 11  all continue
  [_,_,O,O,_,_,_,O,O,_,_,_,O,O,_,_], // 12  all cap
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_], // 13  empty
];
// Frame 2 — all legs extended
// prettier-ignore
const WALKUP_2: string[][] = [
  [_,O,B,B,O,_,O,B,B,O,_,O,B,B,O,_], // 10  all start
  [_,O,B,B,O,_,O,B,B,O,_,O,B,B,O,_], // 11  all continue
  [_,O,B,B,O,_,O,B,B,O,_,O,B,B,O,_], // 12  all continue
  [_,_,O,O,_,_,_,O,O,_,_,_,O,O,_,_], // 13  all cap
];
// Frame 3 — all legs medium (same as 1)
// prettier-ignore
const WALKUP_3: string[][] = [
  [_,O,B,B,O,_,O,B,B,O,_,O,B,B,O,_], // 10  all start
  [_,O,B,B,O,_,O,B,B,O,_,O,B,B,O,_], // 11  all continue
  [_,_,O,O,_,_,_,O,O,_,_,_,O,O,_,_], // 12  all cap
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_], // 13  empty
];
const WALKUP_FRAMES = [WALKUP_0, WALKUP_1, WALKUP_2, WALKUP_3];

// Walk: alternating leg extension — outer pair pushes while middle retracts, then swap.

// Frame 0 — all legs medium (transition)
// prettier-ignore
const WALK_0: string[][] = [
  [_,O,B,B,O,_,O,B,B,O,_,O,B,B,O,_], // 10  all start
  [_,O,B,B,O,_,O,B,B,O,_,O,B,B,O,_], // 11  all continue
  [_,_,O,O,_,_,_,O,O,_,_,_,O,O,_,_], // 12  all cap
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_], // 13  empty
];
// Frame 1 — outer legs extended, middle retracted
// prettier-ignore
const WALK_1: string[][] = [
  [_,O,B,B,O,_,O,B,B,O,_,O,B,B,O,_], // 10  all start
  [_,O,B,B,O,_,_,O,O,_,_,O,B,B,O,_], // 11  L/R continue, M caps
  [_,O,B,B,O,_,_,_,_,_,_,O,B,B,O,_], // 12  L/R continue
  [_,_,O,O,_,_,_,_,_,_,_,_,O,O,_,_], // 13  L/R cap
];
// Frame 2 — all legs medium (transition)
// prettier-ignore
const WALK_2: string[][] = [
  [_,O,B,B,O,_,O,B,B,O,_,O,B,B,O,_], // 10  all start
  [_,O,B,B,O,_,O,B,B,O,_,O,B,B,O,_], // 11  all continue
  [_,_,O,O,_,_,_,O,O,_,_,_,O,O,_,_], // 12  all cap
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_], // 13  empty
];
// Frame 3 — middle extended, outer legs retracted
// prettier-ignore
const WALK_3: string[][] = [
  [_,O,B,B,O,_,O,B,B,O,_,O,B,B,O,_], // 10  all start
  [_,_,O,O,_,_,O,B,B,O,_,_,O,O,_,_], // 11  L/R cap, M continues
  [_,_,_,_,_,_,O,B,B,O,_,_,_,_,_,_], // 12  M continues
  [_,_,_,_,_,_,_,O,O,_,_,_,_,_,_,_], // 13  M cap
];
const WALK_FRAMES = [WALK_0, WALK_1, WALK_2, WALK_3];

const WALK_FRAME_MS = 220;
const SWAY_FRAME_MS = 350;

const SPRITE_W = 16;
const SPRITE_H = HEAD.length + TENTACLE_TOP.length + TAIL_NEUTRAL.length;

type SpriteFrame = {
  /** Rows to draw below the HEAD. Sway = TENTACLE_TOP + tail, walk = combined 4-row block. */
  bottom: string[][];
};

function drawSprite(
  ctx: CanvasRenderingContext2D,
  accentColor: string,
  frame: SpriteFrame,
) {
  ctx.clearRect(0, 0, SPRITE_W * SCALE, SPRITE_H * SCALE);

  const layers = [...HEAD, ...frame.bottom];
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

function buildFrameSequence(animation: OctopusAnimation): SpriteFrame[] {
  if (animation === "walk") {
    return WALKUP_FRAMES.map((bottom) => ({ bottom }));
  }
  if (animation === "walk-up") {
    return WALK_FRAMES.map((bottom) => ({ bottom }));
  }
  return SWAY_FRAMES.map((tail) => ({ bottom: [...TENTACLE_TOP, ...tail] }));
}

function animationFrameMs(animation: OctopusAnimation): number {
  if (animation === "walk" || animation === "walk-up") return WALK_FRAME_MS;
  return SWAY_FRAME_MS;
}

const IDLE_FRAME: SpriteFrame = { bottom: [...TENTACLE_TOP, ...TAIL_NEUTRAL] };

type OctopusAnimation = "idle" | "sway" | "walk" | "walk-up";

type OctopusGlyphProps = {
  animation?: OctopusAnimation;
  className?: string;
  color?: string;
  testId?: string;
};

export const OctopusGlyph = ({ animation = "sway", className, color, testId }: OctopusGlyphProps) => {
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

    if (animation === "idle") {
      frameRef.current = 0;
      drawSprite(ctx, accentColor, IDLE_FRAME);
      return;
    }

    const frames = buildFrameSequence(animation);
    const ms = animationFrameMs(animation);
    frameRef.current = 0;
    drawSprite(ctx, accentColor, frames[0]!);

    const id = setInterval(() => {
      frameRef.current = (frameRef.current + 1) % frames.length;
      drawSprite(ctx, accentColor, frames[frameRef.current]!);
    }, ms);

    return () => clearInterval(id);
  }, [animation, color]);

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
