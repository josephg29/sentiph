import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CouplingData } from "../app/codeIntelAggregation";

type CodeIntelArcDiagramProps = {
  data: CouplingData;
};

const ROW_HEIGHT = 24;
const LABEL_WIDTH = 280;
const ARC_AREA_WIDTH = 180;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 16;
const MAX_FILES = 30;
const MAX_ARCS = 20;

const ARC_COLORS = [
  "#d4a017",
  "#d45a1a",
  "#cc2e2e",
  "#b5611a",
  "#7fb134",
  "#4a8c3f",
  "#2d6a3e",
  "#8494ab",
];

export const CodeIntelArcDiagram = ({ data }: CodeIntelArcDiagramProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(600);
  const [hoveredPair, setHoveredPair] = useState<string | null>(null);
  const [hoveredFile, setHoveredFile] = useState<string | null>(null);

  const measure = useCallback(() => {
    if (containerRef.current) {
      setContainerWidth(containerRef.current.clientWidth);
    }
  }, []);

  useEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [measure]);

  const files = useMemo(() => data.files.slice(0, MAX_FILES), [data.files]);
  const pairs = useMemo(() => data.pairs.slice(0, MAX_ARCS), [data.pairs]);

  const fileIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < files.length; i++) {
      map.set(files[i]!.file, i);
    }
    return map;
  }, [files]);

  const svgHeight = PADDING_TOP + files.length * ROW_HEIGHT + PADDING_BOTTOM;
  const labelX = 0;
  const arcX = LABEL_WIDTH + 8;
  const availableArcWidth = Math.min(ARC_AREA_WIDTH, containerWidth - LABEL_WIDTH - 16);

  const maxCoSessions = useMemo(() => {
    let max = 0;
    for (const p of pairs) {
      if (p.coSessions > max) max = p.coSessions;
    }
    return max;
  }, [pairs]);

  const fileY = (index: number) => PADDING_TOP + index * ROW_HEIGHT + ROW_HEIGHT / 2;

  return (
    <div className="code-intel-arc-diagram" ref={containerRef}>
      {pairs.length === 0 ? (
        <div className="code-intel-empty">
          Not enough sessions to detect coupling. Files must co-occur in at least 2 sessions.
        </div>
      ) : (
        <svg
          className="code-intel-arc-svg"
          width={containerWidth}
          height={svgHeight}
          viewBox={`0 0 ${containerWidth} ${svgHeight}`}
          role="img"
          aria-label="File coupling arc diagram"
        >
          {/* File labels */}
          {files.map((f, i) => {
            const isHighlighted =
              hoveredFile === f.file ||
              (hoveredPair !== null &&
                pairs.some(
                  (p) =>
                    pairKey(p.fileA, p.fileB) === hoveredPair &&
                    (p.fileA === f.file || p.fileB === f.file),
                ));

            return (
              <g
                key={f.file}
                onMouseEnter={() => setHoveredFile(f.file)}
                onMouseLeave={() => setHoveredFile(null)}
              >
                <text
                  x={labelX + LABEL_WIDTH - 4}
                  y={fileY(i) + 4}
                  textAnchor="end"
                  className={`code-intel-arc-label${isHighlighted ? " code-intel-arc-label--active" : ""}`}
                >
                  {truncatePath(f.file, LABEL_WIDTH - 8)}
                </text>
                <circle
                  cx={arcX}
                  cy={fileY(i)}
                  r={3}
                  className={`code-intel-arc-dot${isHighlighted ? " code-intel-arc-dot--active" : ""}`}
                />
              </g>
            );
          })}

          {/* Arcs */}
          {pairs.map((pair) => {
            const idxA = fileIndexMap.get(pair.fileA);
            const idxB = fileIndexMap.get(pair.fileB);
            if (idxA === undefined || idxB === undefined) return null;

            const y1 = fileY(idxA);
            const y2 = fileY(idxB);
            const span = Math.abs(idxB - idxA);
            const curveX = arcX + Math.min(span * 14, availableArcWidth);
            const key = pairKey(pair.fileA, pair.fileB);
            const isHovered =
              hoveredPair === key || hoveredFile === pair.fileA || hoveredFile === pair.fileB;

            const thickness = maxCoSessions > 0 ? 1 + (pair.coSessions / maxCoSessions) * 3.5 : 1.5;

            const colorIndex = Math.min(
              Math.floor((pair.coSessions / Math.max(maxCoSessions, 1)) * (ARC_COLORS.length - 1)),
              ARC_COLORS.length - 1,
            );

            return (
              <path
                key={key}
                d={`M ${arcX} ${y1} C ${curveX} ${y1}, ${curveX} ${y2}, ${arcX} ${y2}`}
                fill="none"
                stroke={ARC_COLORS[colorIndex]}
                strokeWidth={isHovered ? thickness + 1 : thickness}
                strokeOpacity={isHovered ? 1 : 0.55}
                className="code-intel-arc-path"
                onMouseEnter={() => setHoveredPair(key)}
                onMouseLeave={() => setHoveredPair(null)}
              />
            );
          })}
        </svg>
      )}
    </div>
  );
};

const pairKey = (a: string, b: string) => (a < b ? `${a}\0${b}` : `${b}\0${a}`);

const truncatePath = (path: string, maxWidth: number): string => {
  const charWidth = 6.5;
  const maxChars = Math.floor(maxWidth / charWidth);
  if (path.length <= maxChars) return path;
  if (maxChars <= 5) return `\u2026${path.slice(-maxChars + 1)}`;
  return `\u2026${path.slice(-(maxChars - 1))}`;
};
