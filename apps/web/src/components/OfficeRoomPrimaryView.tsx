import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { OctopusExpression, OctopusAnimation } from "./EmptyOctopus";
import { OctopusGlyph } from "./EmptyOctopus";
import { ActionButton } from "./ui/ActionButton";

// ── PIXEL SCALE ──────────────────────────────────────────────
const S = 6;

// ── CUBICLE DIMENSIONS ───────────────────────────────────────
// Tall portrait ratio to suit the column layout
const CW = 48;
const CH = 64;

// ── pixel helpers ──
function rect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  col: string,
): void {
  ctx.fillStyle = col;
  ctx.fillRect(x * S, y * S, w * S, h * S);
}

function px(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, col: string,
): void {
  ctx.fillStyle = col;
  ctx.fillRect(x * S, y * S, S, S);
}

// ═════════════════════════════════════════════════════════════
// COLOR UTILITIES
// ═════════════════════════════════════════════════════════════

function shadeHex(hex: string, amount: number): string {
  const f = 1 + amount;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `#${Math.min(255, Math.max(0, Math.round(r * f))).toString(16).padStart(2, "0")}${Math.min(255, Math.max(0, Math.round(g * f))).toString(16).padStart(2, "0")}${Math.min(255, Math.max(0, Math.round(b * f))).toString(16).padStart(2, "0")}`;
}

// ── Simple seeded PRNG (mulberry32) ──
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickRandom<T>(arr: readonly T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)]!;
}

// ═════════════════════════════════════════════════════════════
// WALL PALETTES
// ═════════════════════════════════════════════════════════════

type WallPalette = { label: string; base: string; baseboard: string };

const WALLS: WallPalette[] = [
  { label: "Warm Cream", base: "#e8e0d0", baseboard: "#7a6548" },
  { label: "Cool White", base: "#e4e8ec", baseboard: "#6a7078" },
  { label: "Sage Green", base: "#c8d8c0", baseboard: "#5a6850" },
  { label: "Dusty Rose", base: "#e0c8c8", baseboard: "#785858" },
  { label: "Soft Blue", base: "#c8d4e4", baseboard: "#586878" },
];

// ═════════════════════════════════════════════════════════════
// FLOOR VARIATIONS
// ═════════════════════════════════════════════════════════════

type FloorDrawFn = (ctx: CanvasRenderingContext2D, ox: number, oy: number, w: number, h: number) => void;

function drawWoodFloor(
  ctx: CanvasRenderingContext2D,
  ox: number, oy: number, w: number, h: number,
  plankA: string, plankB: string,
): void {
  const plankH = 3;
  const groove = shadeHex(plankB, -0.35);
  const grainDark = shadeHex(plankA, -0.12);
  const grainLight = shadeHex(plankA, 0.15);
  for (let py = 0; py < h; py += plankH + 1) {
    const yy = oy + py;
    const ph = Math.min(plankH, h - py);
    rect(ctx, ox, yy, w, ph, ((py / (plankH + 1)) | 0) % 2 === 0 ? plankA : plankB);
    rect(ctx, ox, yy, w, 1, grainLight);
    if (ph >= 2) {
      const seed = py * 7;
      for (let gx = (seed % 5) + 2; gx < w - 2; gx += 6 + (seed % 3)) {
        const gw = 2 + ((gx * 3 + py) % 3);
        rect(ctx, ox + gx, yy + 1, Math.min(gw, w - gx), 1, grainDark);
      }
    }
    if (py + plankH < h) rect(ctx, ox, yy + ph, w, 1, groove);
  }
}

type FloorOption = { label: string; draw: FloorDrawFn };

const WOOD_PALETTES = [
  { label: "Oak", plankA: "#c49a6c", plankB: "#a87d55" },
  { label: "Walnut", plankA: "#8a6040", plankB: "#6b4830" },
  { label: "Birch", plankA: "#e0cca0", plankB: "#c8b888" },
  { label: "Cherry", plankA: "#b06848", plankB: "#904838" },
  { label: "Ash", plankA: "#d0c4b0", plankB: "#b8a898" },
] as const;

const drawFloorCheckerboard: FloorDrawFn = (ctx, ox, oy, w, h) => {
  const tileSize = 4;
  for (let ty = 0; ty < h; ty += tileSize) {
    for (let tx = 0; tx < w; tx += tileSize) {
      const dark = ((tx / tileSize + ty / tileSize) | 0) % 2 === 0;
      rect(ctx, ox + tx, oy + ty, Math.min(tileSize, w - tx), Math.min(tileSize, h - ty), dark ? "#a89880" : "#d8ceb8");
    }
  }
};

const drawFloorStone: FloorDrawFn = (ctx, ox, oy, w, h) => {
  rect(ctx, ox, oy, w, h, "#8a8a80");
  const grout = "#686860";
  for (let gy = 0; gy < h; gy += 5) {
    rect(ctx, ox, oy + gy, w, 1, grout);
    const offset = ((gy / 5) | 0) % 2 === 0 ? 0 : 4;
    for (let gx = offset; gx < w; gx += 8) {
      rect(ctx, ox + gx, oy + gy, 1, Math.min(5, h - gy), grout);
      if ((gx + gy) % 16 < 8) rect(ctx, ox + gx + 1, oy + gy + 1, Math.min(6, w - gx - 1), Math.min(3, h - gy - 1), "#929288");
    }
  }
};

const drawFloorCarpet: FloorDrawFn = (ctx, ox, oy, w, h) => {
  rect(ctx, ox, oy, w, h, "#6b4570");
  for (let py = 0; py < h; py += 2) for (let ppx = (py % 4 === 0 ? 0 : 1); ppx < w; ppx += 2) px(ctx, ox + ppx, oy + py, "#7a5480");
  rect(ctx, ox, oy, w, 1, "#8a6090");
  rect(ctx, ox, oy + h - 1, w, 1, "#5a3560");
  for (let dy = 3; dy < h - 3; dy += 6) for (let dx = 3; dx < w - 3; dx += 8) {
    px(ctx, ox + dx, oy + dy, "#c8a040");
    px(ctx, ox + dx - 1, oy + dy + 1, "#c8a040");
    px(ctx, ox + dx + 1, oy + dy + 1, "#c8a040");
    px(ctx, ox + dx, oy + dy + 2, "#c8a040");
  }
};

