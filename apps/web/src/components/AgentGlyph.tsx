const SIZE = 24;
const R = SIZE / 2;
const HEX_R = R * 0.85;

const hexPoints = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    pts.push(`${(R + HEX_R * Math.cos(a)).toFixed(1)},${(R + HEX_R * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
})();

type AgentGlyphProps = {
  color?: string;
  scale?: number;
  className?: string;
  testId?: string;
};

export const AgentGlyph = ({
  color = "#cc0000",
  scale = 1,
  className,
  testId,
}: AgentGlyphProps) => {
  const s = SIZE * scale;
  return (
    <svg
      width={s}
      height={s}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className={className}
      data-testid={testId}
      role="img"
      aria-label="Agent"
    >
      <polygon points={hexPoints} fill={color} stroke="rgba(0,0,0,0.15)" strokeWidth={0.8} />
      <polygon
        points={hexPoints}
        fill="none"
        stroke="rgba(255,255,255,0.25)"
        strokeWidth={0.4}
        transform={`scale(0.82) translate(${SIZE * 0.09}, ${SIZE * 0.09})`}
      />
      <rect
        x={R - 2.5}
        y={R - 2.5}
        width={5}
        height={5}
        rx={1}
        fill="rgba(255,255,255,0.5)"
        transform={`rotate(45, ${R}, ${R})`}
      />
    </svg>
  );
};
