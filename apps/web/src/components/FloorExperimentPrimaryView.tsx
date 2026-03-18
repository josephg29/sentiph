import { useCallback, useMemo, useState } from "react";

import { OctopusGlyph, type OctopusAnimation, type OctopusExpression, type OctopusAccessory } from "./EmptyOctopus";
import { MarkdownContent } from "./ui/MarkdownContent";

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
    };
  });
}

// ─── Dummy vault file markdown content ───────────────────────────────────────

const VAULT_MARKDOWN: Record<string, string> = {
  "main.md": `# Overview

This document captures the high-level goals, constraints, and current status of this workstream.

## Current Sprint

- Finalize schema migrations
- Wire up integration tests against staging
- Review open pull requests from last week

## Constraints

- Must remain backward-compatible with v2 API consumers
- No downtime migrations — all changes must be online-safe
- Keep query latency under 50ms p99

## Open Questions

1. Should we adopt read-replicas now or defer to next quarter?
2. How do we handle the legacy enum columns during migration?
`,
  "todo.md": `# Task List

- [x] Set up project skeleton
- [x] Define domain types
- [ ] Implement core business logic
- [ ] Add integration tests
- [ ] Wire up API endpoints
- [ ] Review and iterate on error handling
- [ ] Write deployment runbook
`,
  "schema.md": `# Schema Design

## Tables

### \`organizations\`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| name | text | unique |
| created_at | timestamptz | default now() |

### \`users\`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| org_id | uuid | FK → organizations |
| email | text | unique per org |
| role | text | admin / member / viewer |

## Indexes

- \`idx_users_org_email\` on (org_id, email) — composite for fast lookup
- \`idx_users_role\` on (role) — for role-based queries
`,
  "migrations.md": `# Migration Log

## 001 — Initial schema
- Created organizations and users tables
- Added composite index on (org_id, email)

## 002 — Add session tokens
- New \`sessions\` table with token rotation support
- Added cleanup cron for expired sessions

## 003 — Pending
- Migrate legacy enum columns to text + check constraint
`,
  "auth-flow.md": `# Authentication Flow

## OAuth2 Authorization Code Flow

1. User clicks "Sign in" → redirect to provider
2. Provider authenticates → redirect back with auth code
3. Backend exchanges code for access + refresh tokens
4. Session token issued, stored in HTTP-only cookie
5. Refresh token rotated on each use

## Token Storage

- Access tokens: in-memory only, 15 min TTL
- Refresh tokens: encrypted at rest, 30-day TTL
- Session cookies: HTTP-only, Secure, SameSite=Strict
`,
  "components.md": `# Component Architecture

## Layout Primitives
- \`<Shell>\` — top-level app frame
- \`<Sidebar>\` — collapsible left panel
- \`<Canvas>\` — main content area

## Feature Components
- \`<TentacleBoard>\` — agent column layout
- \`<TentaclePod>\` — card representation of a tentacle
- \`<TerminalPane>\` — PTY output display

## Design Tokens
- Colors defined in CSS custom properties
- Spacing: 4px base unit
- Typography: PP Neue Machina (chrome), JetBrains Mono (code)
`,
  "design-tokens.md": `# Design Tokens

## Colors
\`\`\`css
--bg-primary: #080a0f
--bg-secondary: #0b0d10
--accent-primary: #faa32c
--text-primary: #e6e6e6
--text-secondary: #8b8fa3
\`\`\`

## Typography
- Headers: PP Neue Machina Plain, 700
- Body: PP Neue Machina Plain, 400
- Code: JetBrains Mono, 400
`,
  "endpoints.md": `# API Endpoints

## Tentacles
- \`GET /api/tentacles\` — list all tentacles
- \`POST /api/tentacles\` — create a new tentacle
- \`PATCH /api/tentacles/:id\` — update tentacle metadata
- \`DELETE /api/tentacles/:id\` — remove tentacle and cleanup

## Sessions
- \`POST /api/tentacles/:id/agents\` — spawn agent terminal
- \`DELETE /api/tentacles/:id/agents/:agentId\` — kill agent

## WebSocket
- \`ws://localhost:PORT/ws/terminal/:sessionId\` — PTY stream
`,
  "infra.md": `# Infrastructure

## Environments
- **Local**: Node.js 22 + pnpm, binds 127.0.0.1
- **Staging**: Docker Compose, ephemeral databases
- **Production**: TBD — targeting containerized deploy

## Dependencies
- node-pty for terminal emulation
- xterm.js for browser-side rendering
- marked for markdown processing
`,
  "runbooks.md": `# Runbooks

## Deploy to Staging
1. Merge PR to \`main\`
2. CI builds and pushes image
3. Staging auto-deploys from \`main\` tag

## Rollback
1. Identify failing deploy via health check
2. Revert to previous image tag
3. Verify health check passes
4. Investigate root cause before re-deploying
`,
  "patterns.md": `# Test Patterns

## Integration Tests
- Use real database connections (no mocks)
- Each test gets a fresh schema via migration
- Cleanup via transaction rollback

## Naming Convention
- \`describe("FeatureName")\` at top level
- \`it("should <behavior> when <condition>")\` for cases
- Group related assertions in single test when logical

## Visual Regression
- Capture screenshots at key breakpoints
- Compare against baseline with 0.1% threshold
- Update baselines explicitly via \`--update-snapshots\`
`,
  "dashboards.md": `# Dashboards

## API Latency
- p50, p95, p99 latency by endpoint
- Error rate by status code family
- Request volume over time

## System Health
- CPU / memory per service
- Database connection pool utilization
- WebSocket active connections
`,
};