const drawFloorConcrete: FloorDrawFn = (ctx, ox, oy, w, h) => {
  rect(ctx, ox, oy, w, h, "#b0aba0");
  for (let py = 0; py < h; py++) {
    const seed = py * 31;
    for (let ppx = (seed % 3); ppx < w; ppx += 3 + (seed % 2)) {
      const v = ((ppx * 17 + py * 13) % 5);
      if (v < 2) px(ctx, ox + ppx, oy + py, v === 0 ? "#a5a095" : "#b8b3a8");
    }
  }
  rect(ctx, ox + ((w / 3) | 0), oy, 1, h, "#989890");
  rect(ctx, ox + (((w * 2) / 3) | 0), oy, 1, h, "#989890");
};

const ALL_FLOORS: FloorOption[] = [
  ...WOOD_PALETTES.map((wp) => ({
    label: wp.label,
    draw: ((ctx: CanvasRenderingContext2D, ox: number, oy: number, w: number, h: number) =>
      drawWoodFloor(ctx, ox, oy, w, h, wp.plankA, wp.plankB)) as FloorDrawFn,
  })),
  { label: "Checkerboard", draw: drawFloorCheckerboard },
  { label: "Stone Tile", draw: drawFloorStone },
  { label: "Carpet", draw: drawFloorCarpet },
  { label: "Concrete", draw: drawFloorConcrete },
];

// ═════════════════════════════════════════════════════════════
// WINDOW VARIATIONS
// ═════════════════════════════════════════════════════════════

type AssetDrawFn = (ctx: CanvasRenderingContext2D, x: number, y: number) => void;

const drawWindowClassic: AssetDrawFn = (ctx, wx, wy) => {
  const ww = 14, wh = 18;
  rect(ctx, wx, wy, ww, wh, "#4a3420");
  rect(ctx, wx + 1, wy + 1, ww - 2, wh - 2, "#40b0ff");
  rect(ctx, wx + 1, wy + 1, ww - 2, 4, "#70d0ff");
  rect(ctx, wx + 1, wy + 5, ww - 2, 4, "#58c0ff");
  rect(ctx, wx + 1, wy + 9, ww - 2, 4, "#40b0ff");
  rect(ctx, wx + 1, wy + 13, ww - 2, 4, "#3090e0");
  rect(ctx, wx + 9, wy + 2, 3, 3, "#ffe060");
  px(ctx, wx + 10, wy + 1, "#fff0a0");
  px(ctx, wx + 10, wy + 5, "#fff0a0");
  px(ctx, wx + 8, wy + 3, "#fff0a0");
  rect(ctx, wx + 2, wy + 7, 5, 2, "#e0f0ff");
  rect(ctx, wx + 3, wy + 6, 3, 1, "#e0f0ff");
  rect(ctx, wx, wy + wh / 2, ww, 1, "#4a3420");
  rect(ctx, wx + ww / 2, wy, 1, wh, "#4a3420");
  rect(ctx, wx - 1, wy + wh, ww + 2, 2, "#5a4430");
  rect(ctx, wx - 1, wy + wh, ww + 2, 1, "#6a5440");
};

const drawWindowArch: AssetDrawFn = (ctx, wx, wy) => {
  const ww = 12, wh = 20;
  rect(ctx, wx, wy + 3, ww, wh - 3, "#606068");
  rect(ctx, wx + 2, wy, ww - 4, 3, "#606068");
  rect(ctx, wx + 1, wy + 1, 1, 2, "#606068");
  rect(ctx, wx + ww - 2, wy + 1, 1, 2, "#606068");
  rect(ctx, wx + 1, wy + 4, ww - 2, wh - 5, "#1a2040");
  rect(ctx, wx + 3, wy + 1, ww - 6, 3, "#1a2040");
  rect(ctx, wx + 2, wy + 2, 1, 2, "#1a2040");
  rect(ctx, wx + ww - 3, wy + 2, 1, 2, "#1a2040");
  rect(ctx, wx + 1, wy + 9, ww - 2, 5, "#283060");
  rect(ctx, wx + 1, wy + 14, ww - 2, 5, "#3868a8");
  px(ctx, wx + 3, wy + 3, "#ffffff");
  px(ctx, wx + 8, wy + 5, "#ffffff");
  px(ctx, wx + 5, wy + 7, "#ffe090");
  px(ctx, wx + 2, wy + 9, "#ffffff");
  px(ctx, wx + 9, wy + 8, "#ffffff");
  rect(ctx, wx + 7, wy + 2, 2, 2, "#f0e8c0");
  px(ctx, wx + 8, wy + 2, "#d8d0a8");
  rect(ctx, wx - 1, wy + wh, ww + 2, 2, "#505058");
};

const drawWindowRound: AssetDrawFn = (ctx, wx, wy) => {
  rect(ctx, wx, wy + 2, 14, 14, "#6a5440");
  rect(ctx, wx + 2, wy, 10, 18, "#6a5440");
  rect(ctx, wx + 1, wy + 1, 12, 16, "#6a5440");
  rect(ctx, wx + 1, wy + 3, 12, 12, "#50b8e8");
  rect(ctx, wx + 3, wy + 1, 8, 16, "#50b8e8");
  rect(ctx, wx + 2, wy + 2, 10, 14, "#50b8e8");
  rect(ctx, wx + 3, wy + 1, 8, 5, "#80d0f0");
  rect(ctx, wx + 2, wy + 2, 10, 4, "#80d0f0");
  rect(ctx, wx + 7, wy, 1, 18, "#6a5440");
  rect(ctx, wx, wy + 9, 14, 1, "#6a5440");
  rect(ctx, wx + 8, wy + 3, 2, 2, "#ffe060");
  rect(ctx, wx - 1, wy + 18, 16, 2, "#5a4430");
  rect(ctx, wx - 1, wy + 18, 16, 1, "#6a5440");
};

