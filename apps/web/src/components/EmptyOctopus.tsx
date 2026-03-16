import { useEffect, useRef } from "react";

/*
 * Pixel-art octopus rendered via Canvas 2D.
 * Shape based on classic pixel ghost/invader: outlined dome, square eyes,
 * jagged 3-tooth tentacle bottom.
 *
 * Sprite is 16 × 14 pixels. Canvas height is padded by BOUNCE_PAD rows
 * so bounce/float animations have vertical room without clipping.
 */

const DEFAULT_SCALE = 14; // CSS pixels per sprite pixel
const BOUNCE_PAD = 2; // extra canvas rows reserved for vertical animations
// Extra rows above the sprite for sleepy ZZZ overlay (transparent for all other expressions).
const TOP_PAD = 4;
const ZZZ_COLOR = "#7ec8e3"; // soft sky-blue for the floating z glyphs

const B = "B"; // body (accent fill)
const O = "O"; // outline (dark)
const E = "E"; // eye (dark)
const _ = ""; // transparent

// ─── HEAD construction ───────────────────────────────────────────────────────
// Rows 0-2 and 6-9 are identical across all expressions.
// Rows 3-5 carry the expression detail; buildHead() assembles the full array.

// prettier-ignore
const HEAD_TOP: string[][] = [
  [_,_,_,_,O,O,O,O,O,O,O,O,_,_,_,_], // 0
  [_,_,_,O,B,B,B,B,B,B,B,B,O,_,_,_], // 1
  [_,_,O,B,B,B,B,B,B,B,B,B,B,O,_,_], // 2
];

// Angry variant — outer brow pixel at col 4 (left) and col 11 (right) in row 2.
// Combined with FACE_ANGRY row 3 inner pixels (col 5 / col 10), this forms a
// diagonal V-slash brow: outer-high → inner-low on each side.
// prettier-ignore
const HEAD_TOP_ANGRY: string[][] = [
  [_,_,_,_,O,O,O,O,O,O,O,O,_,_,_,_], // 0
  [_,_,_,O,B,B,B,B,B,B,B,B,O,_,_,_], // 1
  [_,_,O,B,O,B,B,B,B,B,B,O,B,O,_,_], // 2  cols 4 and 11 → outer brow start
];

// prettier-ignore
const HEAD_BODY: string[][] = [
  [_,O,B,B,B,B,B,B,B,B,B,B,B,B,O,_], // 6
  [_,O,B,B,B,B,B,B,B,B,B,B,B,B,O,_], // 7
  [_,O,B,B,B,B,B,B,B,B,B,B,B,B,O,_], // 8
  [_,O,B,B,B,B,B,B,B,B,B,B,B,B,O,_], // 9
];

// Normal — 2×2 square eyes (rows 4-5).
// prettier-ignore
const FACE_NORMAL: string[][] = [
  [_,O,B,B,B,B,B,B,B,B,B,B,B,B,O,_], // 3
  [_,O,B,B,E,E,B,B,B,B,E,E,B,B,O,_], // 4  eyes
  [_,O,B,B,E,E,B,B,B,B,E,E,B,B,O,_], // 5  eyes
];

// Happy — squinted eyes (crescent: only top eye row visible, bottom cleared).
// prettier-ignore
const FACE_HAPPY: string[][] = [
  [_,O,B,B,B,B,B,B,B,B,B,B,B,B,O,_], // 3
  [_,O,B,B,E,E,B,B,B,B,E,E,B,B,O,_], // 4  top half of eye
  [_,O,B,B,B,B,B,B,B,B,B,B,B,B,O,_], // 5  clear = squinted
];

// Sleepy — heavy eyelid (solid outline stripe) with tiny pupils peeking below.
// prettier-ignore
const FACE_SLEEPY: string[][] = [
  [_,O,B,B,B,B,B,B,B,B,B,B,B,B,O,_], // 3
  [_,O,B,B,O,O,B,B,B,B,O,O,B,B,O,_], // 4  closed eyelid (outline color)
  [_,O,B,B,E,B,B,B,B,B,B,E,B,B,O,_], // 5  tiny pupils peeking
];

// Angry — brow diagonal continues: outer pixel lands at col 4/11 here too,
// making a 2-pixel-wide brow that reads clearly as a hard scowl.
// prettier-ignore
const FACE_ANGRY: string[][] = [
  [_,O,B,O,O,B,B,B,B,B,B,O,O,B,O,_], // 3  both cols 3-4 left brow and 11-12 right brow
  [_,O,B,B,E,E,B,B,B,B,E,E,B,B,O,_], // 4  eyes
  [_,O,B,B,E,E,B,B,B,B,E,E,B,B,O,_], // 5  eyes
];

