import { useEffect, useRef } from "react";

const SCALE = 10;
const COLS = 48;
const ROWS = 32;

// Color palette
const CLR = {
  ceiling: "#d0cac0",
  wall: "#d8ceb0",
  wallSide: "#c8be9e",
  baseboard: "#5a3c18",
  baseboardTop: "#6a4c22",
  floorA: "#8a6838",
  floorB: "#7a5828",
  floorShad: "#6a4818",
  windowFrame: "#4a2c0c",
  windowSill: "#6a4c1a",
  windowSillLight: "#7a5c2a",
  glassTop: "#c0e0f0",
  glassMid: "#94cce4",
  glassBot: "#78b8d8",
  glassRefl: "#e0f0f8",
  deskTopLight: "#9e7638",
  deskTop: "#8a6428",
  deskFront: "#6a4c18",
  deskSide: "#5a3c10",
  deskDetail: "#7a5820",
  deskHandle: "#4a2c08",
  monitorBezel: "#1c1c20",
  monitorBezelLight: "#2a2a30",
  monitorScreen: "#001420",
  glowA: "#009ec0",
  glowB: "#00bcd8",
  glowC: "#3cd4ec",
  glowDim: "#005a70",
  standGray: "#282830",
  mugRed: "#cc3322",
  mugLight: "#dd5544",
  mugDark: "#aa1c10",
  mugInside: "#1e0a04",
  mugHandle: "#bb2c18",
  notepad: "#f0ead8",
  notepadLine: "#c8c0a8",
  notepadBind: "#a09080",
} as const;

function r(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  w: number,
  h: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.fillRect(col * SCALE, row * SCALE, w * SCALE, h * SCALE);
}

