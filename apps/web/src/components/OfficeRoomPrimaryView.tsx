import { useEffect, useRef } from "react";
import type { RefObject } from "react";

const S = 8; // canvas pixels per sprite pixel

// ── DESK (isometric 3/4 top-down) ────────────────────────────
// 44 × 30 sprite pixels  →  352 × 240 canvas
function drawDesk(ctx: CanvasRenderingContext2D): void {
  const ox = 10, oy = 10;
  const toSx = (x: number, y: number) => ((x - y) * 2 + ox) * S;
  const toSy = (x: number, y: number, z: number) =>
    ((x + y) - z * 2 + oy) * S;

  const face = (pts: [number, number, number][], col: string) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(toSx(pts[0][0], pts[0][1]), toSy(pts[0][0], pts[0][1], pts[0][2]));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(toSx(pts[i][0], pts[i][1]), toSy(pts[i][0], pts[i][1], pts[i][2]));
    }
    ctx.closePath();
    ctx.fill();
  };

  const W = 16, D = 6, TH = 6;

  // ── Four legs ──
  const legW = 1, legD = 1;
  const legs: [number, number][] = [[0, 0], [W - legW, 0], [0, D - legD], [W - legW, D - legD]];
  for (const [lx, ly] of legs) {
    face([[lx, ly + legD, 0], [lx, ly, 0], [lx, ly, TH - 1], [lx, ly + legD, TH - 1]], "#c07820");
    face([[lx, ly, 0], [lx + legW, ly, 0], [lx + legW, ly, TH - 1], [lx, ly, TH - 1]], "#a06010");
    face([[lx + legW, ly, 0], [lx + legW, ly + legD, 0], [lx + legW, ly + legD, TH - 1], [lx + legW, ly, TH - 1]], "#7a4808");
  }

  // ── Surface slab ──
  face([[0, D, TH - 1], [0, 0, TH - 1], [0, 0, TH], [0, D, TH]], "#c07820");
  face([[0, 0, TH - 1], [W, 0, TH - 1], [W, 0, TH], [0, 0, TH]], "#b06818");
  face([[W, 0, TH - 1], [W, D, TH - 1], [W, D, TH], [W, 0, TH]], "#8a5008");
  face([[0, 0, TH], [W, 0, TH], [W, D, TH], [0, D, TH]], "#d89030");

  // Top highlights
  face([[0, 0, TH], [W, 0, TH], [W, 0.5, TH], [0, 0.5, TH]], "#e8a040");
  face([[0, 5.5, TH], [W, 5.5, TH], [W, D, TH], [0, D, TH]], "#c07820");
}

// ── CHAIR (isometric 3/4 top-down) ───────────────────────────
// 30 × 38 sprite pixels  →  240 × 304 canvas
function drawChair(ctx: CanvasRenderingContext2D): void {
  const ox = 14, oy = 22;
  const toSx = (x: number, y: number) => ((x - y) * 2 + ox) * S;
  const toSy = (x: number, y: number, z: number) =>
    ((x + y) - z * 2 + oy) * S;

  const face = (pts: [number, number, number][], col: string) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(toSx(pts[0][0], pts[0][1]), toSy(pts[0][0], pts[0][1], pts[0][2]));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(toSx(pts[i][0], pts[i][1]), toSy(pts[i][0], pts[i][1], pts[i][2]));
    }
    ctx.closePath();
    ctx.fill();
  };

  // ── Star base spokes (z = 0) ──
  face([[3,3,0],[0,3,0],[0,3.5,0],[3,3.5,0]], "#222222");
  face([[3,3,0],[3,0,0],[3.5,0,0],[3.5,3,0]], "#222222");
  face([[3.5,3,0],[6,3,0],[6,3.5,0],[3.5,3.5,0]], "#2a2a2a");
  face([[3,3.5,0],[3,6,0],[3.5,6,0],[3.5,3.5,0]], "#2a2a2a");

  // Casters
  face([[-0.5,2.5,0],[-0.5,4,0],[0,4,0],[0,2.5,0]], "#181818");
  face([[2.5,-0.5,0],[4,-0.5,0],[4,0,0],[2.5,0,0]], "#181818");
  face([[6,2.5,0],[6.5,2.5,0],[6.5,4,0],[6,4,0]], "#181818");
  face([[2.5,6,0],[4,6,0],[4,6.5,0],[2.5,6.5,0]], "#181818");

  // ── Hub (z = 0 → 0.8) ──
  face([[2,4,0],[4,4,0],[4,4,0.8],[2,4,0.8]], "#1a1a1a");
  face([[2,2,0],[2,4,0],[2,4,0.8],[2,2,0.8]], "#3c3c3c");
  face([[2,2,0],[4,2,0],[4,2,0.8],[2,2,0.8]], "#2a2a2a");
  face([[4,2,0],[4,4,0],[4,4,0.8],[4,2,0.8]], "#1a1a1a");
  face([[2,2,0.8],[4,2,0.8],[4,4,0.8],[2,4,0.8]], "#3c3c3c");

  // ── Gas lift post (z = 0.8 → 3) ──
  face([[2.5,3.5,0.8],[3.5,3.5,0.8],[3.5,3.5,3],[2.5,3.5,3]], "#222222");
  face([[2.5,2.5,0.8],[2.5,3.5,0.8],[2.5,3.5,3],[2.5,2.5,3]], "#3c3c3c");
  face([[2.5,2.5,0.8],[3.5,2.5,0.8],[3.5,2.5,3],[2.5,2.5,3]], "#2a2a2a");
  face([[3.5,2.5,0.8],[3.5,3.5,0.8],[3.5,3.5,3],[3.5,2.5,3]], "#1a1a1a");
  face([[2.5,2.5,3],[3.5,2.5,3],[3.5,3.5,3],[2.5,3.5,3]], "#333333");

  // ── Seat cushion (z = 3 → 4) ──
  face([[0.5,5.5,3],[0.5,0.5,3],[0.5,0.5,4],[0.5,5.5,4]], "#ff5c1a");
  face([[0.5,0.5,3],[5.5,0.5,3],[5.5,0.5,4],[0.5,0.5,4]], "#cc3a00");
  face([[5.5,0.5,3],[5.5,5.5,3],[5.5,5.5,4],[5.5,0.5,4]], "#992800");
  face([[0.5,0.5,4],[5.5,0.5,4],[5.5,5.5,4],[0.5,5.5,4]], "#e04810");
  face([[1.5,1.5,4],[4.5,1.5,4],[4.5,4.5,4],[1.5,4.5,4]], "#ff5c1a");

  // ── Armrests (z = 4 → 4.5) ──
  face([[0,5,4],[0,0.5,4],[0,0.5,4.5],[0,5,4.5]], "#3c3c3c");
  face([[0,0.5,4],[0.5,0.5,4],[0.5,0.5,4.5],[0,0.5,4.5]], "#2a2a2a");
  face([[0,0.5,4.5],[0.5,0.5,4.5],[0.5,5,4.5],[0,5,4.5]], "#444444");
  face([[5.5,0.5,4],[6,0.5,4],[6,0.5,4.5],[5.5,0.5,4.5]], "#2a2a2a");
  face([[6,0.5,4],[6,5,4],[6,5,4.5],[6,0.5,4.5]], "#1a1a1a");
  face([[5.5,0.5,4.5],[6,0.5,4.5],[6,5,4.5],[5.5,5,4.5]], "#333333");

  // ── Backrest (z = 4 → 9, y = 4.5 → 5.5) ──
  face([[0.5,5.5,4],[0.5,4.5,4],[0.5,4.5,9],[0.5,5.5,9]], "#ff5c1a");
  face([[0.5,4.5,4],[5.5,4.5,4],[5.5,4.5,9],[0.5,4.5,9]], "#cc3a00");
  face([[5.5,4.5,4],[5.5,5.5,4],[5.5,5.5,9],[5.5,4.5,9]], "#992800");
  face([[0.5,4.5,9],[5.5,4.5,9],[5.5,5.5,9],[0.5,5.5,9]], "#e04810");
  // Cushion detail
  face([[1.5,4.5,5],[4.5,4.5,5],[4.5,4.5,8],[1.5,4.5,8]], "#e04810");
  face([[2,4.5,5.5],[4,4.5,5.5],[4,4.5,7.5],[2,4.5,7.5]], "#ff7040");

  // ── Headrest (z = 9 → 10) ──
  face([[1.5,5,9],[1.5,4.5,9],[1.5,4.5,10],[1.5,5,10]], "#ff5c1a");
  face([[1.5,4.5,9],[4.5,4.5,9],[4.5,4.5,10],[1.5,4.5,10]], "#cc3a00");
  face([[4.5,4.5,9],[4.5,5,9],[4.5,5,10],[4.5,4.5,10]], "#992800");
  face([[1.5,4.5,10],[4.5,4.5,10],[4.5,5,10],[1.5,5,10]], "#ff5c1a");
}