// Surprised — eyes extend up into row 3, making them taller (3-row tall eyes).
// prettier-ignore
const FACE_SURPRISED: string[][] = [
  [_,O,B,B,E,E,B,B,B,B,E,E,B,B,O,_], // 3  eyes start early
  [_,O,B,B,E,E,B,B,B,B,E,E,B,B,O,_], // 4  eyes
  [_,O,B,B,E,E,B,B,B,B,E,E,B,B,O,_], // 5  eyes
];

function buildHead(face: string[][], topRows: string[][] = HEAD_TOP): string[][] {
  return [...topRows, ...face, ...HEAD_BODY];
}

// ─── Tentacle / tail variants ────────────────────────────────────────────────

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
const SWAY_FRAMES_TAILS = [TAIL_NEUTRAL, TAIL_RIGHT, TAIL_NEUTRAL, TAIL_LEFT];

// Walk-up: all three legs extend and retract in unison.
// short (1 row + cap) → medium (2 rows + cap) → extended (3 rows + cap) → medium → repeat
// prettier-ignore
const WALKUP_0: string[][] = [
  [_,O,B,B,O,_,O,B,B,O,_,O,B,B,O,_], // 10  all start
  [_,_,O,O,_,_,_,O,O,_,_,_,O,O,_,_], // 11  all cap
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_], // 12  empty
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_], // 13  empty
];
// prettier-ignore
const WALKUP_1: string[][] = [
  [_,O,B,B,O,_,O,B,B,O,_,O,B,B,O,_], // 10  all start
  [_,O,B,B,O,_,O,B,B,O,_,O,B,B,O,_], // 11  all continue
  [_,_,O,O,_,_,_,O,O,_,_,_,O,O,_,_], // 12  all cap
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_], // 13  empty
];
// prettier-ignore
const WALKUP_2: string[][] = [
  [_,O,B,B,O,_,O,B,B,O,_,O,B,B,O,_], // 10  all start
  [_,O,B,B,O,_,O,B,B,O,_,O,B,B,O,_], // 11  all continue
  [_,O,B,B,O,_,O,B,B,O,_,O,B,B,O,_], // 12  all continue
  [_,_,O,O,_,_,_,O,O,_,_,_,O,O,_,_], // 13  all cap
];
// prettier-ignore
const WALKUP_3: string[][] = [
  [_,O,B,B,O,_,O,B,B,O,_,O,B,B,O,_], // 10  all start
  [_,O,B,B,O,_,O,B,B,O,_,O,B,B,O,_], // 11  all continue
  [_,_,O,O,_,_,_,O,O,_,_,_,O,O,_,_], // 12  all cap
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_], // 13  empty
];
const WALKUP_FRAMES = [WALKUP_0, WALKUP_1, WALKUP_2, WALKUP_3];

// ─── Bounce / float types (needed by walk frames below) ─────────────────────

type SpriteFrame = {
  bottom: string[][];
  /** Shift the sprite down by this many pixels (0..BOUNCE_PAD). */
  yOffset?: number;
};

// Walk: lateral stepping — legs bend at a "knee" with feet kicking sideways.
// Outer legs (L/R) oppose the middle leg direction. Body bobs via yOffset.

// Neutral stance — all legs straight down, caps centered.
// prettier-ignore
const WALK_S0: string[][] = [
  [_,O,B,B,O,_,O,B,B,O,_,O,B,B,O,_], // 10  anchor
  [_,O,B,B,O,_,O,B,B,O,_,O,B,B,O,_], // 11  legs straight
  [_,_,O,O,_,_,_,O,O,_,_,_,O,O,_,_], // 12  caps centered
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_], // 13  empty
];

// Outer legs kick right, middle kicks left — knee narrows (OBO), cap follows.
// prettier-ignore
const WALK_S1: string[][] = [
  [_,O,B,B,O,_,O,B,B,O,_,O,B,B,O,_], // 10  anchor
  [_,_,O,B,O,_,O,B,O,_,_,_,O,B,O,_], // 11  bent: L→R, M→L, R→R
  [_,_,_,O,O,_,O,O,_,_,_,_,_,O,O,_], // 12  caps follow bend
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_], // 13  empty
];

// Outer legs kick left, middle kicks right — mirror of S1.
// prettier-ignore
const WALK_S3: string[][] = [
  [_,O,B,B,O,_,O,B,B,O,_,O,B,B,O,_], // 10  anchor
  [_,O,B,O,_,_,_,O,B,O,_,O,B,O,_,_], // 11  bent: L→L, M→R, R→L
  [_,O,O,_,_,_,_,_,O,O,_,O,O,_,_,_], // 12  caps follow bend
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_], // 13  empty
];

