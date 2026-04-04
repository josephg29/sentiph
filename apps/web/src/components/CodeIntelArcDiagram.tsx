import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CouplingData } from "../app/codeIntelAggregation";

type CodeIntelArcDiagramProps = {
  data: CouplingData;
};

const LABEL_HEIGHT = 40;
const PADDING_X = 8;
const MIN_ARC_AREA = 60;
const MAX_FILES = 40;
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
  const [size, setSize] = useState({ width: 600, height: 400 });
  const [hoveredPair, setHoveredPair] = useState<string | null>(null);
  const [hoveredFile, setHoveredFile] = useState<string | null>(null);

  const measure = useCallback(() => {
    if (containerRef.current) {
      setSize({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
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

  const usableWidth = size.width - PADDING_X * 2;
  const colWidth = files.length > 0 ? usableWidth / files.length : 0;
  const arcAreaHeight = Math.max(size.height - LABEL_HEIGHT, MIN_ARC_AREA);
  const dotY = arcAreaHeight;

  const maxCoSessions = useMemo(() => {
    let max = 0;
    for (const p of pairs) {
      if (p.coSessions > max) max = p.coSessions;
    }
    return max;
  }, [pairs]);

  const fileX = (index: number) => PADDING_X + index * colWidth + colWidth / 2;

  return (
    <div className="code-intel-arc-diagram" ref={containerRef}>
      <svg
        className="code-intel-arc-svg"
        width={size.width}
        height={size.height}
        viewBox={`0 0 ${size.width} ${size.height}`}
        role="img"
        aria-label="File coupling arc diagram"
      >
        {/* Arcs (drawn first so they appear behind dots) */}
        {pairs.map((pair) => {
          const idxA = fileIndexMap.get(pair.fileA);
          const idxB = fileIndexMap.get(pair.fileB);
          if (idxA === undefined || idxB === undefined) return null;

          const x1 = fileX(idxA);
          const x2 = fileX(idxB);
          const span = Math.abs(idxB - idxA);
          const arcHeight = Math.min(span * 20, arcAreaHeight - 20);
          const curveY = dotY - arcHeight;
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
              d={`M ${x1} ${dotY} C ${x1} ${curveY}, ${x2} ${curveY}, ${x2} ${dotY}`}
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

        {/* File dots and labels */}
        {files.map((f, i) => {
          const x = fileX(i);
          const isHighlighted =
            hoveredFile === f.file ||
            (hoveredPair !== null &&
              pairs.some(
                (p) =>
                  pairKey(p.fileA, p.fileB) === hoveredPair &&
                  (p.fileA === f.file || p.fileB === f.file),
              ));

          const shortName = f.file.split("/").pop() ?? f.file;

          return (
            <g
              key={f.file}
              onMouseEnter={() => setHoveredFile(f.file)}
              onMouseLeave={() => setHoveredFile(null)}
              className="code-intel-arc-file-group"
            >
              <circle
                cx={x}
                cy={dotY}
                r={4}
                className={`code-intel-arc-dot${isHighlighted ? " code-intel-arc-dot--active" : ""}`}
              />
              <text
                x={x}
                y={dotY + 16}
                textAnchor="middle"
                className={`code-intel-arc-label${isHighlighted ? " code-intel-arc-label--active" : ""}`}
              >
                {truncateLabel(shortName, colWidth - 4)}
              </text>
              {isHighlighted && (
                <text x={x} y={dotY + 28} textAnchor="middle" className="code-intel-arc-fullpath">
                  {f.file}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const pairKey = (a: string, b: string) => (a < b ? `${a}\0${b}` : `${b}\0${a}`);

const truncateLabel = (label: string, maxWidth: number): string => {
  const charWidth = 6.5;
  const maxChars = Math.floor(maxWidth / charWidth);
  if (label.length <= maxChars) return label;
  if (maxChars <= 3) return "";
  return `${label.slice(0, maxChars - 1)}\u2026`;
};
