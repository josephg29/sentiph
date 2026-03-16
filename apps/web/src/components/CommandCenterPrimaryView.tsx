import { useState } from "react";

// ── DEMO DATA ───────────────────────────────────────────────

type DepartmentStatus = "active" | "idle" | "blocked" | "needs-review";
type AgentStatus = "live" | "idle" | "queued";

type TodoItem = {
  id: string;
  text: string;
  done: boolean;
  suggested?: boolean;
};

type VaultDoc = {
  name: string;
  snippet: string;
  updatedAt: string;
};

type Agent = {
  id: string;
  label: string;
  status: AgentStatus;
  task: string;
};

type Department = {
  id: string;
  displayName: string;
  icon: string;
  status: DepartmentStatus;
  color: string;
  scope: string[];
  todos: TodoItem[];
  vault: VaultDoc[];
  agents: Agent[];
};

const DEMO_DEPARTMENTS: Department[] = [
  {
    id: "marketing",
    displayName: "Marketing",
    icon: "\u{1F4E3}",
    status: "active",
    color: "#e85d75",
    scope: ["apps/web/src/pages/landing/*", "content/blog/*"],
    todos: [
      { id: "m1", text: "Write launch blog post draft", done: true },
      { id: "m2", text: "Create product screenshots for landing page", done: true },
      { id: "m3", text: "Draft changelog for v0.4 release", done: false },
      { id: "m4", text: "Review SEO meta tags on all public pages", done: false },
      { id: "m5", text: "A/B test hero copy variants", done: false, suggested: true },
    ],
    vault: [
      { name: "main.md", snippet: "Marketing tentacle — owns landing page, blog, and launch comms.", updatedAt: "2026-03-15" },
      { name: "brand-voice.md", snippet: "Tone: technical but approachable. Avoid buzzwords. Lead with what it does, not what it is.", updatedAt: "2026-03-14" },
      { name: "launch-plan.md", snippet: "Phase 1: dev preview (invite-only). Phase 2: public beta with blog + HN post.", updatedAt: "2026-03-12" },
    ],
    agents: [
      { id: "mkt-a1", label: "blog-writer", status: "live", task: "Drafting v0.4 changelog" },
    ],
  },
  {
    id: "documentation",
    displayName: "Documentation",
    icon: "\u{1F4D6}",
    status: "needs-review",
    color: "#4a9eff",
    scope: ["docs/*", "context/*"],
    todos: [
      { id: "d1", text: "Write getting-started guide", done: true },
      { id: "d2", text: "Document tentacle lifecycle API", done: true },
      { id: "d3", text: "Add worktree setup walkthrough", done: true },
      { id: "d4", text: "Review API reference for accuracy", done: false },
      { id: "d5", text: "Add architecture diagram to docs/", done: false },
      { id: "d6", text: "Document monitor configuration options", done: false },
      { id: "d7", text: "Proofread getting-started for tone consistency", done: false, suggested: true },
    ],
    vault: [
      { name: "main.md", snippet: "Documentation tentacle — owns all user-facing docs, guides, and API reference.", updatedAt: "2026-03-16" },
      { name: "style-guide.md", snippet: "Use second person. Keep sentences short. Code examples must be runnable.", updatedAt: "2026-03-13" },
      { name: "api-reference.md", snippet: "REST endpoints: POST /tentacles, GET /tentacles/:id, DELETE /tentacles/:id...", updatedAt: "2026-03-15" },
      { name: "diagrams.md", snippet: "Architecture diagrams use Mermaid. Keep node labels under 4 words.", updatedAt: "2026-03-10" },
    ],
    agents: [
      { id: "doc-a1", label: "api-reviewer", status: "idle", task: "Finished API reference review" },
    ],
  },
  {
    id: "backend",
    displayName: "Backend",
    icon: "\u{2699}\u{FE0F}",
    status: "active",
    color: "#33cc66",
    scope: ["apps/api/src/*", "packages/core/src/*"],
    todos: [
      { id: "b1", text: "Implement vault read/write endpoints", done: true },
      { id: "b2", text: "Add todo.md CRUD via API", done: false },
      { id: "b3", text: "Wire department status to tentacle registry", done: false },
      { id: "b4", text: "Add scope validation middleware", done: false },
    ],
    vault: [
      { name: "main.md", snippet: "Backend tentacle — owns API server, core domain logic, and runtime adapters.", updatedAt: "2026-03-16" },
      { name: "api-design.md", snippet: "All endpoints return JSON. Use 409 for conflicts. Vault ops are file-system backed.", updatedAt: "2026-03-15" },
    ],
    agents: [
      { id: "be-a1", label: "vault-api", status: "live", task: "Implementing vault read endpoint" },
      { id: "be-a2", label: "todo-api", status: "queued", task: "Waiting for vault-api to land" },
    ],
  },
  {
    id: "frontend",
    displayName: "Frontend",
    icon: "\u{1F3A8}",
    status: "idle",
    color: "#d6a21a",
    scope: ["apps/web/src/components/*", "apps/web/src/styles/*"],
    todos: [
      { id: "f1", text: "Build Floor view component", done: false },
      { id: "f2", text: "Add department detail panel", done: false },
      { id: "f3", text: "Wire vault document viewer", done: false },
    ],
    vault: [
      { name: "main.md", snippet: "Frontend tentacle — owns React UI, CSS modules, and app-level hooks.", updatedAt: "2026-03-16" },
    ],
    agents: [],
  },
  {
    id: "devops",
    displayName: "DevOps",
    icon: "\u{1F680}",
    status: "blocked",
    color: "#ff6b35",
    scope: [".github/*", "Dockerfile", "deploy/*"],
    todos: [
      { id: "o1", text: "Set up CI pipeline", done: true },
      { id: "o2", text: "Configure staging environment", done: false },
      { id: "o3", text: "Add health check endpoint", done: false },
    ],
    vault: [
      { name: "main.md", snippet: "DevOps tentacle — owns CI/CD, deployment, and infrastructure.", updatedAt: "2026-03-11" },
      { name: "ci-pipeline.md", snippet: "GitHub Actions: lint + test on PR, build + deploy on merge to main.", updatedAt: "2026-03-11" },
    ],
    agents: [],
  },
];