const drawWindowShutters: AssetDrawFn = (ctx, wx, wy) => {
  const ww = 10, wh = 16;
  rect(ctx, wx, wy, 3, wh, "#3a7048");
  rect(ctx, wx + 1, wy + 2, 1, 3, "#2a5838");
  rect(ctx, wx + 1, wy + 7, 1, 3, "#2a5838");
  rect(ctx, wx + 1, wy + 12, 1, 3, "#2a5838");
  rect(ctx, wx + ww + 3, wy, 3, wh, "#3a7048");
  rect(ctx, wx + ww + 4, wy + 2, 1, 3, "#2a5838");
  rect(ctx, wx + ww + 4, wy + 7, 1, 3, "#2a5838");
  rect(ctx, wx + ww + 4, wy + 12, 1, 3, "#2a5838");
  rect(ctx, wx + 3, wy, ww, wh, "#e8e0d0");
  rect(ctx, wx + 4, wy + 1, ww - 2, wh - 2, "#58c0ff");
  rect(ctx, wx + 4, wy + 1, ww - 2, 4, "#80d8ff");
  rect(ctx, wx + 4, wy + 5, ww - 2, 4, "#68c8ff");
  rect(ctx, wx + 4, wy + 9, ww - 2, 5, "#50b0e8");
  rect(ctx, wx + 5, wy + 3, 4, 1, "#e8f4ff");
  rect(ctx, wx + 6, wy + 2, 2, 1, "#e8f4ff");
  rect(ctx, wx + 3 + ww / 2, wy, 1, wh, "#e8e0d0");
  rect(ctx, wx + 3, wy + wh / 2, ww, 1, "#e8e0d0");
  rect(ctx, wx + 2, wy + wh, ww + 2, 3, "#8a5030");
  rect(ctx, wx + 3, wy + wh, ww, 1, "#a06040");
  px(ctx, wx + 4, wy + wh, "#e05050");
  px(ctx, wx + 7, wy + wh, "#f0c030");
  px(ctx, wx + 10, wy + wh, "#e05050");
  px(ctx, wx + 5, wy + wh - 1, "#30a050");
  px(ctx, wx + 8, wy + wh - 1, "#30a050");
};

const drawWindowCurtains: AssetDrawFn = (ctx, wx, wy) => {
  const ww = 14, wh = 18;
  rect(ctx, wx, wy, ww, wh, "#4a3420");
  rect(ctx, wx + 1, wy + 1, ww - 2, wh - 2, "#e87040");
  rect(ctx, wx + 1, wy + 1, ww - 2, 4, "#f0a060");
  rect(ctx, wx + 1, wy + 5, ww - 2, 3, "#e88050");
  rect(ctx, wx + 1, wy + 8, ww - 2, 3, "#d06840");
  rect(ctx, wx + 1, wy + 11, ww - 2, 5, "#a04830");
  rect(ctx, wx + 5, wy + 6, 4, 3, "#ffd040");
  rect(ctx, wx + 6, wy + 5, 2, 1, "#ffd040");
  rect(ctx, wx + 6, wy + 9, 2, 1, "#f0b030");
  rect(ctx, wx - 1, wy, ww + 2, 1, "#8a7060");
  rect(ctx, wx + 1, wy + 1, 3, wh - 2, "#802030");
  rect(ctx, wx + 2, wy + 1, 1, wh - 2, "#902840");
  rect(ctx, wx + ww - 4, wy + 1, 3, wh - 2, "#802030");
  rect(ctx, wx + ww - 3, wy + 1, 1, wh - 2, "#902840");
  rect(ctx, wx - 1, wy + wh, ww + 2, 2, "#5a4430");
  rect(ctx, wx - 1, wy + wh, ww + 2, 1, "#6a5440");
};

const ALL_WINDOWS: AssetDrawFn[] = [
  drawWindowClassic, drawWindowArch, drawWindowRound,
  drawWindowShutters, drawWindowCurtains,
];

// ═════════════════════════════════════════════════════════════
// VASE / PLANT VARIATIONS
// ═════════════════════════════════════════════════════════════

const drawVaseBushyPlant: AssetDrawFn = (ctx, vx, vy) => {
  rect(ctx, vx, vy + 4, 8, 6, "#d07838");
  rect(ctx, vx + 1, vy + 4, 6, 1, "#e08848");
  rect(ctx, vx + 1, vy + 9, 6, 1, "#984010");
  rect(ctx, vx + 1, vy + 4, 6, 1, "#4a2810");
  rect(ctx, vx + 3, vy + 1, 2, 4, "#1a6830");
  rect(ctx, vx + 1, vy - 2, 6, 4, "#28b860");
  rect(ctx, vx, vy - 1, 8, 2, "#30c868");
  rect(ctx, vx + 2, vy - 3, 4, 2, "#22a850");
  rect(ctx, vx + 2, vy - 2, 2, 1, "#40d880");
  rect(ctx, vx + 5, vy - 1, 2, 1, "#40d880");
  rect(ctx, vx - 1, vy, 2, 2, "#22a850");
  rect(ctx, vx + 7, vy, 2, 2, "#1e9848");
};

const drawVaseCactus: AssetDrawFn = (ctx, vx, vy) => {
  rect(ctx, vx + 1, vy + 5, 6, 5, "#c06030");
  rect(ctx, vx, vy + 5, 8, 1, "#d07040");
  rect(ctx, vx + 2, vy + 9, 4, 1, "#a04820");
  rect(ctx, vx + 2, vy + 5, 4, 1, "#3a2010");
  rect(ctx, vx + 3, vy - 2, 3, 8, "#2a8838");
  rect(ctx, vx + 2, vy - 1, 5, 6, "#30a040");
  rect(ctx, vx + 3, vy - 1, 1, 5, "#48c060");
  rect(ctx, vx + 1, vy, 2, 1, "#2a8838");
  rect(ctx, vx, vy - 2, 2, 3, "#30a040");
  px(ctx, vx, vy - 2, "#48c060");
  rect(ctx, vx + 6, vy + 1, 2, 1, "#2a8838");
  rect(ctx, vx + 7, vy - 1, 2, 3, "#30a040");
  px(ctx, vx + 7, vy - 1, "#48c060");
  px(ctx, vx + 4, vy - 3, "#f05070");
  px(ctx, vx + 3, vy - 3, "#f08090");
  px(ctx, vx + 5, vy - 3, "#f08090");
  px(ctx, vx + 4, vy - 4, "#f08090");
};

const drawVaseFlowers: AssetDrawFn = (ctx, vx, vy) => {
  rect(ctx, vx + 2, vy + 6, 5, 4, "#4878b8");
  rect(ctx, vx + 1, vy + 4, 7, 3, "#5088c8");
  rect(ctx, vx + 2, vy + 4, 5, 1, "#6098d0");
  rect(ctx, vx + 3, vy + 1, 1, 4, "#2a7830");
  rect(ctx, vx + 5, vy, 1, 5, "#1a6828");
  rect(ctx, vx + 6, vy + 2, 1, 3, "#2a7830");
  rect(ctx, vx + 2, vy - 1, 3, 3, "#e03040");
  px(ctx, vx + 3, vy, "#ff5060");
  rect(ctx, vx + 4, vy - 2, 3, 3, "#f0c030");
  px(ctx, vx + 5, vy - 1, "#ffdd50");
  rect(ctx, vx + 5, vy + 1, 3, 2, "#f07088");
  px(ctx, vx + 6, vy + 1, "#ff90a8");
};

