import { useMemo } from "react";

import { OctopusGlyph, type OctopusAnimation, type OctopusExpression, type OctopusAccessory } from "./EmptyOctopus";

// ─── Dummy tentacle data ─────────────────────────────────────────────────────

const OCTOPUS_COLORS = [
  "#d4a017", // gold
  "#e05555", // coral red
  "#4ec9b0", // teal
  "#c586c0", // purple
  "#569cd6", // blue
  "#ce9178", // peach
  "#6a9955", // green
  "#d16969", // muted red
  "#dcdcaa", // cream
  "#9cdcfe", // light blue
];

const ANIMATIONS: OctopusAnimation[] = ["sway", "walk", "jog", "bounce", "float", "swim-up"];
const EXPRESSIONS: OctopusExpression[] = ["normal", "happy", "sleepy", "angry", "surprised"];
const ACCESSORIES: OctopusAccessory[] = ["none", "none", "long", "mohawk", "side-sweep", "curly"];

type DummyTentacle = {
  id: string;
  displayName: string;
  description: string;
  status: "idle" | "active" | "blocked" | "needs-review";
  color: string;
  animation: OctopusAnimation;
  accessory: OctopusAccessory;
  expression: OctopusExpression;
  todoTotal: number;
  todoDone: number;
  todoItems: string[];
  vaultFiles: string[];
  agentCount: number;
};

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function buildDummyTentacles(): DummyTentacle[] {
  const departments = [
    { id: "database", name: "Database Layer", desc: "Schema design, migrations, indexing, and query patterns", todoItems: ["Add composite index on (org_id, email)", "Set up connection pooling", "Migrate to Drizzle ORM"], vaultFiles: ["main.md", "todo.md", "schema.md", "migrations.md"] },
    { id: "auth", name: "Authentication", desc: "OAuth2, session management, and compliance", todoItems: ["Implement OAuth2 flow", "Add session token rotation", "Audit token storage compliance"], vaultFiles: ["main.md", "todo.md", "auth-flow.md"] },
    { id: "frontend", name: "Frontend UI", desc: "React components, layout system, and design tokens", todoItems: ["Refactor sidebar layout", "Add dark mode tokens", "Fix mobile breakpoints"], vaultFiles: ["main.md", "todo.md", "components.md", "design-tokens.md"] },
    { id: "api", name: "API Surface", desc: "REST endpoints, WebSocket protocol, and rate limiting", todoItems: ["Version the REST endpoints", "Add rate limiting middleware", "Document WebSocket protocol"], vaultFiles: ["main.md", "todo.md", "endpoints.md"] },
    { id: "seo", name: "SEO & Content", desc: "Sitemap generation, meta tags, and structured data", todoItems: ["Generate sitemap", "Add meta tags pipeline", "Structured data for blog posts"], vaultFiles: ["main.md", "todo.md"] },
    { id: "deploy", name: "Deploy Pipeline", desc: "CI/CD, staging environments, and rollback strategy", todoItems: ["Set up staging environment", "Add canary deployment", "Configure rollback triggers"], vaultFiles: ["main.md", "todo.md", "infra.md", "runbooks.md"] },
    { id: "testing", name: "Test Infrastructure", desc: "Integration tests, visual regression, and CI stability", todoItems: ["Add integration test suite", "Set up visual regression", "Fix flaky CI tests"], vaultFiles: ["main.md", "todo.md", "patterns.md"] },
    { id: "monitoring", name: "Observability", desc: "Structured logging, alerting rules, and dashboards", todoItems: ["Add structured logging", "Set up alerting rules", "Dashboard for API latency"], vaultFiles: ["main.md", "todo.md", "dashboards.md"] },
  ];

  return departments.map((dept, i) => {
    const rng = seededRandom(i * 7 + 42);
    const todoTotal = dept.todoItems.length + Math.floor(rng() * 5);
    const todoDone = Math.floor(rng() * todoTotal);
    const statuses: DummyTentacle["status"][] = ["idle", "active", "blocked", "needs-review"];

    return {
      id: dept.id,
      displayName: dept.name,
      description: dept.desc,
      status: statuses[Math.floor(rng() * statuses.length)] as DummyTentacle["status"],
      color: OCTOPUS_COLORS[i % OCTOPUS_COLORS.length] as string,
      animation: ANIMATIONS[Math.floor(rng() * ANIMATIONS.length)] as OctopusAnimation,
      expression: EXPRESSIONS[Math.floor(rng() * EXPRESSIONS.length)] as OctopusExpression,
      accessory: ACCESSORIES[Math.floor(rng() * ACCESSORIES.length)] as OctopusAccessory,
      todoTotal,
      todoDone,
      todoItems: dept.todoItems,
      vaultFiles: dept.vaultFiles,
      agentCount: Math.floor(rng() * 3),
    };
  });
}

