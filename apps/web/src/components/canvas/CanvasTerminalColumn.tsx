import { useState } from "react";

import type { GraphNode } from "../../app/canvas/types";
import type { TentacleView } from "../../app/types";
import { type AgentRuntimeState, AgentStateBadge } from "../AgentStateBadge";
import { TentacleTerminal } from "../TentacleTerminal";

type CanvasTerminalColumnProps = {
  node: GraphNode;
  columns: TentacleView;
  onClose: () => void;
};

export const CanvasTerminalColumn = ({ node, columns, onClose }: CanvasTerminalColumnProps) => {
  const [agentState, setAgentState] = useState<AgentRuntimeState>("idle");

  const column = columns.find((col) => col.tentacleId === node.tentacleId);
  const tentacleName = column?.tentacleName ?? node.tentacleId;
  const workspaceMode = column?.tentacleWorkspaceMode ?? "shared";

  if (!node.sessionId) return null;

  return (
    <section className="canvas-terminal-column">
      <div className="canvas-terminal-column-header" style={{ background: node.color }}>
        <div className="canvas-terminal-column-heading">
          <h2>
            <span className="canvas-terminal-column-name">{node.label}</span>
            {workspaceMode === "worktree" && (
              <span className="canvas-terminal-column-badge">WT</span>
            )}
          </h2>
        </div>
        <div className="canvas-terminal-column-actions">
          <AgentStateBadge state={agentState} />
          <button
            type="button"
            className="canvas-terminal-column-close"
            onClick={onClose}
            aria-label="Close terminal"
          >
            &times;
          </button>
        </div>
      </div>
      <div className="canvas-terminal-column-body">
        <TentacleTerminal
          terminalId={node.sessionId}
          terminalLabel={node.label}
          onAgentRuntimeStateChange={setAgentState}
        />
      </div>
    </section>
  );
};