function getVaultFileContent(fileName: string): string {
  return VAULT_MARKDOWN[fileName] ?? `# ${fileName}\n\nNo content available for this file.`;
}

// ─── Status styling ──────────────────────────────────────────────────────────

const STATUS_LABELS: Record<DummyTentacle["status"], string> = {
  idle: "idle",
  active: "active",
  blocked: "blocked",
  "needs-review": "review",
};

// ─── Components ──────────────────────────────────────────────────────────────

type TentaclePodProps = {
  tentacle: DummyTentacle;
  isFocused: boolean;
  activeFileName?: string;
  onVaultFileClick?: (fileName: string) => void;
  onClose?: () => void;
};

const TentaclePod = ({ tentacle, isFocused, activeFileName, onVaultFileClick, onClose }: TentaclePodProps) => {
  const progressPct = tentacle.todoTotal > 0
    ? Math.round((tentacle.todoDone / tentacle.todoTotal) * 100)
    : 0;

  return (
    <article
      className={`floor-pod${isFocused ? " floor-pod--focused" : ""}`}
      data-status={tentacle.status}
      style={{ borderColor: tentacle.color }}
    >
      <header className="floor-pod-header">
        {isFocused && (
          <button type="button" className="floor-pod-btn floor-pod-btn--secondary" onClick={onClose}>
            ← Back
          </button>
        )}
        <button type="button" className="floor-pod-btn">Spawn</button>
        <button type="button" className="floor-pod-btn">Vault</button>
        <button type="button" className="floor-pod-btn floor-pod-btn--secondary">Edit</button>
      </header>

      <div className="floor-pod-body">
        <div className="floor-pod-identity">
          <div className="floor-pod-octopus-col">
            <div className="floor-pod-octopus">
              <OctopusGlyph
                color={tentacle.color}
                animation={tentacle.animation}
                expression={tentacle.expression}
                accessory={tentacle.accessory}
                scale={5}
              />
            </div>
            <span className={`floor-pod-status floor-pod-status--${tentacle.status}`}>
              {STATUS_LABELS[tentacle.status]}
            </span>
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
                <button
                  key={file}
                  type="button"
                  className="floor-pod-vault-file"
                  aria-current={activeFileName === file ? "true" : undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    onVaultFileClick?.(file);
                  }}
                >
                  {file}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
};

// ─── Main view ───────────────────────────────────────────────────────────────

type FocusState = {
  tentacleId: string;
  fileName: string;
};

export const FloorExperimentPrimaryView = () => {
  const tentacles = useMemo(() => buildDummyTentacles(), []);
  const [focus, setFocus] = useState<FocusState | null>(null);

  const handleVaultFileClick = useCallback((tentacleId: string, fileName: string) => {
    setFocus({ tentacleId, fileName });
  }, []);

  const handleClose = useCallback(() => {
    setFocus(null);
  }, []);

  const focusedTentacle = focus
    ? tentacles.find((t) => t.id === focus.tentacleId)
    : null;

  // data-mode drives all CSS transitions on one attribute change
  const mode = focus ? "detail" : "grid";

  return (
    <section className="floor-experiment-view" data-mode={mode} aria-label="Floor experiment">
      {/* ── Pods container: grid in grid mode, sidebar column in detail mode ── */}
      <div className="floor-pods-container">
        {tentacles.map((t) => {
          const isThis = focus?.tentacleId === t.id;
          return (
            <div
              key={t.id}
              className="floor-pod-slot"
              data-pod-role={isThis ? "focused" : focus ? "other" : "idle"}
            >
              <TentaclePod
                tentacle={t}
                isFocused={isThis}
                activeFileName={isThis ? focus?.fileName : undefined}
                onVaultFileClick={(fileName) =>
                  isThis
                    ? setFocus({ tentacleId: t.id, fileName })
                    : handleVaultFileClick(t.id, fileName)
                }
                onClose={handleClose}
              />
            </div>
          );
        })}
      </div>

      {/* ── Detail panel: markdown content (always in DOM, revealed via CSS) ── */}
      <div className="floor-detail-main">
        {focusedTentacle && focus && (
          <>
            <header className="floor-detail-main-header">
              <span className="floor-detail-main-path">
                {focusedTentacle.displayName} / <strong>{focus.fileName}</strong>
              </span>
            </header>
            <div className="floor-detail-main-content" key={focus.fileName}>
              <MarkdownContent
                content={getVaultFileContent(focus.fileName)}
                className="floor-detail-markdown"
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
};
