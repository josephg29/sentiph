export type CodeIntelEvent = {
  ts: string;
  sessionId: string;
  tool: string;
  file: string;
};

/* ── Treemap ────────────────────────────────────────── */

export type TreemapNode = {
  name: string;
  path: string;
  value: number;
  children: TreemapNode[];
};

export type TreemapRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  path: string;
  value: number;
  depth: number;
};

/** Build a directory tree from flat edit events, with each leaf = file edit count. */
export const buildTreemapTree = (events: CodeIntelEvent[], workspaceCwd: string): TreemapNode => {
  const counts = new Map<string, number>();
  for (const e of events) {
    counts.set(e.file, (counts.get(e.file) ?? 0) + 1);
  }

  const root: TreemapNode = { name: "root", path: "", value: 0, children: [] };

  for (const [filePath, count] of counts) {
    const relative = filePath.startsWith(workspaceCwd)
      ? filePath.slice(workspaceCwd.length + 1)
      : filePath;
    const parts = relative.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const isLeaf = i === parts.length - 1;
      const partPath = parts.slice(0, i + 1).join("/");

      if (isLeaf) {
        current.children.push({ name: part, path: partPath, value: count, children: [] });
      } else {
        let child = current.children.find((c) => c.name === part && c.children.length > 0);
        if (!child) {
          child = { name: part, path: partPath, value: 0, children: [] };
          current.children.push(child);
        }
        current = child;
      }
    }
  }

  const sumValues = (node: TreemapNode): number => {
    if (node.children.length === 0) return node.value;
    node.value = node.children.reduce((acc, c) => acc + sumValues(c), 0);
    return node.value;
  };
  sumValues(root);

  return root;
};

/** Squarified treemap layout — returns flat array of positioned rectangles. */
export const layoutTreemap = (root: TreemapNode, width: number, height: number): TreemapRect[] => {
  const rects: TreemapRect[] = [];
  if (root.value === 0) return rects;

  const layout = (node: TreemapNode, x: number, y: number, w: number, h: number, depth: number) => {
    if (node.children.length === 0) {
      rects.push({
        x,
        y,
        width: w,
        height: h,
        name: node.name,
        path: node.path,
        value: node.value,
        depth,
      });
      return;
    }

    const sorted = [...node.children].sort((a, b) => b.value - a.value);
    squarify(sorted, x, y, w, h, node.value, depth);
  };

  const squarify = (
    children: TreemapNode[],
    x: number,
    y: number,
    w: number,
    h: number,
    total: number,
    depth: number,
  ) => {
    if (children.length === 0) return;
    if (children.length === 1) {
      layout(children[0]!, x, y, w, h, depth + 1);
      return;
    }

    const isWide = w >= h;
    let row: TreemapNode[] = [];
    let rowSum = 0;
    const side = isWide ? h : w;

    let bestAspect = Number.POSITIVE_INFINITY;

    for (let i = 0; i < children.length; i++) {
      const child = children[i]!;
      const nextSum = rowSum + child.value;
      const nextRow = [...row, child];

      const aspect = worstAspect(nextRow, nextSum, side, total, isWide ? w : h);

      if (aspect <= bestAspect) {
        row = nextRow;
        rowSum = nextSum;
        bestAspect = aspect;
      } else {
        // lay out the current row and recurse on the rest
        const rowFraction = rowSum / total;
        const rowSize = (isWide ? w : h) * rowFraction;

        let offset = 0;
        for (const r of row) {
          const fraction = r.value / rowSum;
          const cellSize = side * fraction;
          if (isWide) {
            layout(r, x + offset, y, rowSize, cellSize, depth + 1);
            offset += cellSize;
          } else {
            layout(r, x, y + offset, cellSize, rowSize, depth + 1);
            offset += cellSize;
          }
        }

        const remaining = children.slice(i);
        if (isWide) {
          squarify(remaining, x + rowSize, y, w - rowSize, h, total - rowSum, depth);
        } else {
          squarify(remaining, x, y + rowSize, w, h - rowSize, total - rowSum, depth);
        }
        return;
      }
    }

    // lay out the final row
    const rowFraction = rowSum / total;
    const rowSize = (isWide ? w : h) * rowFraction;
    let offset = 0;
    for (const r of row) {
      const fraction = r.value / rowSum;
      const cellSize = side * fraction;
      if (isWide) {
        layout(r, x + offset, y, rowSize, cellSize, depth + 1);
        offset += cellSize;
      } else {
        layout(r, x, y + offset, cellSize, rowSize, depth + 1);
        offset += cellSize;
      }
    }
  };

  layout(root, 0, 0, width, height, 0);
  return rects;
};