// ── CHAIR REVERSE (facing toward camera — we see the back) ──
// 30 × 38 sprite pixels  →  240 × 304 canvas
function drawChairBack(ctx: CanvasRenderingContext2D): void {
  const ox = 14, oy = 22;
  const toSx = (x: number, y: number) => ((x - y) * 2 + ox) * S;
  const toSy = (x: number, y: number, z: number) =>
    ((x + y) - z * 2 + oy) * S;

  const face = (pts: [number, number, number][], col: string) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(toSx(pts[0][0], pts[0][1]), toSy(pts[0][0], pts[0][1], pts[0][2]));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(toSx(pts[i][0], pts[i][1]), toSy(pts[i][0], pts[i][1], pts[i][2]));
    }
    ctx.closePath();
    ctx.fill();
  };

  // ── Star base spokes (z = 0) — same as original, symmetric ──
  face([[3,3,0],[0,3,0],[0,3.5,0],[3,3.5,0]], "#222222");
  face([[3,3,0],[3,0,0],[3.5,0,0],[3.5,3,0]], "#222222");
  face([[3.5,3,0],[6,3,0],[6,3.5,0],[3.5,3.5,0]], "#2a2a2a");
  face([[3,3.5,0],[3,6,0],[3.5,6,0],[3.5,3.5,0]], "#2a2a2a");

  // Casters
  face([[-0.5,2.5,0],[-0.5,4,0],[0,4,0],[0,2.5,0]], "#181818");
  face([[2.5,-0.5,0],[4,-0.5,0],[4,0,0],[2.5,0,0]], "#181818");
  face([[6,2.5,0],[6.5,2.5,0],[6.5,4,0],[6,4,0]], "#181818");
  face([[2.5,6,0],[4,6,0],[4,6.5,0],[2.5,6.5,0]], "#181818");

  // ── Hub (z = 0 → 0.8) ──
  face([[2,4,0],[4,4,0],[4,4,0.8],[2,4,0.8]], "#1a1a1a");
  face([[2,2,0],[2,4,0],[2,4,0.8],[2,2,0.8]], "#3c3c3c");
  face([[2,2,0],[4,2,0],[4,2,0.8],[2,2,0.8]], "#2a2a2a");
  face([[4,2,0],[4,4,0],[4,4,0.8],[4,2,0.8]], "#1a1a1a");
  face([[2,2,0.8],[4,2,0.8],[4,4,0.8],[2,4,0.8]], "#3c3c3c");

  // ── Gas lift post (z = 0.8 → 3) ──
  face([[2.5,3.5,0.8],[3.5,3.5,0.8],[3.5,3.5,3],[2.5,3.5,3]], "#222222");
  face([[2.5,2.5,0.8],[2.5,3.5,0.8],[2.5,3.5,3],[2.5,2.5,3]], "#3c3c3c");
  face([[2.5,2.5,0.8],[3.5,2.5,0.8],[3.5,2.5,3],[2.5,2.5,3]], "#2a2a2a");
  face([[3.5,2.5,0.8],[3.5,3.5,0.8],[3.5,3.5,3],[3.5,2.5,3]], "#1a1a1a");
  face([[2.5,2.5,3],[3.5,2.5,3],[3.5,3.5,3],[2.5,3.5,3]], "#333333");

  // ── Seat cushion (z = 3 → 4) ──
  face([[0.5,5.5,3],[0.5,0.5,3],[0.5,0.5,4],[0.5,5.5,4]], "#ff5c1a");
  face([[0.5,0.5,3],[5.5,0.5,3],[5.5,0.5,4],[0.5,0.5,4]], "#cc3a00");
  face([[5.5,0.5,3],[5.5,5.5,3],[5.5,5.5,4],[5.5,0.5,4]], "#992800");
  face([[0.5,0.5,4],[5.5,0.5,4],[5.5,5.5,4],[0.5,5.5,4]], "#e04810");
  face([[1.5,1.5,4],[4.5,1.5,4],[4.5,4.5,4],[1.5,4.5,4]], "#ff5c1a");

  // ── Armrests (z = 4 → 4.5) ──
  face([[0,5,4],[0,1,4],[0,1,4.5],[0,5,4.5]], "#3c3c3c");
  face([[0,1,4],[0.5,1,4],[0.5,1,4.5],[0,1,4.5]], "#2a2a2a");
  face([[0,1,4.5],[0.5,1,4.5],[0.5,5,4.5],[0,5,4.5]], "#444444");
  face([[5.5,1,4],[6,1,4],[6,1,4.5],[5.5,1,4.5]], "#2a2a2a");
  face([[6,1,4],[6,5,4],[6,5,4.5],[6,1,4.5]], "#1a1a1a");
  face([[5.5,1,4.5],[6,1,4.5],[6,5,4.5],[5.5,5,4.5]], "#333333");

  // ── Backrest (z = 4 → 9, y = 0.5 → 1.5 — facing camera) ──
  // Back shell (outer face, y = 0.5, visible to camera)
  face([[0.5,0.5,4],[5.5,0.5,4],[5.5,0.5,9],[0.5,0.5,9]], "#333333");
  // Left side
  face([[0.5,1.5,4],[0.5,0.5,4],[0.5,0.5,9],[0.5,1.5,9]], "#ff5c1a");
  // Right side
  face([[5.5,0.5,4],[5.5,1.5,4],[5.5,1.5,9],[5.5,0.5,9]], "#992800");
  // Top
  face([[0.5,0.5,9],[5.5,0.5,9],[5.5,1.5,9],[0.5,1.5,9]], "#e04810");

  // Back shell detail — frame and mesh texture
  face([[1,0.5,4.5],[5,0.5,4.5],[5,0.5,8.5],[1,0.5,8.5]], "#2a2a2a");
  // Mesh panel (inner dark area)
  face([[1.5,0.5,5],[4.5,0.5,5],[4.5,0.5,8],[1.5,0.5,8]], "#1a1a1a");
  // Lumbar support ridge
  face([[1,0.5,5.5],[5,0.5,5.5],[5,0.5,6],[1,0.5,6]], "#444444");

  // ── Headrest (z = 9 → 10, y = 0.5 → 1) ──
  face([[1.5,0.5,9],[4.5,0.5,9],[4.5,0.5,10],[1.5,0.5,10]], "#333333");
  face([[1.5,1,9],[1.5,0.5,9],[1.5,0.5,10],[1.5,1,10]], "#ff5c1a");
  face([[4.5,0.5,9],[4.5,1,9],[4.5,1,10],[4.5,0.5,10]], "#992800");
  face([[1.5,0.5,10],[4.5,0.5,10],[4.5,1,10],[1.5,1,10]], "#e04810");
}