const drawVaseHangingIvy: AssetDrawFn = (ctx, vx, vy) => {
  rect(ctx, vx + 2, vy + 2, 5, 8, "#a0522d");
  rect(ctx, vx + 1, vy + 2, 7, 1, "#b5651d");
  rect(ctx, vx + 3, vy + 9, 3, 1, "#804020");
  rect(ctx, vx + 3, vy + 2, 3, 1, "#3a2010");
  rect(ctx, vx + 3, vy, 1, 3, "#1e8838");
  rect(ctx, vx + 5, vy - 1, 1, 4, "#1e8838");
  px(ctx, vx + 2, vy - 1, "#30a050");
  px(ctx, vx + 6, vy, "#30a050");
  px(ctx, vx + 4, vy - 1, "#28b860");
  rect(ctx, vx + 1, vy + 4, 1, 3, "#1a6830");
  rect(ctx, vx, vy + 6, 1, 4, "#22a850");
  px(ctx, vx - 1, vy + 8, "#30c868");
  px(ctx, vx - 1, vy + 9, "#22a850");
  rect(ctx, vx + 7, vy + 3, 1, 4, "#1a6830");
  rect(ctx, vx + 8, vy + 6, 1, 3, "#22a850");
  px(ctx, vx + 9, vy + 8, "#30c868");
  px(ctx, vx, vy + 5, "#40d880");
  px(ctx, vx - 1, vy + 7, "#28b860");
  px(ctx, vx + 8, vy + 4, "#40d880");
  px(ctx, vx + 9, vy + 7, "#28b860");
};

const drawVaseBonsai: AssetDrawFn = (ctx, vx, vy) => {
  rect(ctx, vx, vy + 7, 9, 3, "#5a4a3a");
  rect(ctx, vx + 1, vy + 7, 7, 1, "#6a5a4a");
  rect(ctx, vx + 1, vy + 9, 7, 1, "#4a3a2a");
  rect(ctx, vx + 1, vy + 7, 7, 1, "#3a6030");
  rect(ctx, vx + 4, vy + 3, 2, 5, "#704820");
  rect(ctx, vx + 3, vy + 4, 1, 3, "#8a6030");
  px(ctx, vx + 5, vy + 3, "#5a3818");
  rect(ctx, vx + 2, vy + 3, 2, 1, "#704820");
  px(ctx, vx + 1, vy + 2, "#704820");
  rect(ctx, vx, vy, 4, 3, "#1a7838");
  rect(ctx, vx + 1, vy - 1, 2, 1, "#22883e");
  rect(ctx, vx + 4, vy + 1, 4, 3, "#209040");
  rect(ctx, vx + 5, vy, 3, 1, "#28a048");
  rect(ctx, vx + 3, vy - 1, 3, 2, "#28a048");
  px(ctx, vx + 4, vy - 2, "#30b050");
  px(ctx, vx + 1, vy, "#40c868");
  px(ctx, vx + 5, vy + 1, "#40c868");
};

const ALL_VASES: AssetDrawFn[] = [
  drawVaseBushyPlant, drawVaseCactus, drawVaseFlowers,
  drawVaseHangingIvy, drawVaseBonsai,
];

// ═════════════════════════════════════════════════════════════
// SHELF VARIATIONS
// ═════════════════════════════════════════════════════════════

const drawShelfBooks: AssetDrawFn = (ctx, sx, sy) => {
  // Bracket left
  rect(ctx, sx, sy + 5, 1, 2, "#5a4a3a");
  rect(ctx, sx, sy + 5, 2, 1, "#5a4a3a");
  // Bracket right
  rect(ctx, sx + 13, sy + 5, 1, 2, "#5a4a3a");
  rect(ctx, sx + 12, sy + 5, 2, 1, "#5a4a3a");
  // Shelf plank
  rect(ctx, sx, sy + 4, 14, 1, "#8a6830");
  rect(ctx, sx, sy + 4, 14, 1, "#9a7840");
  // Books
  rect(ctx, sx + 1, sy, 2, 4, "#c83030"); // red
  rect(ctx, sx + 3, sy + 1, 2, 3, "#3070c0"); // blue
  rect(ctx, sx + 5, sy, 2, 4, "#30a050"); // green
  rect(ctx, sx + 7, sy + 1, 3, 3, "#e0a020"); // yellow wide
  rect(ctx, sx + 10, sy, 2, 4, "#8050b0"); // purple
  // Book spines (highlights)
  px(ctx, sx + 1, sy + 1, "#e04040");
  px(ctx, sx + 3, sy + 2, "#4888d8");
  px(ctx, sx + 5, sy + 1, "#40c068");
  px(ctx, sx + 8, sy + 2, "#f0b830");
  px(ctx, sx + 10, sy + 1, "#a070d0");
};

const drawShelfMug: AssetDrawFn = (ctx, sx, sy) => {
  // Bracket left
  rect(ctx, sx, sy + 5, 1, 2, "#5a4a3a");
  rect(ctx, sx, sy + 5, 2, 1, "#5a4a3a");
  // Bracket right
  rect(ctx, sx + 11, sy + 5, 1, 2, "#5a4a3a");
  rect(ctx, sx + 10, sy + 5, 2, 1, "#5a4a3a");
  // Shelf plank
  rect(ctx, sx, sy + 4, 12, 1, "#9a7840");
  // Mug
  rect(ctx, sx + 2, sy + 1, 3, 3, "#e0e0e0");
  rect(ctx, sx + 5, sy + 2, 1, 1, "#e0e0e0"); // handle
  px(ctx, sx + 3, sy + 2, "#c83030"); // heart on mug
  // Steam
  px(ctx, sx + 3, sy, "#c8c8c8");
  px(ctx, sx + 2, sy - 1, "#b0b0b0");
  // Small frame
  rect(ctx, sx + 7, sy + 1, 3, 3, "#4a3420");
  rect(ctx, sx + 8, sy + 2, 1, 1, "#70b0e0"); // tiny picture
};