const WALK_FRAMES: SpriteFrame[] = [
  { bottom: WALK_S0, yOffset: 1 }, // neutral (dip)
  { bottom: WALK_S1, yOffset: 0 }, // step right
  { bottom: WALK_S0, yOffset: 1 }, // neutral (dip)
  { bottom: WALK_S3, yOffset: 0 }, // step left
];

// ─── Bounce / float animations ───────────────────────────────────────────────
// Canvas height includes BOUNCE_PAD extra rows; yOffset shifts the sprite down
// so it can move upward without clipping. Sequence: squat → rise → apex → fall.

const BOUNCE_STRAIGHT = [...TENTACLE_TOP, ...TAIL_NEUTRAL];

// Crouch — outer legs splay outward (L bends left, R bends right), coiling to jump.
// prettier-ignore
const BOUNCE_CROUCH: string[][] = [
  [_,O,B,B,O,_,O,B,B,O,_,O,B,B,O,_], // 10  anchor
  [_,O,B,O,_,_,O,B,B,O,_,_,O,B,O,_], // 11  L→left, M straight, R→right
  [_,O,O,_,_,_,_,O,O,_,_,_,_,O,O,_], // 12  caps follow splay
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_], // 13  empty
];

// Apex — legs tuck short (retracted), airborne.
// prettier-ignore
const BOUNCE_TUCKED: string[][] = [
  [_,O,B,B,O,_,O,B,B,O,_,O,B,B,O,_], // 10  anchor
  [_,_,O,O,_,_,_,O,O,_,_,_,O,O,_,_], // 11  caps only (short legs)
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_], // 12  empty
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_], // 13  empty
];

const BOUNCE_FRAMES: SpriteFrame[] = [
  { bottom: BOUNCE_CROUCH, yOffset: 2 },    // crouch (splay + low)
  { bottom: BOUNCE_STRAIGHT, yOffset: 1 },  // launch (straighten + rise)
  { bottom: BOUNCE_TUCKED, yOffset: 0 },    // apex (tucked + highest)
  { bottom: BOUNCE_STRAIGHT, yOffset: 1 },  // fall (straight + descend)
];

// Float: slow buoyancy — dwell longer at top and bottom.
const FLOAT_FRAMES: SpriteFrame[] = [
  { bottom: BOUNCE_STRAIGHT, yOffset: 0 },
  { bottom: BOUNCE_STRAIGHT, yOffset: 0 },
  { bottom: BOUNCE_STRAIGHT, yOffset: 1 },
  { bottom: BOUNCE_STRAIGHT, yOffset: 2 },
  { bottom: BOUNCE_STRAIGHT, yOffset: 2 },
  { bottom: BOUNCE_STRAIGHT, yOffset: 1 },
];

// ─── Frame timing ────────────────────────────────────────────────────────────

const WALK_FRAME_MS = 220;
const SWAY_FRAME_MS = 350;
const FLOAT_FRAME_MS = 420;

// ─── Types ───────────────────────────────────────────────────────────────────

const SPRITE_W = 16;
// HEAD_TOP(3) + face(3) + HEAD_BODY(4) + TENTACLE_TOP(1) + TAIL_NEUTRAL(3) = 14
const SPRITE_H = HEAD_TOP.length + FACE_NORMAL.length + HEAD_BODY.length + TENTACLE_TOP.length + TAIL_NEUTRAL.length;

export type OctopusAnimation = "idle" | "sway" | "jog" | "walk-up" | "bounce" | "float";
export type OctopusExpression = "normal" | "happy" | "sleepy" | "angry" | "surprised";

const HEADS: Record<OctopusExpression, string[][]> = {
  normal:    buildHead(FACE_NORMAL),
  happy:     buildHead(FACE_HAPPY),
  sleepy:    buildHead(FACE_SLEEPY),
  angry:     buildHead(FACE_ANGRY, HEAD_TOP_ANGRY),
  surprised: buildHead(FACE_SURPRISED),
};

// ─── Drawing ─────────────────────────────────────────────────────────────────

function drawSprite(
  ctx: CanvasRenderingContext2D,
  accentColor: string,
  frame: SpriteFrame,
  head: string[][],
  scale: number,
  topPad: number,
) {
  ctx.clearRect(0, 0, SPRITE_W * scale, (topPad + SPRITE_H + BOUNCE_PAD) * scale);

  const yOff = (frame.yOffset ?? 0) + topPad;
  const layers = [...head, ...frame.bottom];
  for (let y = 0; y < layers.length; y++) {
    const row = layers[y]!;
    for (let x = 0; x < row.length; x++) {
      const cell = row[x];
      if (!cell) continue;
      ctx.fillStyle = cell === E || cell === O ? "#000000" : accentColor;
      ctx.fillRect(x * scale, (y + yOff) * scale, scale, scale);
    }
  }
}