// ─── Status styling ──────────────────────────────────────────────────────────

const STATUS_LABELS: Record<DummyTentacle["status"], string> = {
  idle: "idle",
  active: "active",
  blocked: "blocked",
  "needs-review": "review",
};

// ─── Components ──────────────────────────────────────────────────────────────

const TentaclePod = ({ tentacle }: { tentacle: DummyTentacle }) => {
  const progressPct = tentacle.todoTotal > 0
    ? Math.round((tentacle.todoDone / tentacle.todoTotal) * 100)
    : 0;

  return (
    <article className="floor-pod" data-status={tentacle.status}>
      <header className="floor-pod-header">
        <span className={`floor-pod-status floor-pod-status--${tentacle.status}`}>
          {STATUS_LABELS[tentacle.status]}
        </span>
        {tentacle.agentCount > 0 && (
          <span className="floor-pod-agents">
            {Array.from({ length: tentacle.agentCount }, (_, i) => (
              <span key={i} className="floor-pod-agent-dot" style={{ backgroundColor: tentacle.color }} />
            ))}
            <span className="floor-pod-agent-count">{tentacle.agentCount}</span>
          </span>
        )}
        <div className="floor-pod-header-actions">
          <button type="button" className="floor-pod-btn">Spawn</button>
          <button type="button" className="floor-pod-btn">Vault</button>
          <button type="button" className="floor-pod-btn floor-pod-btn--secondary">Edit</button>
        </div>
      </header>

      <div className="floor-pod-body">
        <div className="floor-pod-identity">
          <div className="floor-pod-octopus">
            <OctopusGlyph
              color={tentacle.color}
              animation={tentacle.animation}
              expression={tentacle.expression}
              accessory={tentacle.accessory}
              scale={5}
            />
          </div>
          <div className="floor-pod-identity-text">
            <span className="floor-pod-name">{tentacle.displayName}</span>
            <span className="floor-pod-description">{tentacle.description}</span>
          </div>
        </div>

        <div className="floor-pod-details">
          <div className="floor-pod-progress">
            <span className="floor-pod-progress-label">
              {tentacle.todoDone}/{tentacle.todoTotal} done
            </span>
            <div className="floor-pod-progress-bar">
              <div
                className="floor-pod-progress-fill"
                style={{ width: `${progressPct}%`, backgroundColor: tentacle.color }}
              />
            </div>
          </div>

          <ul className="floor-pod-todos">
            {tentacle.todoItems.map((item) => (
              <li key={item} className="floor-pod-todo-item">
                <span className="floor-pod-todo-bullet">&#9657;</span>
                {item}
              </li>
            ))}
          </ul>

          <div className="floor-pod-vault">
            <span className="floor-pod-vault-label">vault</span>
            <div className="floor-pod-vault-files">
              {tentacle.vaultFiles.map((file) => (
                <span key={file} className="floor-pod-vault-file">{file}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
};

export const FloorExperimentPrimaryView = () => {
  const tentacles = useMemo(() => buildDummyTentacles(), []);

  return (
    <section className="floor-experiment-view" aria-label="Floor experiment">
      <div className="floor-experiment-grid">
        {tentacles.map((t) => (
          <TentaclePod key={t.id} tentacle={t} />
        ))}
      </div>
    </section>
  );
};