function drawOfficeRoom(ctx: CanvasRenderingContext2D) {
  // ── Ceiling ──────────────────────────────────────────────
  r(ctx, 0, 0, COLS, 2, CLR.ceiling);

  // ── Back wall ────────────────────────────────────────────
  r(ctx, 0, 2, COLS, 14, CLR.wall);
  // Left & right perspective strips
  r(ctx, 0, 2, 2, 14, CLR.wallSide);
  r(ctx, 46, 2, 2, 14, CLR.wallSide);

  // ── Window ───────────────────────────────────────────────
  // Outer frame (2px border)
  r(ctx, 13, 3, 22, 11, CLR.windowFrame);
  // Glass — top panes (above crossbar)
  r(ctx, 15, 4, 9, 5, CLR.glassTop);
  r(ctx, 25, 4, 9, 5, CLR.glassTop);
  // Reflection stripe top
  r(ctx, 15, 4, 2, 4, CLR.glassRefl);
  r(ctx, 25, 4, 2, 4, CLR.glassRefl);
  // Sky gradient mid
  r(ctx, 15, 6, 9, 2, CLR.glassMid);
  r(ctx, 25, 6, 9, 2, CLR.glassMid);
  // Glass — bottom panes (below crossbar)
  r(ctx, 15, 10, 9, 3, CLR.glassBot);
  r(ctx, 25, 10, 9, 3, CLR.glassBot);
  r(ctx, 15, 10, 2, 2, CLR.glassMid);
  r(ctx, 25, 10, 2, 2, CLR.glassMid);
  // Crossbar horizontal
  r(ctx, 13, 9, 22, 1, CLR.windowFrame);
  // Crossbar vertical (center of frame)
  r(ctx, 24, 3, 1, 11, CLR.windowFrame);
  // Window sill
  r(ctx, 12, 14, 24, 1, CLR.windowSill);
  r(ctx, 13, 14, 22, 1, CLR.windowSillLight);

  // ── Baseboard ────────────────────────────────────────────
  r(ctx, 0, 15, COLS, 1, CLR.baseboardTop);
  r(ctx, 0, 15, COLS, 1, CLR.baseboard);

  // ── Floor planks ─────────────────────────────────────────
  // Top shadow strip
  r(ctx, 0, 16, COLS, 1, CLR.floorShad);
  for (let row = 17; row < ROWS; row++) {
    r(ctx, 0, row, COLS, 1, row % 2 === 0 ? CLR.floorA : CLR.floorB);
  }
  // Plank seams
  for (let row = 17; row < ROWS; row += 2) {
    ctx.fillStyle = CLR.floorShad;
    ctx.fillRect(0, row * SCALE, COLS * SCALE, 1); // 1px seam
  }

  // ── Monitor stand ────────────────────────────────────────
  r(ctx, 21, 18, 6, 1, CLR.standGray); // base plate
  r(ctx, 23, 14, 2, 4, CLR.standGray); // post

  // ── Monitor bezel ────────────────────────────────────────
  r(ctx, 16, 6, 16, 9, CLR.monitorBezel);
  // Thin lighter top edge for bevel
  r(ctx, 16, 6, 16, 1, CLR.monitorBezelLight);
  // Screen
  r(ctx, 17, 7, 14, 6, CLR.monitorScreen);
  // Screen glow content – code-like lines
  r(ctx, 18, 8, 6, 1, CLR.glowA);
  r(ctx, 18, 9, 10, 1, CLR.glowB);
  r(ctx, 18, 10, 4, 1, CLR.glowA);
  r(ctx, 23, 10, 6, 1, CLR.glowC);
  r(ctx, 18, 11, 12, 1, CLR.glowB);
  r(ctx, 18, 12, 7, 1, CLR.glowA);
  r(ctx, 26, 12, 4, 1, CLR.glowC);
  // Cursor blink
  r(ctx, 18, 13, 1, 1, CLR.glowC);
  // Bottom lip / chin
  r(ctx, 17, 14, 14, 1, CLR.monitorBezelLight);

  // ── Desk ─────────────────────────────────────────────────
  // Top surface
  r(ctx, 2, 18, 44, 1, CLR.deskTopLight);
  r(ctx, 2, 19, 44, 1, CLR.deskTop);
  // Front face
  r(ctx, 2, 20, 44, 6, CLR.deskFront);
  // Left end panel
  r(ctx, 2, 20, 1, 6, CLR.deskSide);
  // Right end panel
  r(ctx, 45, 20, 1, 6, CLR.deskSide);
  // Drawer panel (left)
  r(ctx, 6, 21, 14, 4, CLR.deskDetail);
  r(ctx, 6, 23, 14, 1, CLR.deskSide); // drawer gap
  r(ctx, 12, 22, 3, 2, CLR.deskHandle); // handle
  // Desk legs
  r(ctx, 3, 26, 3, 6, CLR.deskSide);
  r(ctx, 42, 26, 3, 6, CLR.deskSide);

  // ── Coffee mug (right of monitor) ────────────────────────
  // Body
  r(ctx, 38, 15, 3, 3, CLR.mugRed);
  r(ctx, 38, 15, 3, 1, CLR.mugLight); // rim
  r(ctx, 38, 17, 3, 1, CLR.mugDark); // bottom
  r(ctx, 38, 16, 1, 1, CLR.mugLight); // highlight
  r(ctx, 39, 16, 1, 1, CLR.mugInside); // coffee top
  // Handle
  r(ctx, 41, 15, 1, 1, CLR.mugHandle);
  r(ctx, 41, 17, 1, 1, CLR.mugHandle);

  // ── Notepad (left of monitor) ────────────────────────────
  r(ctx, 6, 16, 8, 2, CLR.notepad);
  r(ctx, 6, 16, 1, 2, CLR.notepadBind); // binding
  r(ctx, 8, 17, 5, 1, CLR.notepadLine); // ruled line
  r(ctx, 6, 16, 8, 1, "#ddd6c2"); // top edge shadow
}

export const OfficeRoomPrimaryView = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawOfficeRoom(ctx);
  }, []);

  return (
    <section className="officeroom-view">
      <header className="officeroom-header">
        <h2>Office Room</h2>
      </header>
      <div className="officeroom-canvas-wrapper">
        <canvas
          ref={canvasRef}
          width={COLS * SCALE}
          height={ROWS * SCALE}
          className="officeroom-canvas"
          aria-label="Pixel art front view of an office room with walls, window, desk, and computer"
        />
        <p className="officeroom-caption">pixel art · front view · {COLS}×{ROWS}</p>
      </div>
    </section>
  );
};