// ── LAPTOP (isometric 3/4 top-down, screen facing away) ─────
// 38 × 36 sprite pixels  →  304 × 288 canvas
function drawLaptop(ctx: CanvasRenderingContext2D): void {
  const ox = 16, oy = 16;
  const toSx = (x: number, y: number) => ((x - y) * 2 + ox) * S;
  const toSy = (x: number, y: number, z: number) =>
    ((x + y) - z * 2 + oy) * S;

  const face = (pts: [number, number, number][], col: string) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(toSx(pts[0][0], pts[0][1]), toSy(pts[0][0], pts[0][1], pts[0][2]));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(toSx(pts[i][0], pts[i][1]), toSy(pts[i][0], pts[i][1], pts[i][2]));
    }
    ctx.closePath();
    ctx.fill();
  };

  const BW = 10, BD = 7, BH = 0.5;

  // ── BASE ──
  face([[0,BD,0],[0,0,0],[0,0,BH],[0,BD,BH]], "#d4d8de");
  face([[0,0,0],[BW,0,0],[BW,0,BH],[0,0,BH]], "#c8ccd2");
  face([[BW,0,0],[BW,BD,0],[BW,BD,BH],[BW,0,BH]], "#9a9ea4");
  face([[0,0,BH],[BW,0,BH],[BW,BD,BH],[0,BD,BH]], "#c8ccd2");

  // Keyboard area (inset on top)
  face([[1,1,BH],[9,1,BH],[9,5,BH],[1,5,BH]], "#b4b8be");
  // Key rows (simplified isometric keys)
  for (let ky = 1; ky <= 3.5; ky += 1) {
    for (let kx = 1.5; kx < 9; kx += 1.5) {
      face([[kx,ky,BH],[kx + 1,ky,BH],[kx + 1,ky + 0.7,BH],[kx,ky + 0.7,BH]], "#dde1e6");
    }
  }
  // Space bar
  face([[3,4.5,BH],[7,4.5,BH],[7,5.2,BH],[3,5.2,BH]], "#d8dce2");

  // Trackpad
  face([[3.5,5.5,BH],[6.5,5.5,BH],[6.5,6.5,BH],[3.5,6.5,BH]], "#bcc0c6");

  // ── SCREEN LID (rises from back edge, screen faces away) ──
  const SH = 7;
  // Lid frame
  face([[0,BD,BH],[0,BD - 1,BH],[0,BD - 1,SH],[0,BD,SH]], "#282830");
  face([[BW,BD - 1,BH],[BW,BD,BH],[BW,BD,SH],[BW,BD - 1,SH]], "#101018");
  face([[0,BD - 1,SH],[BW,BD - 1,SH],[BW,BD,SH],[0,BD,SH]], "#282830");

  // Back of lid (visible face, y = BD - 1, facing camera)
  face([[0,BD - 1,BH],[BW,BD - 1,BH],[BW,BD - 1,SH],[0,BD - 1,SH]], "#c8ccd2");
  // Inset panel on lid back (silver aluminum)
  face([[0.5,BD - 1,1],[9.5,BD - 1,1],[9.5,BD - 1,6.5],[0.5,BD - 1,6.5]], "#d4d8de");
  // Logo mark (centered, small)
  face([[4,BD - 1,3.5],[6,BD - 1,3.5],[6,BD - 1,4.5],[4,BD - 1,4.5]], "#b4b8be");
  face([[4.5,BD - 1,3.8],[5.5,BD - 1,3.8],[5.5,BD - 1,4.2],[4.5,BD - 1,4.2]], "#9a9ea4");
}

// ── WINDOW (isometric 3/4 top-down) ─────────────────────────
// 34 × 44 sprite pixels  →  272 × 352 canvas
function drawWindow(ctx: CanvasRenderingContext2D): void {
  const ox = 5, oy = 26;
  const toSx = (x: number, y: number) => ((x - y) * 2 + ox) * S;
  const toSy = (x: number, y: number, z: number) =>
    ((x + y) - z * 2 + oy) * S;

  const face = (pts: [number, number, number][], col: string) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(toSx(pts[0][0], pts[0][1]), toSy(pts[0][0], pts[0][1], pts[0][2]));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(toSx(pts[i][0], pts[i][1]), toSy(pts[i][0], pts[i][1], pts[i][2]));
    }
    ctx.closePath();
    ctx.fill();
  };

  const W = 14, D = 1.5, H = 12;

  // ── Frame outer box ──
  face([[0,D,0],[0,0,0],[0,0,H],[0,D,H]], "#4a3420");
  face([[0,0,0],[W,0,0],[W,0,H],[0,0,H]], "#3a2818");
  face([[W,0,0],[W,D,0],[W,D,H],[W,0,H]], "#2a1c10");
  face([[0,0,H],[W,0,H],[W,D,H],[0,D,H]], "#4a3420");

  // ── Sky pane (front face inset) ──
  face([[1,0,1],[13,0,1],[13,0,11],[1,0,11]], "#40b0ff");

  // Sky gradient bands (z ascending = visually higher)
  face([[1,0,9.5],[13,0,9.5],[13,0,11],[1,0,11]], "#70d0ff");
  face([[1,0,8],[13,0,8],[13,0,9.5],[1,0,9.5]], "#58c0ff");
  face([[1,0,6.5],[13,0,6.5],[13,0,8],[1,0,8]], "#40b0ff");
  face([[1,0,5],[13,0,5],[13,0,6.5],[1,0,6.5]], "#38a0f0");
  face([[1,0,3.5],[13,0,3.5],[13,0,5],[1,0,5]], "#3090e0");
  face([[1,0,2],[13,0,2],[13,0,3.5],[1,0,3.5]], "#2880d0");
  face([[1,0,1],[13,0,1],[13,0,2],[1,0,2]], "#2070c0");

  // Sun (upper right)
  face([[9,0,9],[12,0,9],[12,0,10.5],[9,0,10.5]], "#ffe060");
  face([[9.5,0,10.5],[11.5,0,10.5],[11.5,0,10.8],[9.5,0,10.8]], "#fff0a0");
  face([[9.5,0,8.5],[11.5,0,8.5],[11.5,0,8.8],[9.5,0,8.8]], "#fff0a0");
  face([[10,0,9.5],[11,0,9.5],[11,0,10],[10,0,10]], "#fff8c0");
  face([[10.2,0,9.7],[10.8,0,9.7],[10.8,0,9.9],[10.2,0,9.9]], "#ffffff");

  // Cloud 1 (left, mid)
  face([[2,0,5.5],[5,0,5.5],[5,0,6.5],[2,0,6.5]], "#e0f0ff");
  face([[2.5,0,6],[4.5,0,6],[4.5,0,6.5],[2.5,0,6.5]], "#f0f8ff");

  // Cloud 2 (right, lower)
  face([[7,0,3],[11,0,3],[11,0,4],[7,0,4]], "#dceeff");
  face([[7.5,0,3.5],[10.5,0,3.5],[10.5,0,4],[7.5,0,4]], "#eef6ff");

  // Frame cross-bar (horizontal divider)
  face([[0,0,6],[W,0,6],[W,0,6.3],[0,0,6.3]], "#3a2818");

  // Glass reflection streak (upper left)
  face([[1,0,9],[1.5,0,9],[1.5,0,10.5],[1,0,10.5]], "#90e0ff");
  face([[2,0,9.5],[2.5,0,9.5],[2.5,0,10.5],[2,0,10.5]], "#78d0f8");

  // ── Windowsill (extends forward from base) ──
  face([[0,D,0],[0,0,0],[0,0,0.8],[0,D,0.8]], "#5a4430");
  face([[0,0,0],[W,0,0],[W,0,0.8],[0,0,0.8]], "#4a3420");
  face([[W,0,0],[W,D,0],[W,D,0.8],[W,0,0.8]], "#3a2818");
  face([[0,0,0.8],[W,0,0.8],[W,D,0.8],[0,D,0.8]], "#5a4430");
}