const ALL_SHELVES: AssetDrawFn[] = [drawShelfBooks, drawShelfMug];

// ═════════════════════════════════════════════════════════════
// CAT VARIATIONS
// ═════════════════════════════════════════════════════════════

const drawCatSleeping: AssetDrawFn = (ctx, cx, cy) => {
  const b = "#4a4a4a", h = "#606060", d = "#333333";
  // Body — large curled oval
  rect(ctx, cx + 3, cy + 6, 10, 5, b);
  rect(ctx, cx + 2, cy + 7, 12, 3, b);
  rect(ctx, cx + 4, cy + 5, 8, 1, b);
  // Body highlight
  rect(ctx, cx + 4, cy + 6, 6, 2, h);
  // Head — resting on paws
  rect(ctx, cx + 1, cy + 3, 6, 4, "#555555");
  rect(ctx, cx + 2, cy + 2, 4, 1, "#555555");
  // Head highlight
  rect(ctx, cx + 2, cy + 3, 4, 2, h);
  // Ears
  rect(ctx, cx + 1, cy + 1, 2, 2, "#555555");
  rect(ctx, cx + 5, cy + 1, 2, 2, "#555555");
  px(ctx, cx + 1, cy + 1, h);
  px(ctx, cx + 6, cy + 1, h);
  // Inner ears
  px(ctx, cx + 2, cy + 2, "#7a5050");
  px(ctx, cx + 5, cy + 2, "#7a5050");
  // Closed eyes — horizontal lines
  rect(ctx, cx + 2, cy + 4, 2, 1, d);
  rect(ctx, cx + 5, cy + 4, 2, 1, d);
  // Nose
  px(ctx, cx + 4, cy + 5, "#886060");
  // Paws tucked under head
  rect(ctx, cx, cy + 7, 2, 2, "#555555");
  rect(ctx, cx + 1, cy + 7, 1, 1, h);
  // (tail drawn separately with animation)
  // ZZZ
  px(ctx, cx + 7, cy + 1, "#7ec8e3");
  px(ctx, cx + 8, cy + 1, "#7ec8e3");
  px(ctx, cx + 8, cy + 2, "#7ec8e3");
  px(ctx, cx + 7, cy + 2, "#7ec8e3");
  px(ctx, cx + 7, cy + 3, "#7ec8e3");
  px(ctx, cx + 8, cy + 3, "#7ec8e3");
  px(ctx, cx + 10, cy, "#7ec8e3");
  px(ctx, cx + 11, cy, "#7ec8e3");
  px(ctx, cx + 11, cy + 1, "#7ec8e3");
  px(ctx, cx + 10, cy + 1, "#7ec8e3");
};

const drawCatOrange: AssetDrawFn = (ctx, cx, cy) => {
  const b = "#d08030", h = "#e8a048", d = "#b06820";
  // Body
  rect(ctx, cx + 3, cy + 6, 10, 5, b);
  rect(ctx, cx + 2, cy + 7, 12, 3, b);
  rect(ctx, cx + 4, cy + 5, 8, 1, b);
  // Body highlight
  rect(ctx, cx + 4, cy + 6, 6, 2, h);
  // Stripes
  rect(ctx, cx + 5, cy + 6, 1, 4, d);
  rect(ctx, cx + 8, cy + 6, 1, 4, d);
  rect(ctx, cx + 11, cy + 7, 1, 3, d);
  // Head
  rect(ctx, cx + 1, cy + 3, 6, 4, "#e09040");
  rect(ctx, cx + 2, cy + 2, 4, 1, "#e09040");
  rect(ctx, cx + 2, cy + 3, 4, 2, h);
  // Ears
  rect(ctx, cx + 1, cy + 1, 2, 2, "#e09040");
  rect(ctx, cx + 5, cy + 1, 2, 2, "#e09040");
  px(ctx, cx + 1, cy + 1, h);
  px(ctx, cx + 6, cy + 1, h);
  // Inner ears
  px(ctx, cx + 2, cy + 2, "#f0a870");
  px(ctx, cx + 5, cy + 2, "#f0a870");
  // Closed eyes
  rect(ctx, cx + 2, cy + 4, 2, 1, "#222222");
  rect(ctx, cx + 5, cy + 4, 2, 1, "#222222");
  // Nose
  px(ctx, cx + 4, cy + 5, "#a06040");
  // Mouth hint
  px(ctx, cx + 3, cy + 6, "#c07030");
  px(ctx, cx + 5, cy + 6, "#c07030");
  // Paws
  rect(ctx, cx, cy + 7, 2, 2, "#e09040");
  rect(ctx, cx + 1, cy + 7, 1, 1, h);
  // (tail drawn separately with animation)
};

const drawCatWhite: AssetDrawFn = (ctx, cx, cy) => {
  const b = "#e8e4dc", h = "#f4f0e8", d = "#ccc8c0";
  // Body
  rect(ctx, cx + 3, cy + 6, 10, 5, b);
  rect(ctx, cx + 2, cy + 7, 12, 3, b);
  rect(ctx, cx + 4, cy + 5, 8, 1, b);
  // Body highlight
  rect(ctx, cx + 4, cy + 6, 6, 2, h);
  // Shading
  rect(ctx, cx + 10, cy + 8, 3, 2, d);
  // Head
  rect(ctx, cx + 1, cy + 3, 6, 4, "#f0ece4");
  rect(ctx, cx + 2, cy + 2, 4, 1, "#f0ece4");
  rect(ctx, cx + 2, cy + 3, 4, 2, h);
  // Ears
  rect(ctx, cx + 1, cy + 1, 2, 2, "#f0ece4");
  rect(ctx, cx + 5, cy + 1, 2, 2, "#f0ece4");
  // Inner ears — pink
  px(ctx, cx + 2, cy + 2, "#f8b8b0");
  px(ctx, cx + 5, cy + 2, "#f8b8b0");
  // Closed eyes
  rect(ctx, cx + 2, cy + 4, 2, 1, "#555555");
  rect(ctx, cx + 5, cy + 4, 2, 1, "#555555");
  // Nose — pink
  px(ctx, cx + 4, cy + 5, "#f0a0a0");
  // Whisker dots
  px(ctx, cx + 1, cy + 5, "#cccccc");
  px(ctx, cx + 7, cy + 5, "#cccccc");
  // Paws
  rect(ctx, cx, cy + 7, 2, 2, "#f0ece4");
  rect(ctx, cx + 1, cy + 7, 1, 1, h);
  // (tail drawn separately with animation)
};

