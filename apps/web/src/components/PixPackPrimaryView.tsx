import { OctopusGlyph } from "./EmptyOctopus";

const ANIMATIONS = [
  { label: "Idle", animation: "idle" },
  { label: "Sway", animation: "sway" },
  { label: "Walk", animation: "walk" },
  { label: "Walk Up", animation: "walk-up" },
] as const;

const COLORS = [
  { label: "Accent (default)" },
  { label: "Coral", hex: "#e05555" },
  { label: "Seafoam", hex: "#3cc9a3" },
  { label: "Lavender", hex: "#a78bfa" },
  { label: "Sky", hex: "#4a9eff" },
  { label: "Sunflower", hex: "#f5c542" },
] as const;

export const PixPackPrimaryView = () => (
  <section className="pixpack-view" aria-label="2D Pixel Pack">
    <header className="pixpack-header">
      <h2>2D Pixel Pack</h2>
    </header>

    <h3 className="pixpack-section-title">Animations</h3>
    <div className="pixpack-grid">
      {ANIMATIONS.map((a) => (
        <div key={a.label} className="pixpack-card">
          <OctopusGlyph animation={a.animation} />
          <span className="pixpack-card-label">{a.label}</span>
        </div>
      ))}
    </div>

    <h3 className="pixpack-section-title">Colors</h3>
    <div className="pixpack-grid">
      {COLORS.map((c) => (
        <div key={c.label} className="pixpack-card">
          <OctopusGlyph {...("hex" in c ? { color: c.hex } : {})} animation="idle" />
          <span className="pixpack-card-label">{c.label}</span>
          {"hex" in c && <span className="pixpack-card-hex">{c.hex}</span>}
        </div>
      ))}
    </div>
  </section>
);