// ── PLANT VASE (isometric 3/4 top-down) ─────────────────────
// 36 × 40 sprite pixels  →  288 × 320 canvas
function drawPlantVase(ctx: CanvasRenderingContext2D): void {
  const ox = 18, oy = 24;
  const toSx = (x: number, y: number) => ((x - y) * 2 + ox) * S;
  const toSy = (x: number, y: number, z: number) =>
    ((x + y) - z * 2 + oy) * S;

  const face = (pts: [number, number, number][], col: string) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(toSx(pts[0][0], pts[0][1]), toSy(pts[0][0], pts[0][1], pts[0][2]));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(toSx(pts[i][0], pts[i][1]), toSy(pts[i][0], pts[i][1], pts[i][2]));
    }
    ctx.closePath();
    ctx.fill();
  };

  // ── SAUCER (z = 0 → 0.3) ──
  face([[0.5,5.5,0],[0.5,0.5,0],[0.5,0.5,0.3],[0.5,5.5,0.3]], "#8a5030");
  face([[0.5,0.5,0],[5.5,0.5,0],[5.5,0.5,0.3],[0.5,0.5,0.3]], "#704028");
  face([[5.5,0.5,0],[5.5,5.5,0],[5.5,5.5,0.3],[5.5,0.5,0.3]], "#503018");
  face([[0.5,0.5,0.3],[5.5,0.5,0.3],[5.5,5.5,0.3],[0.5,5.5,0.3]], "#8a5030");

  // ── POT (tapered: narrow at bottom, wide at rim) ──
  // Left face
  face([[1.5,4.5,0.3],[1.5,1.5,0.3],[0.5,0.5,5],[0.5,5.5,5]], "#d07838");
  // Front face
  face([[1.5,1.5,0.3],[4.5,1.5,0.3],[5.5,0.5,5],[0.5,0.5,5]], "#c06828");
  // Right face
  face([[4.5,1.5,0.3],[4.5,4.5,0.3],[5.5,5.5,5],[5.5,0.5,5]], "#984010");

  // Rim top surface
  face([[0.5,0.5,5],[5.5,0.5,5],[5.5,5.5,5],[0.5,5.5,5]], "#e08848");
  // Soil inside rim
  face([[1,1,5],[5,1,5],[5,5,5],[1,5,5]], "#4a2810");
  // Rim front highlight
  face([[0.5,0.5,5],[5.5,0.5,5],[5.5,1,5],[0.5,1,5]], "#e8a060");

  // ── STEMS ──
  face([[2.5,2.5,5],[3.5,2.5,5],[3.5,2.5,7],[2.5,2.5,7]], "#1a6830");
  face([[2.5,3,5],[3.5,3,5],[3.5,3,6.5],[2.5,3,6.5]], "#105020");

  // ── FOLIAGE ──
  // Asymmetric layers for organic silhouette (offset each layer)
  face([[0.5,0.5,7],[5.5,0.5,7],[5.5,5.5,7],[0.5,5.5,7]], "#28b860");
  face([[-0.5,0.5,7.5],[5.5,-0.5,7.5],[6.5,5,7.5],[0,6,7.5]], "#30c868");  // shifted front-right
  face([[0,1,8],[5,0,8],[6,5,8],[0.5,5.5,8]], "#28b860");                     // shifted right
  face([[0.5,0.5,8.5],[5.5,0.5,8.5],[5,5,8.5],[1,5.5,8.5]], "#22a850");     // slight skew
  face([[1,1,9],[5,1.5,9],[4.5,4.5,9],[1.5,4,9]], "#1e9848");                // irregular
  face([[1.5,2,9.5],[4,1.5,9.5],[4,4,9.5],[2,4.5,9.5]], "#22a850");         // off-center top
  face([[2,2.5,10],[3.5,2,10],[3.5,3.5,10],[2.5,4,10]], "#1e9848");          // small crown

  // Left drooping leaf
  face([[-0.5,2,6.5],[-0.5,4,6.5],[0.5,4.5,7.5],[0.5,2,7.5]], "#22a850");
  face([[-1,2.5,6],[-1,3.5,6],[-0.5,3.5,6.5],[-0.5,2.5,6.5]], "#1a8840");

  // Right drooping leaf
  face([[5.5,2,6.5],[5.5,4,6.5],[6.5,3.5,7],[6.5,2,7]], "#1e9848");
  face([[6.5,2.5,6],[6.5,3.5,6],[7,3,6.5],[7,2.5,6.5]], "#148030");

  // Front drooping leaf
  face([[1.5,0,7],[4.5,0,7],[4,-0.5,6.5],[2,-0.5,6.5]], "#28b860");         // wider front leaf
  face([[2,-0.5,6],[3.5,-0.5,6],[3.5,-1,5.5],[2.5,-1,5.5]], "#1a8840");

  // Back drooping leaf
  face([[1.5,5.5,7],[4,5.5,7],[4,6,6.5],[1.5,6,6.5]], "#1a8840");

  // Leaf highlights (scattered)
  face([[1.5,1,8.5],[2.5,0.5,8.5],[3,1.5,8.5],[2,2,8.5]], "#40d880");
  face([[3.5,2,8],[4.5,1.5,8],[4.5,3,8],[3.5,3,8]], "#38d070");
  face([[1,3,8],[2,3.5,8],[2,4.5,8],[1,4,8]], "#38d070");
  // Top tip
  face([[2.5,2.5,10],[3.5,2.5,10],[3.5,3.5,10],[2.5,3.5,10]], "#30d870");
}

// ── FLOWER VASE (isometric 3/4 top-down) ─────────────────────
// 28 × 40 sprite pixels  →  224 × 320 canvas
function drawFlowerVase(ctx: CanvasRenderingContext2D): void {
  const ox = 14, oy = 22;
  const toSx = (x: number, y: number) => ((x - y) * 2 + ox) * S;
  const toSy = (x: number, y: number, z: number) =>
    ((x + y) - z * 2 + oy) * S;

  const face = (pts: [number, number, number][], col: string) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(toSx(pts[0][0], pts[0][1]), toSy(pts[0][0], pts[0][1], pts[0][2]));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(toSx(pts[i][0], pts[i][1]), toSy(pts[i][0], pts[i][1], pts[i][2]));
    }
    ctx.closePath();
    ctx.fill();
  };

  // ── VASE (tapered cylinder: narrow bottom, wider rim) ──
  // Bottom
  face([[1.5,3.5,0],[1.5,1.5,0],[3.5,1.5,0],[3.5,3.5,0]], "#4878b8");
  // Left face (tapered)
  face([[1.5,3.5,0],[1.5,1.5,0],[0.5,0.5,4.5],[0.5,4.5,4.5]], "#5088c8");
  // Front face
  face([[1.5,1.5,0],[3.5,1.5,0],[4.5,0.5,4.5],[0.5,0.5,4.5]], "#3868a8");
  // Right face
  face([[3.5,1.5,0],[3.5,3.5,0],[4.5,4.5,4.5],[4.5,0.5,4.5]], "#285898");
  // Rim top
  face([[0.5,0.5,4.5],[4.5,0.5,4.5],[4.5,4.5,4.5],[0.5,4.5,4.5]], "#6098d0");
  // Water/interior
  face([[1,1,4.5],[4,1,4.5],[4,4,4.5],[1,4,4.5]], "#2050a0");
  // Rim highlight
  face([[0.5,0.5,4.5],[4.5,0.5,4.5],[4.5,1,4.5],[0.5,1,4.5]], "#70a8e0");

  // ── STEMS ──
  face([[1.5,2.5,4.5],[2,2.5,4.5],[2,2.5,8],[1.5,2.5,8]], "#2a7830");
  face([[2.5,2,4.5],[3,2,4.5],[3,2,9],[2.5,2,9]], "#1a6828");
  face([[3,3,4.5],[3.5,3,4.5],[3.5,3,7.5],[3,3,7.5]], "#2a7830");

  // ── FLOWERS ──
  // Flower 1 (red rose, tall center)
  face([[2,1.5,8.5],[3.5,1.5,8.5],[3.5,3,8.5],[2,3,8.5]], "#e03040");
  face([[2.2,1.7,9],[3.3,1.7,9],[3.3,2.8,9],[2.2,2.8,9]], "#c82030");
  face([[2.5,2,9.2],[3,2,9.2],[3,2.5,9.2],[2.5,2.5,9.2]], "#ff4050");

  // Flower 2 (pink, left shorter)
  face([[0.5,2,7.5],[2,2,7.5],[2,3.5,7.5],[0.5,3.5,7.5]], "#f07088");
  face([[0.8,2.3,8],[1.7,2.3,8],[1.7,3.2,8],[0.8,3.2,8]], "#e05878");
  face([[1,2.5,8.2],[1.5,2.5,8.2],[1.5,3,8.2],[1,3,8.2]], "#ff90a8");

  // Flower 3 (yellow, right short)
  face([[2.5,2.5,7],[4,2.5,7],[4,4,7],[2.5,4,7]], "#f0c030");
  face([[2.8,2.8,7.3],[3.7,2.8,7.3],[3.7,3.7,7.3],[2.8,3.7,7.3]], "#e0a820");
  face([[3,3,7.5],[3.5,3,7.5],[3.5,3.5,7.5],[3,3.5,7.5]], "#ffdd50");

  // Leaf accents
  face([[0.5,1.5,6],[1.5,1,6],[1.5,1,6.5],[0.5,1.5,6.5]], "#30a050");
  face([[3.5,1.5,5.5],[4.5,2,5.5],[4.5,2,6],[3.5,1.5,6]], "#28903a");
}