const ALL_CATS: AssetDrawFn[] = [drawCatSleeping, drawCatOrange, drawCatWhite];

// Animated tail — drawn on top of any cat. Color passed in.
// 4 frames: resting, up, high, down
type TailFrame = 0 | 1 | 2 | 3;
function drawCatTail(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  color: string, tipColor: string,
  frame: TailFrame,
): void {
  // Base of tail always at same spot
  rect(ctx, cx + 12, cy + 8, 2, 1, color);
  switch (frame) {
    case 0: // resting — curled around body
      rect(ctx, cx + 13, cy + 7, 2, 1, color);
      rect(ctx, cx + 14, cy + 6, 1, 2, tipColor);
      px(ctx, cx + 14, cy + 5, color);
      break;
    case 1: // lifted slightly
      rect(ctx, cx + 13, cy + 7, 2, 1, color);
      rect(ctx, cx + 14, cy + 5, 1, 2, tipColor);
      px(ctx, cx + 14, cy + 4, color);
      break;
    case 2: // up high
      rect(ctx, cx + 13, cy + 6, 1, 2, color);
      rect(ctx, cx + 14, cy + 4, 1, 2, tipColor);
      px(ctx, cx + 14, cy + 3, color);
      break;
    case 3: // swinging back down
      rect(ctx, cx + 13, cy + 7, 2, 1, color);
      rect(ctx, cx + 14, cy + 5, 1, 2, tipColor);
      px(ctx, cx + 15, cy + 5, color);
      break;
  }
}

// Cat color palettes for tail drawing
const CAT_TAIL_COLORS: Record<number, { color: string; tip: string }> = {
  0: { color: "#4a4a4a", tip: "#333333" },   // grey
  1: { color: "#d08030", tip: "#b06820" },   // orange
  2: { color: "#e8e4dc", tip: "#ccc8c0" },   // white
};

// ═════════════════════════════════════════════════════════════
// CEILING LIGHT VARIATIONS
// ═════════════════════════════════════════════════════════════

const drawPendantLight: AssetDrawFn = (ctx, lx, ly) => {
  // Cord
  rect(ctx, lx + 3, ly, 1, 5, "#3a3a3a");
  // Shade — trapezoid approximated
  rect(ctx, lx + 1, ly + 5, 5, 1, "#2a2a2a");
  rect(ctx, lx, ly + 6, 7, 2, "#333333");
  // Shade highlight
  rect(ctx, lx + 1, ly + 6, 5, 1, "#444444");
  // Bulb glow
  rect(ctx, lx + 2, ly + 8, 3, 1, "#fff0a0");
  px(ctx, lx + 3, ly + 9, "#ffe870");
  // Light cone (subtle glow on wall below)
  rect(ctx, lx + 1, ly + 10, 5, 1, "rgba(255,240,160,0.15)");
  rect(ctx, lx, ly + 11, 7, 1, "rgba(255,240,160,0.08)");
};

const drawCeilingFan: AssetDrawFn = (ctx, fx, fy) => {
  // Mount
  rect(ctx, fx + 3, fy, 2, 2, "#5a5a5a");
  // Rod
  rect(ctx, fx + 3, fy + 2, 1, 2, "#4a4a4a");
  // Motor housing
  rect(ctx, fx + 2, fy + 4, 4, 2, "#6a6a6a");
  rect(ctx, fx + 2, fy + 4, 4, 1, "#7a7a7a");
  // Blades (horizontal spread)
  rect(ctx, fx - 2, fy + 5, 5, 1, "#8a7040");
  rect(ctx, fx + 5, fy + 5, 5, 1, "#8a7040");
  // Blade highlights
  rect(ctx, fx - 1, fy + 5, 3, 1, "#9a8050");
  rect(ctx, fx + 6, fy + 5, 3, 1, "#9a8050");
  // Pull chain
  px(ctx, fx + 4, fy + 6, "#4a4a4a");
  px(ctx, fx + 4, fy + 7, "#4a4a4a");
  px(ctx, fx + 4, fy + 8, "#c0c0c0");
};

const drawHangingBulb: AssetDrawFn = (ctx, lx, ly) => {
  // Long cord
  rect(ctx, lx + 2, ly, 1, 7, "#2a2a2a");
  // Socket
  rect(ctx, lx + 1, ly + 7, 3, 1, "#3a3a3a");
  // Bulb
  rect(ctx, lx + 1, ly + 8, 3, 2, "#fff8d0");
  px(ctx, lx + 2, ly + 10, "#fff0a0");
  // Glow halo
  px(ctx, lx, ly + 8, "rgba(255,240,160,0.2)");
  px(ctx, lx + 4, ly + 8, "rgba(255,240,160,0.2)");
  px(ctx, lx, ly + 9, "rgba(255,240,160,0.12)");
  px(ctx, lx + 4, ly + 9, "rgba(255,240,160,0.12)");
};

const ALL_CEILING: AssetDrawFn[] = [drawPendantLight, drawCeilingFan, drawHangingBulb];

// ═════════════════════════════════════════════════════════════
// DESK + LAPTOP (front-facing, back of laptop toward viewer)
// ═════════════════════════════════════════════════════════════

