import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CouplingData, CouplingPair } from "../app/codeIntelAggregation";
import { heatColor } from "../app/codeIntelAggregation";

type CodeIntelArcDiagramProps = {
  data: CouplingData;
};

const LABEL_HEIGHT = 40;
const PADDING_X = 8;
const MIN_ARC_AREA = 60;
const MAX_FILES = 40;
const MAX_ARCS = 20;

const ACCENT = "#d4a017";

export const CodeIntelArcDiagram = ({ data }: CodeIntelArcDiagramProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 600, height: 400 });
  const [hoveredPair, setHoveredPair] = useState<string | null>(null);
  const [hoveredFile, setHoveredFile] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

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

  // Build per-file coupling summaries for hover tooltip
  const fileCouplingMap = useMemo(() => {
    const map = new Map<string, { partner: string; coSessions: number }[]>();
    for (const p of pairs) {
      if (!map.has(p.fileA)) map.set(p.fileA, []);
      if (!map.has(p.fileB)) map.set(p.fileB, []);
      map.get(p.fileA)!.push({ partner: p.fileB, coSessions: p.coSessions });
      map.get(p.fileB)!.push({ partner: p.fileA, coSessions: p.coSessions });
    }
    // Sort by co-session count descending
    for (const entries of map.values()) {
      entries.sort((a, b) => b.coSessions - a.coSessions);
    }
    return map;
  }, [pairs]);

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

  const hoveredPairData = useMemo(() => {
    if (!hoveredPair) return null;
    return pairs.find((p) => pairKey(p.fileA, p.fileB) === hoveredPair) ?? null;
  }, [hoveredPair, pairs]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  return (
    <div className="code-intel-arc-diagram" ref={containerRef} onMouseMove={handleMouseMove}>
      <svg
        className="code-intel-arc-svg"
        width={size.width}
        height={size.height}
        viewBox={`0 0 ${size.width} ${size.height}`}
        role="img"
        aria-label="File coupling arc diagram"
      >
        {/* Arcs */}
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

          const d = `M ${x1} ${dotY} C ${x1} ${curveY}, ${x2} ${curveY}, ${x2} ${dotY}`;

          return (
            <g key={key}>
              {/* Invisible wide hit area */}
              <path
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={12}
                onMouseEnter={() => setHoveredPair(key)}
                onMouseLeave={() => setHoveredPair(null)}
                style={{ cursor: "crosshair" }}
              />
              {/* Visible thin edge */}
              <path
                d={d}
                fill="none"
                stroke={heatColor(pair.coSessions, maxCoSessions)}
                strokeWidth={isHovered ? 1.5 : 0.75}
                strokeOpacity={isHovered ? 1 : 0.4}
                className="code-intel-arc-path"
                pointerEvents="none"
              />
            </g>
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
                fill={ACCENT}
                fillOpacity={isHighlighted ? 1 : 0.7}
                stroke={isHighlighted ? "#fff" : "none"}
                strokeWidth={isHighlighted ? 1.5 : 0}
              />
              <text
                x={x}
                y={dotY + 16}
                textAnchor="middle"
                className={`code-intel-arc-label${isHighlighted ? " code-intel-arc-label--active" : ""}`}
              >
                {truncateLabel(shortName, colWidth - 4)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Edge hover tooltip */}
      {hoveredPairData && !hoveredFile && (
        <div
          className="code-intel-tooltip"
          style={{
            left: mousePos.x > size.width / 2 ? mousePos.x - 200 : mousePos.x + 12,
            top: Math.max(mousePos.y - 40, 4),
          }}
        >
          <div className="code-intel-tooltip-path">
            {shortFileName(hoveredPairData.fileA)} ↔ {shortFileName(hoveredPairData.fileB)}
          </div>
          <div className="code-intel-tooltip-value">
            {hoveredPairData.coSessions} co-edit{hoveredPairData.coSessions !== 1 ? "s" : ""}
          </div>
        </div>
      )}

      {/* Node hover tooltip — anchored above the dot, grows upward */}
      {hoveredFile && (
        <div
          className="code-intel-tooltip code-intel-tooltip--node"
          style={{
            left: Math.min(
              Math.max(fileX(fileIndexMap.get(hoveredFile) ?? 0) - 110, 4),
              size.width - 228,
            ),
            bottom: size.height - dotY + 12,
          }}
        >
          <div className="code-intel-tooltip-path">{hoveredFile}</div>
          {fileCouplingMap.has(hoveredFile) ? (
            <div className="code-intel-tooltip-coupling-list">
              {fileCouplingMap.get(hoveredFile)!.map((c) => (
                <div key={c.partner} className="code-intel-tooltip-coupling-row">
                  <span className="code-intel-tooltip-coupling-partner">
                    {shortFileName(c.partner)}
                  </span>
                  <span className="code-intel-tooltip-coupling-count">
                    {c.coSessions}×
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="code-intel-tooltip-value">No coupling detected</div>
          )}
        </div>
      )}
    </div>
  );
};

const pairKey = (a: string, b: string) => (a < b ? `${a}\0${b}` : `${b}\0${a}`);

const shortFileName = (path: string): string => path.split("/").pop() ?? path;

const truncateLabel = (label: string, maxWidth: number): string => {
  const charWidth = 6.5;
  const maxChars = Math.floor(maxWidth / charWidth);
  if (label.length <= maxChars) return label;
  if (maxChars <= 3) return "";
  return `${label.slice(0, maxChars - 1)}\u2026`;
};