// ── SMALL TREE (isometric 3/4 top-down) ──────────────────────
// 32 × 48 sprite pixels  →  256 × 384 canvas
function drawSmallTree(ctx: CanvasRenderingContext2D): void {
  const ox = 16, oy = 30;
  const toSx = (x: number, y: number) => ((x - y) * 2 + ox) * S;
  const toSy = (x: number, y: number, z: number) =>
    ((x + y) - z * 2 + oy) * S;

  const face = (pts: [number, number, number][], col: string) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(toSx(pts[0][0], pts[0][1]), toSy(pts[0][0], pts[0][1], pts[0][2]));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(toSx(pts[i][0], pts[i][1]), toSy(pts[i][0], pts[i][1], pts[i][2]));
    }
    ctx.closePath();
    ctx.fill();
  };

  // ── POT (square, simple) ──
  // Left face
  face([[1,4,0],[1,1,0],[0.5,0.5,3],[0.5,4.5,3]], "#8a5030");
  // Front face
  face([[1,1,0],[4,1,0],[4.5,0.5,3],[0.5,0.5,3]], "#704028");
  // Right face
  face([[4,1,0],[4,4,0],[4.5,4.5,3],[4.5,0.5,3]], "#503018");
  // Rim top
  face([[0.5,0.5,3],[4.5,0.5,3],[4.5,4.5,3],[0.5,4.5,3]], "#a06040");
  // Soil
  face([[1,1,3],[4,1,3],[4,4,3],[1,4,3]], "#4a2810");
  // Rim highlight
  face([[0.5,0.5,3],[4.5,0.5,3],[4.5,1,3],[0.5,1,3]], "#b07050");

  // ── TRUNK ──
  // Main trunk (z = 3 → 8)
  face([[2,3,3],[2,2,3],[2,2,8],[2,3,8]], "#8a6030");
  face([[2,2,3],[3,2,3],[3,2,8],[2,2,8]], "#704820");
  face([[3,2,3],[3,3,3],[3,3,8],[3,2,8]], "#5a3818");
  face([[2,2,8],[3,2,8],[3,3,8],[2,3,8]], "#8a6030");

  // Branch stub left (z = 6, extends toward x=0)
  face([[0.5,2.5,6],[2,2.5,6],[2,2.5,6.5],[0.5,2.5,6.5]], "#704820");
  face([[0.5,2,6],[0.5,2.5,6],[0.5,2.5,6.5],[0.5,2,6.5]], "#8a6030");

  // Branch stub right (z = 7, extends toward x=4)
  face([[3,2.5,7],[4.5,2.5,7],[4.5,2.5,7.5],[3,2.5,7.5]], "#704820");
  face([[4.5,2,7],[4.5,2.5,7],[4.5,2.5,7.5],[4.5,2,7.5]], "#5a3818");

  // ── CANOPY (layered, organic) ──
  // Bottom wide layer
  face([[-0.5,0,7],[5.5,-0.5,7],[6,5.5,7],[0,6,7]], "#1a7838");
  face([[-1,0.5,7.5],[5,-.5,7.5],[6.5,5,7.5],[-0.5,6,7.5]], "#22883e");

  // Mid layers
  face([[0,0.5,8],[5.5,0,8],[5.5,5,8],[0,5.5,8]], "#209040");
  face([[-0.5,1,8.5],[5,0,8.5],[5.5,5,8.5],[0.5,5.5,8.5]], "#28a048");

  // Upper layers (getting smaller)
  face([[0.5,1,9],[5,0.5,9],[5,4.5,9],[0.5,5,9]], "#22903e");
  face([[1,1.5,9.5],[4.5,1,9.5],[4.5,4,9.5],[1,4.5,9.5]], "#1e8838");

  // Top crown
  face([[1.5,2,10],[4,1.5,10],[4,3.5,10],[1.5,4,10]], "#28a048");
  face([[2,2.5,10.5],[3.5,2,10.5],[3.5,3.5,10.5],[2,3.5,10.5]], "#22903e");
  face([[2.5,2.5,11],[3,2.5,11],[3,3,11],[2.5,3,11]], "#30b050");

  // Canopy highlights
  face([[1,1,8.5],[2,0.5,8.5],[2.5,1.5,8.5],[1.5,2,8.5]], "#40c868");
  face([[3.5,1,8],[4.5,1.5,8],[4.5,2.5,8],[3.5,2.5,8]], "#38c060");
  face([[1,3.5,8],[2,3,8],[2,4,8],[1,4.5,8]], "#38c060");

  // Shadow patches (darker)
  face([[3.5,3.5,8.5],[4.5,3,8.5],[4.5,4.5,8.5],[3.5,4.5,8.5]], "#187030");
  face([[0,3,7.5],[1,2.5,7.5],[1,4,7.5],[0,4,7.5]], "#146828");
}