const drawDeskLaptop: AssetDrawFn = (ctx, dx, dy) => {
  // ── Desk — wide top, short thin legs ──
  const legColor = "#7a5020";
  // Short thin legs
  rect(ctx, dx + 3, dy + 8, 2, 6, legColor);
  rect(ctx, dx + 3, dy + 8, 1, 6, "#8a6030");
  rect(ctx, dx + 39, dy + 8, 2, 6, legColor);
  rect(ctx, dx + 40, dy + 8, 1, 6, "#5a3810");
  // Crossbar
  rect(ctx, dx + 5, dy + 11, 34, 1, "#5a3810");
  // Wide thick top surface
  rect(ctx, dx - 2, dy + 2, 48, 3, "#d89040"); // top face
  rect(ctx, dx - 2, dy + 5, 48, 4, "#c08030"); // front face
  rect(ctx, dx - 2, dy + 5, 48, 1, "#b87828"); // bevel
  rect(ctx, dx - 2, dy + 8, 48, 1, "#a06820"); // shadow
  // Grain on top
  rect(ctx, dx + 3, dy + 2, 8, 1, "#e0a050");
  rect(ctx, dx + 18, dy + 3, 10, 1, "#e0a050");
  rect(ctx, dx + 34, dy + 2, 7, 1, "#e0a050");

  // ── Laptop (back facing us) ──
  // Base on desk
  rect(ctx, dx + 12, dy, 20, 2, "#c8ccd2");
  rect(ctx, dx + 13, dy, 18, 1, "#b4b8be");
  rect(ctx, dx + 18, dy + 1, 8, 1, "#bcc0c6");
  // Screen lid
  rect(ctx, dx + 10, dy - 14, 24, 14, "#c8ccd2");
  rect(ctx, dx + 10, dy - 14, 24, 1, "#9a9ea4");
  rect(ctx, dx + 10, dy - 14, 1, 14, "#d4d8de");
  rect(ctx, dx + 33, dy - 14, 1, 14, "#9a9ea4");
  // Lid inset
  rect(ctx, dx + 11, dy - 13, 22, 12, "#d4d8de");
  // Logo
  rect(ctx, dx + 19, dy - 9, 5, 4, "#b4b8be");
  rect(ctx, dx + 20, dy - 8, 3, 2, "#9a9ea4");
  // Screen glow
  rect(ctx, dx + 11, dy - 1, 22, 1, "#a0d0ff");
};

const ALL_DESKS: AssetDrawFn[] = [drawDeskLaptop];

// ═════════════════════════════════════════════════════════════
// OCTOPUS OPTIONS
// ═════════════════════════════════════════════════════════════

const OCTO_COLORS = [
  "#d4a017", "#e05555", "#3cc9a3", "#a78bfa",
  "#4a9eff", "#f5c542", "#e87040", "#50b860",
];

const OCTO_EXPRESSIONS: OctopusExpression[] = [
  "normal", "happy", "sleepy", "angry", "surprised",
];

const OCTO_ANIMATIONS: OctopusAnimation[] = [
  "idle", "sway", "bounce", "float",
];

// ═════════════════════════════════════════════════════════════
// ROOM CONFIG — everything needed to render one cubicle
// ═════════════════════════════════════════════════════════════

type RoomConfig = {
  id: string;
  name: string;
  wall: WallPalette;
  floor: FloorDrawFn;
  window: AssetDrawFn;
  vase: AssetDrawFn;
  shelf: AssetDrawFn | null;
  cat: AssetDrawFn | null;
  catIndex: number;
  ceiling: AssetDrawFn | null;
  desk: AssetDrawFn | null;
  octoColor: string;
  octoExpression: OctopusExpression;
  octoAnimation: OctopusAnimation;
};

const DEPARTMENT_NAMES = [
  "Frontend", "Backend", "Database", "Auth", "CLI",
  "Docs", "SEO", "Infra", "Testing", "Design",
];

function generateRoom(seed: number, index: number): RoomConfig {
  const rand = mulberry32(seed);
  return {
    id: `room-${index}`,
    name: DEPARTMENT_NAMES[index % DEPARTMENT_NAMES.length]!,
    wall: pickRandom(WALLS, rand),
    floor: pickRandom(ALL_FLOORS, rand).draw,
    window: pickRandom(ALL_WINDOWS, rand),
    vase: pickRandom(ALL_VASES, rand),
    // Each optional asset has ~60% chance of appearing
    shelf: rand() < 0.6 ? pickRandom(ALL_SHELVES, rand) : null,
    ...(() => {
      const ci = Math.floor(rand() * ALL_CATS.length);
      const hasCat = rand() < 0.6;
      return { cat: hasCat ? ALL_CATS[ci]! : null, catIndex: ci };
    })(),
    ceiling: rand() < 0.6 ? pickRandom(ALL_CEILING, rand) : null,
    desk: rand() < 0.5 ? pickRandom(ALL_DESKS, rand) : null,
    octoColor: pickRandom(OCTO_COLORS, rand),
    octoExpression: pickRandom(OCTO_EXPRESSIONS, rand),
    octoAnimation: pickRandom(OCTO_ANIMATIONS, rand),
  };
}

// ═════════════════════════════════════════════════════════════
// DRAW A FULL CUBICLE FROM CONFIG
// ═════════════════════════════════════════════════════════════

// Floor starts at ~70% down the canvas
const FLOOR_TOP = 44;

function drawCubicle(ctx: CanvasRenderingContext2D, cfg: RoomConfig, frame = 0): void {
  const floorH = CH - FLOOR_TOP;

  // Wall
  rect(ctx, 0, 0, CW, FLOOR_TOP, cfg.wall.base);
  // Floor
  cfg.floor(ctx, 0, FLOOR_TOP, CW, floorH);
  // Baseboard
  rect(ctx, 0, FLOOR_TOP - 1, CW, 1, cfg.wall.baseboard);
  rect(ctx, 0, FLOOR_TOP, CW, 1, shadeHex(cfg.wall.baseboard, 0.15));
  // Window — left side on wall, drawn at 80% scale
  ctx.save();
  const ws = 0.8;
  ctx.translate(3 * S, 12 * S);
  ctx.scale(ws, ws);
  cfg.window(ctx, 0, 0);
  ctx.restore();

  // Vase — far right corner, drawn at 70% scale
  ctx.save();
  const vs = 0.7;
  ctx.translate(38 * S, (FLOOR_TOP - 5) * S);
  ctx.scale(vs, vs);
  cfg.vase(ctx, 0, 0);
  ctx.restore();

  // Shelf — right side of wall, above vase
  if (cfg.shelf) {
    ctx.save();
    ctx.translate(28 * S, 6 * S);
    ctx.scale(0.7, 0.7);
    cfg.shelf(ctx, 0, 0);
    ctx.restore();
  }

  // Cat — on the floor, center
  if (cfg.cat) {
    const catX = 14;
    const catY = FLOOR_TOP + 2;
    const cs = 0.55;
    ctx.save();
    ctx.translate(catX * S, catY * S);
    ctx.scale(cs, cs);
    cfg.cat(ctx, 0, 0);
    const tailColors = CAT_TAIL_COLORS[cfg.catIndex] ?? CAT_TAIL_COLORS[0]!;
    drawCatTail(ctx, 0, 0, tailColors.color, tailColors.tip, (frame % 4) as TailFrame);
    ctx.restore();
  }

  // Ceiling light/fan — top center
  if (cfg.ceiling) {
    ctx.save();
    ctx.translate(20 * S, 0);
    ctx.scale(0.75, 0.75);
    cfg.ceiling(ctx, 0, 0);
    ctx.restore();
  }

}