// Draw floating Z glyphs in the top-pad rows (canvas rows 0..TOP_PAD-1 = rows 0..3).
// zzzPhase 0 → small Z only; zzzPhase 1 → small + medium Z; 2-3 → hidden (blink off).
// Each Z is a proper 3×3 pixel shape: top-bar / center-diagonal / bottom-bar.
function drawZZZ(ctx: CanvasRenderingContext2D, scale: number, zzzPhase: number) {
  if (zzzPhase >= 2) return;

  ctx.fillStyle = ZZZ_COLOR;

  // Small Z — 3×3 at rows 1-3, cols 13-15 (right side, just above the dome).
  // prettier-ignore
  const SMALL_Z: Array<[number, number]> = [
    [13,1],[14,1],[15,1],  // top bar
           [14,2],         // center diagonal pixel
    [13,3],[14,3],[15,3],  // bottom bar
  ];

  // Medium Z — 3×3 at rows 0-2, cols 10-12 (higher and left, trailing-z effect).
  // prettier-ignore
  const MED_Z: Array<[number, number]> = [
    [10,0],[11,0],[12,0],  // top bar
           [11,1],         // center diagonal pixel
    [10,2],[11,2],[12,2],  // bottom bar
  ];

  const pixels = zzzPhase === 0 ? SMALL_Z : [...SMALL_Z, ...MED_Z];
  for (const [x, y] of pixels) {
    ctx.fillRect(x * scale, y * scale, scale, scale);
  }
}

// ─── Animation builder ───────────────────────────────────────────────────────

function buildFrameSequence(animation: OctopusAnimation): SpriteFrame[] {
  switch (animation) {
    case "walk-up":
      return WALKUP_FRAMES.map((bottom) => ({ bottom }));
    case "jog":
      return WALK_FRAMES;
    case "bounce":
      return BOUNCE_FRAMES;
    case "float":
      return FLOAT_FRAMES;
    default:
      return SWAY_FRAMES_TAILS.map((tail) => ({ bottom: [...TENTACLE_TOP, ...tail] }));
  }
}

function animationFrameMs(animation: OctopusAnimation): number {
  if (animation === "jog" || animation === "walk-up") return WALK_FRAME_MS;
  if (animation === "float") return FLOAT_FRAME_MS;
  return SWAY_FRAME_MS;
}

const IDLE_FRAME: SpriteFrame = { bottom: [...TENTACLE_TOP, ...TAIL_NEUTRAL] };

// ─── Component ───────────────────────────────────────────────────────────────

type OctopusGlyphProps = {
  animation?: OctopusAnimation;
  expression?: OctopusExpression;
  /** Override the pixel scale (CSS px per sprite pixel). Default: 14. */
  scale?: number;
  className?: string;
  color?: string;
  testId?: string;
};

export const OctopusGlyph = ({
  animation = "sway",
  expression = "normal",
  scale = DEFAULT_SCALE,
  className,
  color,
  testId,
}: OctopusGlyphProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const zzzPhaseRef = useRef(0);

  // Sleepy expression gets extra canvas rows above the sprite for the ZZZ overlay.
  const topPad = expression === "sleepy" ? TOP_PAD : 0;

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

    const head = HEADS[expression];

    const drawFrame = (frame: SpriteFrame, zzzPhase: number) => {
      drawSprite(ctx, accentColor, frame, head, scale, topPad);
      if (expression === "sleepy") drawZZZ(ctx, scale, zzzPhase);
    };

    // Idle with no ZZZ: static, no interval.
    if (animation === "idle" && expression !== "sleepy") {
      frameRef.current = 0;
      drawFrame(IDLE_FRAME, 0);
      return;
    }

    // Idle sleepy: sprite is static but ZZZ blinks — use sway timing for ZZZ cycle.
    const frames = animation === "idle" ? null : buildFrameSequence(animation);
    const ms = animation === "idle" ? SWAY_FRAME_MS : animationFrameMs(animation);

    frameRef.current = 0;
    zzzPhaseRef.current = 0;
    drawFrame(frames?.[0] ?? IDLE_FRAME, 0);

    const id = setInterval(() => {
      if (frames) {
        frameRef.current = (frameRef.current + 1) % frames.length;
      }
      zzzPhaseRef.current = (zzzPhaseRef.current + 1) % 4;
      drawFrame(frames?.[frameRef.current] ?? IDLE_FRAME, zzzPhaseRef.current);
    }, ms);

    return () => clearInterval(id);
  }, [animation, expression, color, scale, topPad]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      width={SPRITE_W * scale}
      height={(topPad + SPRITE_H + BOUNCE_PAD) * scale}
      data-testid={testId}
      aria-hidden="true"
    />
  );
};

export const EmptyOctopus = () => {
  return <OctopusGlyph className="octopus-svg" testId="empty-octopus" />;
};