// ── HELPERS ──────────────────────────────────────────────────

const STATUS_META: Record<DepartmentStatus, { label: string; cssClass: string }> = {
  active: { label: "Active", cssClass: "cmdcenter-status--active" },
  idle: { label: "Idle", cssClass: "cmdcenter-status--idle" },
  blocked: { label: "Blocked", cssClass: "cmdcenter-status--blocked" },
  "needs-review": { label: "Needs Review", cssClass: "cmdcenter-status--review" },
};

const AGENT_STATUS_META: Record<AgentStatus, { label: string; cssClass: string }> = {
  live: { label: "Live", cssClass: "cmdcenter-agent-status--live" },
  idle: { label: "Idle", cssClass: "cmdcenter-agent-status--idle" },
  queued: { label: "Queued", cssClass: "cmdcenter-agent-status--queued" },
};

type DetailTab = "todo" | "vault" | "agents";

// ── COMPONENT ───────────────────────────────────────────────

export const CommandCenterPrimaryView = () => {
  const [selectedId, setSelectedId] = useState<string>("marketing");
  const [activeTab, setActiveTab] = useState<DetailTab>("todo");
  const [todos, setTodos] = useState<Record<string, TodoItem[]>>(
    Object.fromEntries(DEMO_DEPARTMENTS.map((d) => [d.id, d.todos])),
  );

  const selected = DEMO_DEPARTMENTS.find((d) => d.id === selectedId) ?? DEMO_DEPARTMENTS[0];
  const currentTodos = todos[selected.id] ?? selected.todos;
  const doneCount = currentTodos.filter((t) => t.done).length;
  const totalCount = currentTodos.length;

  const handleToggleTodo = (todoId: string) => {
    setTodos((prev) => ({
      ...prev,
      [selected.id]: (prev[selected.id] ?? selected.todos).map((t) =>
        t.id === todoId ? { ...t, done: !t.done } : t,
      ),
    }));
  };

  return (
    <section className="cmdcenter-view" aria-label="Command Center primary view">
      {/* ── Department sidebar ── */}
      <nav className="cmdcenter-sidebar" aria-label="Department list">
        <header className="cmdcenter-sidebar-header">
          <h2>Departments</h2>
          <span className="cmdcenter-sidebar-count">{DEMO_DEPARTMENTS.length}</span>
        </header>
        <ol className="cmdcenter-dept-list">
          {DEMO_DEPARTMENTS.map((dept) => {
            const deptTodos = todos[dept.id] ?? dept.todos;
            const done = deptTodos.filter((t) => t.done).length;
            const total = deptTodos.length;
            const meta = STATUS_META[dept.status];
            return (
              <li key={dept.id}>
                <button
                  className="cmdcenter-dept-item"
                  data-active={dept.id === selectedId ? "true" : undefined}
                  onClick={() => {
                    setSelectedId(dept.id);
                    setActiveTab("todo");
                  }}
                  type="button"
                >
                  <div className="cmdcenter-dept-item-top">
                    <span className="cmdcenter-dept-icon">{dept.icon}</span>
                    <span className="cmdcenter-dept-name">{dept.displayName}</span>
                    <span className={`cmdcenter-status-pill ${meta.cssClass}`}>{meta.label}</span>
                  </div>
                  <div className="cmdcenter-dept-item-bottom">
                    <div className="cmdcenter-progress-bar">
                      <div
                        className="cmdcenter-progress-fill"
                        style={{
                          width: total > 0 ? `${(done / total) * 100}%` : "0%",
                          background: dept.color,
                        }}
                      />
                    </div>
                    <span className="cmdcenter-progress-label">
                      {done}/{total}
                    </span>
                    {dept.agents.length > 0 ? (
                      <span className="cmdcenter-agent-count">
                        {dept.agents.length} agent{dept.agents.length > 1 ? "s" : ""}
                      </span>
                    ) : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* ── Detail panel ── */}
      <main className="cmdcenter-detail" aria-label={`${selected.displayName} department detail`}>
        <header className="cmdcenter-detail-header">
          <div className="cmdcenter-detail-title-row">
            <span className="cmdcenter-detail-icon">{selected.icon}</span>
            <h2>{selected.displayName}</h2>
            <span className={`cmdcenter-status-pill ${STATUS_META[selected.status].cssClass}`}>
              {STATUS_META[selected.status].label}
            </span>
          </div>
          <div className="cmdcenter-scope-row">
            {selected.scope.map((s) => (
              <code key={s} className="cmdcenter-scope-tag">{s}</code>
            ))}
          </div>
        </header>

        {/* ── Tabs ── */}
        <nav className="cmdcenter-tabs" role="tablist" aria-label="Department detail tabs">
          {(["todo", "vault", "agents"] as const).map((tab) => (
            <button
              key={tab}
              className="cmdcenter-tab"
              role="tab"
              aria-selected={activeTab === tab}
              data-active={activeTab === tab ? "true" : undefined}
              onClick={() => setActiveTab(tab)}
              type="button"
            >
              {tab === "todo" ? `Todo (${doneCount}/${totalCount})` : null}
              {tab === "vault" ? `Vault (${selected.vault.length})` : null}
              {tab === "agents" ? `Agents (${selected.agents.length})` : null}
            </button>
          ))}
        </nav>

        {/* ── Tab content ── */}
        <div className="cmdcenter-tab-content">
          {/* ── TODO TAB ── */}
          {activeTab === "todo" ? (
            <div className="cmdcenter-todo-panel">
              <div className="cmdcenter-todo-summary">
                <div className="cmdcenter-progress-bar cmdcenter-progress-bar--large">
                  <div
                    className="cmdcenter-progress-fill"
                    style={{
                      width: totalCount > 0 ? `${(doneCount / totalCount) * 100}%` : "0%",
                      background: selected.color,
                    }}
                  />
                </div>
                <span className="cmdcenter-todo-summary-label">
                  {doneCount} of {totalCount} complete
                </span>
              </div>
              <ol className="cmdcenter-todo-list">
                {currentTodos.map((todo) => (
                  <li key={todo.id} className="cmdcenter-todo-item" data-done={todo.done ? "true" : undefined}>
                    <button
                      className="cmdcenter-todo-checkbox"
                      onClick={() => handleToggleTodo(todo.id)}
                      aria-label={`Toggle: ${todo.text}`}
                      type="button"
                    >
                      {todo.done ? (
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="1.5" y="1.5" width="13" height="13" rx="2" />
                          <path d="M4.5 8l2.5 2.5 4.5-5" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="1.5" y="1.5" width="13" height="13" rx="2" />
                        </svg>
                      )}
                    </button>
                    <span className="cmdcenter-todo-text">
                      {todo.text}
                      {todo.suggested ? <span className="cmdcenter-todo-suggested">suggested</span> : null}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {/* ── VAULT TAB ── */}
          {activeTab === "vault" ? (
            <div className="cmdcenter-vault-panel">
              {selected.vault.map((doc) => (
                <button key={doc.name} className="cmdcenter-vault-card" type="button">
                  <div className="cmdcenter-vault-card-top">
                    <span className="cmdcenter-vault-card-icon">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 1h6l4 4v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z" />
                        <path d="M10 1v4h4" />
                      </svg>
                    </span>
                    <strong className="cmdcenter-vault-card-name">{doc.name}</strong>
                    <time className="cmdcenter-vault-card-date">{doc.updatedAt}</time>
                  </div>
                  <p className="cmdcenter-vault-card-snippet">{doc.snippet}</p>
                </button>
              ))}
            </div>
          ) : null}

          {/* ── AGENTS TAB ── */}
          {activeTab === "agents" ? (
            <div className="cmdcenter-agents-panel">
              {selected.agents.length === 0 ? (
                <div className="cmdcenter-agents-empty">
                  <p>No agents running in this department.</p>
                  <button className="cmdcenter-spawn-btn" type="button">
                    Spawn Agent
                  </button>
                </div>
              ) : (
                <>
                  {selected.agents.map((agent) => {
                    const agentMeta = AGENT_STATUS_META[agent.status];
                    return (
                      <div key={agent.id} className="cmdcenter-agent-card">
                        <div className="cmdcenter-agent-card-top">
                          <span className={`cmdcenter-agent-dot ${agentMeta.cssClass}`} />
                          <strong className="cmdcenter-agent-label">{agent.label}</strong>
                          <span className={`cmdcenter-agent-status-pill ${agentMeta.cssClass}`}>
                            {agentMeta.label}
                          </span>
                        </div>
                        <p className="cmdcenter-agent-task">{agent.task}</p>
                      </div>
                    );
                  })}
                  <button className="cmdcenter-spawn-btn" type="button">
                    Spawn Agent
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>
      </main>
    </section>
  );
};