// ── WALL CLOCK (isometric 3/4 top-down, flat on wall) ────────
// 22 × 22 sprite pixels  →  176 × 176 canvas
function drawWallClock(ctx: CanvasRenderingContext2D): void {
  const ox = 6, oy = 6;
  const toSx = (x: number, y: number) => ((x - y) * 2 + ox) * S;
  const toSy = (x: number, y: number, z: number) =>
    ((x + y) - z * 2 + oy) * S;

  const face = (pts: [number, number, number][], col: string) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(toSx(pts[0][0], pts[0][1]), toSy(pts[0][0], pts[0][1], pts[0][2]));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(toSx(pts[i][0], pts[i][1]), toSy(pts[i][0], pts[i][1], pts[i][2]));
    }
    ctx.closePath();
    ctx.fill();
  };

  // Clock is flat on the wall: thin in Y (0.5), square in X and Z
  const W = 8, D = 0.5, H = 8;

  // ── Frame ──
  face([[0,D,0],[0,0,0],[0,0,H],[0,D,H]], "#3a3a3a");
  face([[0,0,0],[W,0,0],[W,0,H],[0,0,H]], "#2a2a2a");
  face([[W,0,0],[W,D,0],[W,D,H],[W,0,H]], "#1a1a1a");
  face([[0,0,H],[W,0,H],[W,D,H],[0,D,H]], "#3a3a3a");

  // ── Clock face (front, y = 0) ──
  face([[0.5,0,0.5],[7.5,0,0.5],[7.5,0,7.5],[0.5,0,7.5]], "#f0ece0");

  // Inner circle approximation (octagonal inset)
  face([[1,0,0.8],[7,0,0.8],[7,0,7.2],[1,0,7.2]], "#f8f4e8");

  // ── Hour markers (12, 3, 6, 9 as thicker marks) ──
  // 12 o'clock (top center)
  face([[3.5,0,6.8],[4.5,0,6.8],[4.5,0,7.2],[3.5,0,7.2]], "#1a1a1a");
  // 6 o'clock (bottom center)
  face([[3.5,0,0.8],[4.5,0,0.8],[4.5,0,1.2],[3.5,0,1.2]], "#1a1a1a");
  // 3 o'clock (right center)
  face([[6.8,0,3.5],[7.2,0,3.5],[7.2,0,4.5],[6.8,0,4.5]], "#1a1a1a");
  // 9 o'clock (left center)
  face([[0.8,0,3.5],[1.2,0,3.5],[1.2,0,4.5],[0.8,0,4.5]], "#1a1a1a");

  // Minor hour markers
  // 1 o'clock
  face([[5.5,0,6.2],[5.8,0,6.2],[5.8,0,6.5],[5.5,0,6.5]], "#555555");
  // 2 o'clock
  face([[6.2,0,5.5],[6.5,0,5.5],[6.5,0,5.8],[6.2,0,5.8]], "#555555");
  // 4 o'clock
  face([[6.2,0,2.2],[6.5,0,2.2],[6.5,0,2.5],[6.2,0,2.5]], "#555555");
  // 5 o'clock
  face([[5.5,0,1.5],[5.8,0,1.5],[5.8,0,1.8],[5.5,0,1.8]], "#555555");
  // 7 o'clock
  face([[2.2,0,1.5],[2.5,0,1.5],[2.5,0,1.8],[2.2,0,1.8]], "#555555");
  // 8 o'clock
  face([[1.5,0,2.2],[1.8,0,2.2],[1.8,0,2.5],[1.5,0,2.5]], "#555555");
  // 10 o'clock
  face([[1.5,0,5.5],[1.8,0,5.5],[1.8,0,5.8],[1.5,0,5.8]], "#555555");
  // 11 o'clock
  face([[2.2,0,6.2],[2.5,0,6.2],[2.5,0,6.5],[2.2,0,6.5]], "#555555");

  // ── Clock hands (showing ~10:10) ──
  // Hour hand (pointing toward 10, upper-left)
  face([[3.8,0,4],[4.2,0,4],[2.2,0,6],[1.8,0,5.8]], "#1a1a1a");
  // Minute hand (pointing toward 2, upper-right)
  face([[3.8,0,4],[4.2,0,4],[6.2,0,6],[5.8,0,5.8]], "#1a1a1a");

  // Center cap
  face([[3.5,0,3.5],[4.5,0,3.5],[4.5,0,4.5],[3.5,0,4.5]], "#c83020");
  face([[3.7,0,3.7],[4.3,0,3.7],[4.3,0,4.3],[3.7,0,4.3]], "#e84030");
}

