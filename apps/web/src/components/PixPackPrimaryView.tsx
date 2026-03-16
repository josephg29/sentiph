import { OctopusGlyph } from "./EmptyOctopus";

type OctopusVariant = {
  label: string;
  color: string | undefined;
  animated: boolean;
};

const OCTOPUS_VARIANTS: OctopusVariant[] = [
  { label: "Idle (default)", color: undefined, animated: false },
  { label: "Accent (animated)", color: undefined, animated: true },
  { label: "Coral", color: "#e05555", animated: true },
  { label: "Seafoam", color: "#3cc9a3", animated: true },
  { label: "Lavender", color: "#a78bfa", animated: true },
  { label: "Sky", color: "#4a9eff", animated: true },
  { label: "Sunflower", color: "#f5c542", animated: true },
];

export const PixPackPrimaryView = () => (
  <section className="pixpack-view" aria-label="2D Pixel Pack">
    <header className="pixpack-header">
      <h2>2D Pixel Pack</h2>
      <p>Octopus sprite — {OCTOPUS_VARIANTS.length} variants</p>
    </header>
    <div className="pixpack-grid">
      {OCTOPUS_VARIANTS.map((variant) => (
        <div key={variant.label} className="pixpack-card">
          <OctopusGlyph color={variant.color} animated={variant.animated} />
          <span className="pixpack-card-label">{variant.label}</span>
          {variant.color !== undefined && <span className="pixpack-card-hex">{variant.color}</span>}
        </div>
      ))}
    </div>
  </section>
);