// Foreground layer — drawn on top of the octopus overlay
function drawForeground(ctx: CanvasRenderingContext2D, cfg: RoomConfig): void {
  if (cfg.desk) {
    ctx.clearRect(0, 0, CW * S, CH * S);
    const ds = 0.8;
    // Desk spans from dx-2 to dx+48 = 50px wide at origin
    const deskW = 50 * ds;
    const offsetX = (CW * S - deskW * S) / 2 + 2 * ds * S;
    ctx.save();
    ctx.translate(offsetX, (FLOOR_TOP + 7) * S);
    ctx.scale(ds, ds);
    cfg.desk(ctx, 0, 0);
    ctx.restore();
  }
}

// ── Octopus positioning (as % of canvas) ─────────────────────
const OCTO_SCALE = 8;
const OCTO_SPRITE_W = 16;
const OCTO_SPRITE_H = 14 + 2;
const octoLeftPct = (((CW * S - OCTO_SPRITE_W * OCTO_SCALE) / 2) / (CW * S)) * 100;
const octoTopPct = ((FLOOR_TOP * S - OCTO_SPRITE_H * OCTO_SCALE + 2 * OCTO_SCALE) / (CH * S)) * 100;
const octoWPct = ((OCTO_SPRITE_W * OCTO_SCALE) / (CW * S)) * 100;
const octoHPct = ((OCTO_SPRITE_H * OCTO_SCALE) / (CH * S)) * 100;

// ═════════════════════════════════════════════════════════════
// SINGLE ROOM CELL COMPONENT
// ═════════════════════════════════════════════════════════════

function paintCanvas(
  ref: RefObject<HTMLCanvasElement | null>,
  fn: (ctx: CanvasRenderingContext2D) => void,
): void {
  const canvas = ref.current;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  fn(ctx);
}

type RoomCellProps = {
  config: RoomConfig;
  name: string;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
};

const RoomCell = ({ config, name, onRename, onDelete }: RoomCellProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fgCanvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const frameRef = useRef(0);

  useEffect(() => {
    paintCanvas(canvasRef, (ctx) => drawCubicle(ctx, config, 0));
    if (config.desk) paintCanvas(fgCanvasRef, (ctx) => drawForeground(ctx, config));

    if (!config.cat) return;

    const id = setInterval(() => {
      frameRef.current = (frameRef.current + 1) % 4;
      paintCanvas(canvasRef, (ctx) => drawCubicle(ctx, config, frameRef.current));
    }, 500);
    return () => clearInterval(id);
  }, [config]);

  const beginEdit = useCallback(() => {
    setDraft(name);
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.select());
  }, [name]);

  const submitEdit = useCallback(() => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) onRename(config.id, trimmed);
  }, [draft, name, config.id, onRename]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setDraft(name);
  }, [name]);

  return (
    <div className="officeroom-cell" style={{ "--room-color": config.octoColor } as React.CSSProperties}>
      <div className={`officeroom-cell-header${editing ? " officeroom-cell-header--editing" : ""}`}>
        {editing ? (
          <input
            ref={inputRef}
            className="officeroom-name-editor"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={submitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitEdit();
              if (e.key === "Escape") cancelEdit();
            }}
            autoFocus
          />
        ) : (
          <>
            <span className="officeroom-cell-heading">
              <button
                className="officeroom-name-display"
                onClick={beginEdit}
                title="Click to rename"
              >
                {name}
              </button>
            </span>
            <span className="officeroom-header-actions">
              <ActionButton
                aria-label={`Rename ${name}`}
                className="officeroom-action-rename"
                onClick={beginEdit}
                size="dense"
                variant="accent"
              >
                Rename
              </ActionButton>
              <ActionButton
                aria-label={`Delete ${name}`}
                className="officeroom-action-delete"
                onClick={() => onDelete(config.id)}
                size="dense"
                variant="danger"
              >
                Delete
              </ActionButton>
            </span>
          </>
        )}
      </div>
      <div className="officeroom-cell-body">
        {/* Background: room, assets */}
        <canvas
          ref={canvasRef}
          width={CW * S}
          height={CH * S}
          className="officeroom-canvas"
        />
        {/* Middle layer: octopus */}
        <div style={{
          position: "absolute",
          left: `${octoLeftPct}%`,
          top: `${octoTopPct}%`,
          width: `${octoWPct}%`,
          height: `${octoHPct}%`,
          pointerEvents: "none",
        }}>
          <OctopusGlyph
            animation={config.octoAnimation}
            expression={config.octoExpression}
            color={config.octoColor}
            scale={OCTO_SCALE}
            className="officeroom-canvas"
          />
        </div>
        {/* Foreground: desk + laptop (in front of octopus) */}
        {config.desk && (
          <canvas
            ref={fgCanvasRef}
            width={CW * S}
            height={CH * S}
            className="officeroom-canvas officeroom-fg"
          />
        )}
      </div>
      <div className="officeroom-cell-footer">
        <button className="officeroom-footer-btn" title="Review vault & context">
          Review
        </button>
        <button className="officeroom-footer-btn" title="Address open todo items">
          Todos
        </button>
        <button className="officeroom-footer-btn" title="Spawn a new agent">
          Spawn
        </button>
      </div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════
// PRIMARY VIEW — 10 random rooms in a single row, full height
// ═════════════════════════════════════════════════════════════

export const OfficeRoomPrimaryView = () => {
  const rooms = useMemo(
    () => Array.from({ length: 10 }, (_, i) => generateRoom(i * 1337 + 42, i)),
    [],
  );

  const [names, setNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(rooms.map((r) => [r.id, r.name])),
  );
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  const handleRename = useCallback((id: string, newName: string) => {
    setNames((prev) => ({ ...prev, [id]: newName }));
  }, []);

  const handleDelete = useCallback((id: string) => {
    setDeletedIds((prev) => new Set(prev).add(id));
  }, []);

  const visibleRooms = rooms.filter((r) => !deletedIds.has(r.id));

  const viewRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <section className="officeroom-view" ref={viewRef}>
      <div className="officeroom-rooms-grid">
        {visibleRooms.map((cfg) => (
          <RoomCell
            key={cfg.id}
            config={cfg}
            name={names[cfg.id] ?? cfg.name}
            onRename={handleRename}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </section>
  );
};