// ── OFFICE ROOM (composed isometric scene) ──────────────────
// 100 × 80 sprite pixels → 800 × 640 canvas
//
// Painter's algorithm: draw back-to-front so nearer objects
// paint over farther ones.  "Back" = high (x + y).
//
// Draw order:
//   1. Back wall  (y = RD)
//   2. Right wall (x = RW) + window
//   3. Left wall  (x = 0)  + clock
//   4. Floor tiles (rows back → front)
//   5. Plant      (back-left,  y ≈ 20)
//   6. Desk       (y = 17‒22)  + laptop + vase
//   7. Chair      (y = 13‒17, in front of desk)
//   8. Small tree (front-right, y ≈ 2)
function drawOfficeRoom(ctx: CanvasRenderingContext2D): void {
  const ox = 50, oy = 30;
  const toSx = (x: number, y: number) => ((x - y) * 2 + ox) * S;
  const toSy = (x: number, y: number, z: number) =>
    ((x + y) - z * 2 + oy) * S;

  const face = (pts: [number, number, number][], col: string) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(toSx(pts[0][0], pts[0][1]), toSy(pts[0][0], pts[0][1], pts[0][2]));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(toSx(pts[i][0], pts[i][1]), toSy(pts[i][0], pts[i][1], pts[i][2]));
    }
    ctx.closePath();
    ctx.fill();
  };

  const RW = 24, RD = 24, WH = 14;

  // ── 1. BACK WALL (y = RD, inner face) ──
  face([[0, RD, 0], [RW, RD, 0], [RW, RD, WH], [0, RD, WH]], "#e8e0d0");
  face([[0, RD, 0], [RW, RD, 0], [RW, RD, 0.8], [0, RD, 0.8]], "#c0b098");

  // ── 2. RIGHT WALL (y = 0, inner face — upper-right in iso view) ──
  face([[0, 0, 0], [RW, 0, 0], [RW, 0, WH], [0, 0, WH]], "#e4dcd0");
  face([[0, 0, 0], [RW, 0, 0], [RW, 0, 0.8], [0, 0, 0.8]], "#c4b8a8");

  // ── WINDOW (on right wall, y = 0) ──
  face([[5, 0, 4], [17, 0, 4], [17, 0, 12], [5, 0, 12]], "#4a3420");
  face([[6, 0, 5], [16, 0, 5], [16, 0, 11], [6, 0, 11]], "#40b0ff");
  face([[6, 0, 9], [16, 0, 9], [16, 0, 11], [6, 0, 11]], "#70d0ff");
  face([[6, 0, 7], [16, 0, 7], [16, 0, 9], [6, 0, 9]], "#58c0ff");
  face([[12, 0, 9.5], [15, 0, 9.5], [15, 0, 10.5], [12, 0, 10.5]], "#ffe060");
  face([[13, 0, 10.5], [14.5, 0, 10.5], [14.5, 0, 10.8], [13, 0, 10.8]], "#fff0a0");
  face([[7, 0, 6], [10, 0, 6], [10, 0, 7], [7, 0, 7]], "#e0f0ff");
  face([[5, 0, 8], [17, 0, 8], [17, 0, 8.3], [5, 0, 8.3]], "#4a3420");
  face([[6.5, 0, 9.5], [7, 0, 9.5], [7, 0, 10.5], [6.5, 0, 10.5]], "#90e0ff");
  // Windowsill (extends inward toward higher y)
  face([[5, 0, 4], [5, 0.8, 4], [17, 0.8, 4], [17, 0, 4]], "#5a4430");
  face([[5, 0.8, 3.7], [5, 0.8, 4], [17, 0.8, 4], [17, 0.8, 3.7]], "#4a3420");

  // ── 3. LEFT WALL (x = 0, inner face — brightest) ──
  face([[0, 0, 0], [0, RD, 0], [0, RD, WH], [0, 0, WH]], "#f0e8d8");
  face([[0, 0, 0], [0, RD, 0], [0, RD, 0.8], [0, 0, 0.8]], "#c8b8a0");

  // ── CLOCK (on left wall, x = 0) ──
  face([[0, 10, 8], [0, 16, 8], [0, 16, 13], [0, 10, 13]], "#2a2a2a");
  face([[0, 10.5, 8.5], [0, 15.5, 8.5], [0, 15.5, 12.5], [0, 10.5, 12.5]], "#f0ece0");
  face([[0, 12.5, 12], [0, 13.5, 12], [0, 13.5, 12.3], [0, 12.5, 12.3]], "#1a1a1a");
  face([[0, 12.5, 8.7], [0, 13.5, 8.7], [0, 13.5, 9], [0, 12.5, 9]], "#1a1a1a");
  face([[0, 15, 10.2], [0, 15.3, 10.2], [0, 15.3, 10.8], [0, 15, 10.8]], "#1a1a1a");
  face([[0, 10.7, 10.2], [0, 11, 10.2], [0, 11, 10.8], [0, 10.7, 10.8]], "#1a1a1a");
  face([[0, 12.8, 10.4], [0, 13.2, 10.4], [0, 11.5, 12], [0, 11.2, 11.8]], "#1a1a1a");
  face([[0, 12.8, 10.4], [0, 13.2, 10.4], [0, 14.8, 12], [0, 14.5, 11.8]], "#1a1a1a");
  face([[0, 12.7, 10.2], [0, 13.3, 10.2], [0, 13.3, 10.8], [0, 12.7, 10.8]], "#c83020");

  // ── 4. FLOOR (checkerboard, back rows first) ──
  const TS = 4;
  for (let fy = RD - TS; fy >= 0; fy -= TS) {
    for (let fx = 0; fx < RW; fx += TS) {
      const dark = ((fx / TS) + (fy / TS)) % 2 === 0;
      face(
        [[fx, fy, 0], [fx + TS, fy, 0], [fx + TS, fy + TS, 0], [fx, fy + TS, 0]],
        dark ? "#b8a888" : "#a89878",
      );
    }
  }

  // ── 5. PLANT (back-left corner, y ≈ 19‒21) ──
  // Pot
  face([[1, 21, 0], [1, 19, 0], [0.5, 18.5, 3], [0.5, 21.5, 3]], "#d07838");
  face([[1, 19, 0], [3, 19, 0], [3.5, 18.5, 3], [0.5, 18.5, 3]], "#c06828");
  face([[3, 19, 0], [3, 21, 0], [3.5, 21.5, 3], [3.5, 18.5, 3]], "#984010");
  face([[0.5, 18.5, 3], [3.5, 18.5, 3], [3.5, 21.5, 3], [0.5, 21.5, 3]], "#e08848");
  face([[1, 19, 3], [3, 19, 3], [3, 21, 3], [1, 21, 3]], "#4a2810");
  // Foliage
  face([[-0.5, 18, 3.5], [4, 18, 3.5], [4, 22, 3.5], [-0.5, 22, 3.5]], "#28b860");
  face([[0, 18, 4], [4.5, 17.5, 4], [5, 22, 4], [0, 22.5, 4]], "#30c868");
  face([[0, 18.5, 4.5], [4, 18, 4.5], [4, 21.5, 4.5], [0, 22, 4.5]], "#22a850");
  face([[0.5, 19, 5], [3.5, 18.5, 5], [3.5, 21, 5], [0.5, 21.5, 5]], "#1e9848");
  face([[1, 19.5, 5.5], [3, 19, 5.5], [3, 21, 5.5], [1, 21, 5.5]], "#28b860");
  face([[1.5, 19.5, 6], [2.5, 19.5, 6], [2.5, 20.5, 6], [1.5, 20.5, 6]], "#30d870");

  // ── 6. DESK (y = 17‒22) + laptop + vase ──
  const dx = 7, dy = 17, dw = 12, dd = 5, dh = 5;

  // Desk legs (all four)
  for (const [legX, legY] of [[dx, dy], [dx + dw - 1, dy], [dx, dy + dd - 1], [dx + dw - 1, dy + dd - 1]] as const) {
    face([[legX, legY + 1, 0], [legX, legY, 0], [legX, legY, dh - 1], [legX, legY + 1, dh - 1]], "#c07820");
    face([[legX, legY, 0], [legX + 1, legY, 0], [legX + 1, legY, dh - 1], [legX, legY, dh - 1]], "#a06010");
  }

  // Desk surface slab
  face([[dx, dy + dd, dh - 1], [dx, dy, dh - 1], [dx, dy, dh], [dx, dy + dd, dh]], "#c07820");
  face([[dx, dy, dh - 1], [dx + dw, dy, dh - 1], [dx + dw, dy, dh], [dx, dy, dh]], "#b06818");
  face([[dx + dw, dy, dh - 1], [dx + dw, dy + dd, dh - 1], [dx + dw, dy + dd, dh], [dx + dw, dy, dh]], "#8a5008");
  face([[dx, dy, dh], [dx + dw, dy, dh], [dx + dw, dy + dd, dh], [dx, dy + dd, dh]], "#d89030");
  face([[dx, dy, dh], [dx + dw, dy, dh], [dx + dw, dy + 0.5, dh], [dx, dy + 0.5, dh]], "#e8a040");

  // Flower vase (on desk, right side — drawn after surface, back-to-front)
  const vx = dx + dw - 3.5, vy = dy + 1.5;
  face([[vx, vy + 2, dh], [vx, vy, dh], [vx - 0.3, vy - 0.3, dh + 3], [vx - 0.3, vy + 2.3, dh + 3]], "#5088c8");
  face([[vx, vy, dh], [vx + 2, vy, dh], [vx + 2.3, vy - 0.3, dh + 3], [vx - 0.3, vy - 0.3, dh + 3]], "#3868a8");
  face([[vx + 2, vy, dh], [vx + 2, vy + 2, dh], [vx + 2.3, vy + 2.3, dh + 3], [vx + 2.3, vy - 0.3, dh + 3]], "#285898");
  face([[vx - 0.3, vy - 0.3, dh + 3], [vx + 2.3, vy - 0.3, dh + 3], [vx + 2.3, vy + 2.3, dh + 3], [vx - 0.3, vy + 2.3, dh + 3]], "#6098d0");
  face([[vx + 0.3, vy + 0.3, dh + 3], [vx + 1.7, vy + 0.3, dh + 3], [vx + 1.7, vy + 1.7, dh + 3], [vx + 0.3, vy + 1.7, dh + 3]], "#2050a0");
  // Stems
  face([[vx + 0.5, vy + 1, dh + 3], [vx + 1, vy + 1, dh + 3], [vx + 1, vy + 1, dh + 5], [vx + 0.5, vy + 1, dh + 5]], "#2a7830");
  face([[vx + 1.2, vy + 0.8, dh + 3], [vx + 1.5, vy + 0.8, dh + 3], [vx + 1.5, vy + 0.8, dh + 5.5], [vx + 1.2, vy + 0.8, dh + 5.5]], "#1a6828");
  // Flowers
  face([[vx, vy + 0.5, dh + 5], [vx + 1.5, vy + 0.5, dh + 5], [vx + 1.5, vy + 1.5, dh + 5], [vx, vy + 1.5, dh + 5]], "#e03040");
  face([[vx + 0.2, vy + 0.7, dh + 5.3], [vx + 1.3, vy + 0.7, dh + 5.3], [vx + 1.3, vy + 1.3, dh + 5.3], [vx + 0.2, vy + 1.3, dh + 5.3]], "#ff4050");
  face([[vx + 0.8, vy, dh + 5.2], [vx + 2, vy, dh + 5.2], [vx + 2, vy + 1, dh + 5.2], [vx + 0.8, vy + 1, dh + 5.2]], "#f0c030");

  // Laptop (on desk, left-center — 6 wide × 4 deep)
  const lpW = 6, lpD = 4;
  const lpX = dx + 1, lpY = dy + 0.5;
  // Base slab (z = dh to dh + 0.4)
  face([[lpX, lpY + lpD, dh], [lpX, lpY, dh], [lpX, lpY, dh + 0.4], [lpX, lpY + lpD, dh + 0.4]], "#d4d8de");
  face([[lpX, lpY, dh], [lpX + lpW, lpY, dh], [lpX + lpW, lpY, dh + 0.4], [lpX, lpY, dh + 0.4]], "#c8ccd2");
  face([[lpX + lpW, lpY, dh], [lpX + lpW, lpY + lpD, dh], [lpX + lpW, lpY + lpD, dh + 0.4], [lpX + lpW, lpY, dh + 0.4]], "#9a9ea4");
  face([[lpX, lpY, dh + 0.4], [lpX + lpW, lpY, dh + 0.4], [lpX + lpW, lpY + lpD, dh + 0.4], [lpX, lpY + lpD, dh + 0.4]], "#c8ccd2");
  // Keyboard area
  face([[lpX + 0.5, lpY + 0.5, dh + 0.4], [lpX + lpW - 0.5, lpY + 0.5, dh + 0.4], [lpX + lpW - 0.5, lpY + lpD - 1.2, dh + 0.4], [lpX + 0.5, lpY + lpD - 1.2, dh + 0.4]], "#b4b8be");
  // Trackpad
  face([[lpX + 2, lpY + lpD - 1, dh + 0.4], [lpX + lpW - 2, lpY + lpD - 1, dh + 0.4], [lpX + lpW - 2, lpY + lpD - 0.3, dh + 0.4], [lpX + 2, lpY + lpD - 0.3, dh + 0.4]], "#bcc0c6");
  // Screen lid (rises from back edge, y = lpY + lpD, we see the back of lid)
  const scrY = lpY + lpD;
  face([[lpX, scrY, dh + 0.4], [lpX + lpW, scrY, dh + 0.4], [lpX + lpW, scrY, dh + 5], [lpX, scrY, dh + 5]], "#c8ccd2");
  // Lid inset panel
  face([[lpX + 0.3, scrY, dh + 0.8], [lpX + lpW - 0.3, scrY, dh + 0.8], [lpX + lpW - 0.3, scrY, dh + 4.6], [lpX + 0.3, scrY, dh + 4.6]], "#d4d8de");
  // Logo mark
  face([[lpX + 2.2, scrY, dh + 2.3], [lpX + 3.8, scrY, dh + 2.3], [lpX + 3.8, scrY, dh + 3.2], [lpX + 2.2, scrY, dh + 3.2]], "#b4b8be");
  face([[lpX + 2.5, scrY, dh + 2.5], [lpX + 3.5, scrY, dh + 2.5], [lpX + 3.5, scrY, dh + 3], [lpX + 2.5, scrY, dh + 3]], "#9a9ea4");
  // Screen lid top edge
  face([[lpX, scrY, dh + 5], [lpX + lpW, scrY, dh + 5], [lpX + lpW, scrY - 0.8, dh + 5], [lpX, scrY - 0.8, dh + 5]], "#282830");

  // ── 7. SMALL TREE (front-right corner, y ≈ 3) ──
  const tx = 18, ty = 3;
  // Pot
  face([[tx, ty + 3, 0], [tx, ty, 0], [tx - 0.3, ty - 0.3, 2.5], [tx - 0.3, ty + 3.3, 2.5]], "#8a5030");
  face([[tx, ty, 0], [tx + 3, ty, 0], [tx + 3.3, ty - 0.3, 2.5], [tx - 0.3, ty - 0.3, 2.5]], "#704028");
  face([[tx + 3, ty, 0], [tx + 3, ty + 3, 0], [tx + 3.3, ty + 3.3, 2.5], [tx + 3.3, ty - 0.3, 2.5]], "#503018");
  face([[tx - 0.3, ty - 0.3, 2.5], [tx + 3.3, ty - 0.3, 2.5], [tx + 3.3, ty + 3.3, 2.5], [tx - 0.3, ty + 3.3, 2.5]], "#a06040");
  face([[tx + 0.3, ty + 0.3, 2.5], [tx + 2.7, ty + 0.3, 2.5], [tx + 2.7, ty + 2.7, 2.5], [tx + 0.3, ty + 2.7, 2.5]], "#4a2810");
  // Trunk
  face([[tx + 1, ty + 1.8, 2.5], [tx + 2, ty + 1.8, 2.5], [tx + 2, ty + 1.8, 6], [tx + 1, ty + 1.8, 6]], "#704820");
  face([[tx + 1, ty + 1.2, 2.5], [tx + 1, ty + 1.8, 2.5], [tx + 1, ty + 1.8, 6], [tx + 1, ty + 1.2, 6]], "#8a6030");
  face([[tx + 1, ty + 1.2, 2.5], [tx + 2, ty + 1.2, 2.5], [tx + 2, ty + 1.2, 6], [tx + 1, ty + 1.2, 6]], "#5a3818");
  // Canopy layers
  face([[tx - 1, ty - 0.5, 5.5], [tx + 4, ty - 0.5, 5.5], [tx + 4, ty + 4, 5.5], [tx - 1, ty + 4, 5.5]], "#1a7838");
  face([[tx - 0.5, ty, 6], [tx + 4, ty - 0.5, 6], [tx + 4.5, ty + 3.5, 6], [tx - 0.5, ty + 4, 6]], "#22883e");
  face([[tx, ty, 6.5], [tx + 3.5, ty - 0.3, 6.5], [tx + 3.5, ty + 3.5, 6.5], [tx, ty + 3.5, 6.5]], "#209040");
  face([[tx + 0.5, ty + 0.5, 7], [tx + 3, ty + 0.3, 7], [tx + 3, ty + 3, 7], [tx + 0.5, ty + 3, 7]], "#28a048");
  face([[tx + 0.8, ty + 0.8, 7.5], [tx + 2.5, ty + 0.8, 7.5], [tx + 2.5, ty + 2.5, 7.5], [tx + 0.8, ty + 2.5, 7.5]], "#22903e");
  face([[tx + 1, ty + 1, 8], [tx + 2, ty + 1, 8], [tx + 2, ty + 2, 8], [tx + 1, ty + 2, 8]], "#30b050");
  // Highlights
  face([[tx, ty, 6.5], [tx + 1, ty - 0.3, 6.5], [tx + 1.5, ty + 0.5, 6.5], [tx + 0.5, ty + 0.8, 6.5]], "#40c868");
  face([[tx + 2.5, ty + 0.5, 6], [tx + 3.5, ty + 0.8, 6], [tx + 3.5, ty + 1.5, 6], [tx + 2.5, ty + 1.5, 6]], "#38c060");
}