const worstAspect = (
  row: TreemapNode[],
  rowSum: number,
  side: number,
  total: number,
  fullExtent: number,
): number => {
  const rowExtent = (rowSum / total) * fullExtent;
  if (rowExtent === 0) return Number.POSITIVE_INFINITY;

  let worst = 0;
  for (const r of row) {
    const cellSide = (r.value / rowSum) * side;
    if (cellSide === 0) continue;
    const aspect = Math.max(rowExtent / cellSide, cellSide / rowExtent);
    if (aspect > worst) worst = aspect;
  }
  return worst;
};

/* ── Coupling (Arc Diagram) ─────────────────────────── */

export type CouplingPair = {
  fileA: string;
  fileB: string;
  coSessions: number;
  totalSessions: number;
  strength: number;
};

export type CouplingFile = {
  file: string;
  edits: number;
  sessions: number;
};

export type CouplingData = {
  files: CouplingFile[];
  pairs: CouplingPair[];
};

/** Find files that co-occur in the same session. */
export const buildCouplingData = (events: CodeIntelEvent[], workspaceCwd: string): CouplingData => {
  // Group files by session
  const sessionFiles = new Map<string, Set<string>>();
  const fileEdits = new Map<string, number>();
  const fileSessions = new Map<string, Set<string>>();

  for (const e of events) {
    const relative = e.file.startsWith(workspaceCwd)
      ? e.file.slice(workspaceCwd.length + 1)
      : e.file;

    if (!sessionFiles.has(e.sessionId)) sessionFiles.set(e.sessionId, new Set());
    sessionFiles.get(e.sessionId)!.add(relative);

    fileEdits.set(relative, (fileEdits.get(relative) ?? 0) + 1);

    if (!fileSessions.has(relative)) fileSessions.set(relative, new Set());
    fileSessions.get(relative)!.add(e.sessionId);
  }

  // Build coupling pairs
  const pairKey = (a: string, b: string) => (a < b ? `${a}\0${b}` : `${b}\0${a}`);
  const pairCounts = new Map<string, { fileA: string; fileB: string; count: number }>();

  for (const files of sessionFiles.values()) {
    const fileList = [...files];
    for (let i = 0; i < fileList.length; i++) {
      for (let j = i + 1; j < fileList.length; j++) {
        const a = fileList[i]!;
        const b = fileList[j]!;
        const key = pairKey(a, b);
        const existing = pairCounts.get(key);
        if (existing) {
          existing.count++;
        } else {
          pairCounts.set(key, { fileA: a < b ? a : b, fileB: a < b ? b : a, count: 1 });
        }
      }
    }
  }

  const totalSessionCount = sessionFiles.size;

  const files: CouplingFile[] = [...fileEdits.entries()]
    .map(([file, edits]) => ({
      file,
      edits,
      sessions: fileSessions.get(file)?.size ?? 0,
    }))
    .sort((a, b) => b.edits - a.edits);

  const pairs: CouplingPair[] = [...pairCounts.values()]
    .map(({ fileA, fileB, count }) => ({
      fileA,
      fileB,
      coSessions: count,
      totalSessions: totalSessionCount,
      strength: totalSessionCount > 0 ? count / totalSessionCount : 0,
    }))
    .filter((p) => p.coSessions >= 2)
    .sort((a, b) => b.coSessions - a.coSessions);

  return { files, pairs };
};

/* ── Heat color scale ───────────────────────────────── */

const HEAT_COLORS = [
  "#1a472a",
  "#2d6a3e",
  "#4a8c3f",
  "#7fb134",
  "#b5a118",
  "#d4881a",
  "#d45a1a",
  "#cc2e2e",
];

export const heatColor = (value: number, maxValue: number): string => {
  if (maxValue === 0) return HEAT_COLORS[0]!;
  const ratio = Math.min(value / maxValue, 1);
  const index = Math.min(Math.floor(ratio * (HEAT_COLORS.length - 1)), HEAT_COLORS.length - 1);
  return HEAT_COLORS[index]!;
};