// ── SHARED PAINT HELPER ──────────────────────────────────────

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

// ── ASSET CARD COMPONENT ─────────────────────────────────────

type AssetCardProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  cols: number;
  rows: number;
  label: string;
};

const AssetCard = ({ canvasRef, cols, rows, label }: AssetCardProps) => (
  <div className="officeroom-asset-card">
    <canvas
      ref={canvasRef}
      width={cols * S}
      height={rows * S}
      className="officeroom-canvas"
      aria-label={label}
    />
    <span className="officeroom-asset-label">{label}</span>
  </div>
);

// ── PRIMARY VIEW ─────────────────────────────────────────────

export const OfficeRoomPrimaryView = () => {
  const roomRef = useRef<HTMLCanvasElement>(null);
  const deskRef = useRef<HTMLCanvasElement>(null);
  const chairRef = useRef<HTMLCanvasElement>(null);
  const chairBackRef = useRef<HTMLCanvasElement>(null);
  const laptopRef = useRef<HTMLCanvasElement>(null);
  const windowRef = useRef<HTMLCanvasElement>(null);
  const plantRef = useRef<HTMLCanvasElement>(null);
  const flowerRef = useRef<HTMLCanvasElement>(null);
  const treeRef = useRef<HTMLCanvasElement>(null);
  const clockRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    paintCanvas(roomRef, drawOfficeRoom);
    paintCanvas(deskRef, drawDesk);
    paintCanvas(chairRef, drawChair);
    paintCanvas(chairBackRef, drawChairBack);
    paintCanvas(laptopRef, drawLaptop);
    paintCanvas(windowRef, drawWindow);
    paintCanvas(plantRef, drawPlantVase);
    paintCanvas(flowerRef, drawFlowerVase);
    paintCanvas(treeRef, drawSmallTree);
    paintCanvas(clockRef, drawWallClock);
  }, []);

  return (
    <section className="officeroom-view">
      <header className="officeroom-header">
        <h2>Office Room</h2>
      </header>
      <div className="officeroom-room-scene">
        <canvas
          ref={roomRef}
          width={100 * S}
          height={80 * S}
          className="officeroom-canvas"
          aria-label="Office Room Scene"
        />
      </div>
      <div className="officeroom-assets-grid">
        <AssetCard canvasRef={windowRef}    cols={34} rows={44} label="Window" />
        <AssetCard canvasRef={clockRef}     cols={22} rows={22} label="Wall Clock" />
        <AssetCard canvasRef={deskRef}      cols={44} rows={30} label="Desk" />
        <AssetCard canvasRef={chairRef}     cols={30} rows={38} label="Chair (front)" />
        <AssetCard canvasRef={chairBackRef} cols={30} rows={38} label="Chair (back)" />
        <AssetCard canvasRef={laptopRef}    cols={38} rows={36} label="Laptop" />
        <AssetCard canvasRef={plantRef}     cols={36} rows={40} label="Plant Vase" />
        <AssetCard canvasRef={flowerRef}    cols={28} rows={40} label="Flower Vase" />
        <AssetCard canvasRef={treeRef}      cols={32} rows={48} label="Small Tree" />
      </div>
    </section>
  );
};
