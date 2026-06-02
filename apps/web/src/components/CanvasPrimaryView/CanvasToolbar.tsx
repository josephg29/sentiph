import { Maximize, Pause, Play, Plus, RefreshCw, Trash2 } from "lucide-react";

import type { GraphNode } from "../../app/canvas/types";

type CanvasToolbarProps = {
  hideIdleTerminals: boolean;
  waitingNodes: GraphNode[];
  setPendingOpenAgentId: (value: string | null) => void;
  setHideIdleTerminals: (updater: (prev: boolean) => boolean) => void;
  setIsDeleteAllDialogOpen: (value: boolean) => void;
  handleFitView: () => void;
  handleRefresh: () => void;
  handleNodeClick: (nodeId: string) => void;
  onCreateTerminal?: (() => Promise<string | undefined> | undefined) | undefined;
};

export const CanvasToolbar = ({
  hideIdleTerminals,
  waitingNodes,
  setPendingOpenAgentId,
  setHideIdleTerminals,
  setIsDeleteAllDialogOpen,
  handleFitView,
  handleRefresh,
  handleNodeClick,
  onCreateTerminal,
}: CanvasToolbarProps) => {
  return (
    <>
      {/* Canvas toolbar — top-left action buttons */}
      <div className="canvas-toolbar" role="toolbar" aria-label="Canvas actions">
        <button
          type="button"
          className="canvas-toolbar-btn canvas-toolbar-btn--new"
          onClick={() => {
            const result = onCreateTerminal?.();
            if (result && typeof result.then === "function") {
              void result.then((agentId) => {
                if (agentId) setPendingOpenAgentId(agentId);
              });
            }
          }}
          aria-label="New agent"
          title="Spawn a new Sentiph agent session"
        >
          <span className="canvas-toolbar-icon">
            <Plus size={14} />
          </span>
          <span className="canvas-toolbar-label">New Agent</span>
        </button>
        <div className="canvas-toolbar-separator" />
        <button type="button" className="canvas-toolbar-btn" onClick={handleFitView}>
          <span className="canvas-toolbar-icon">
            <Maximize size={14} />
          </span>
          <span className="canvas-toolbar-label">Fit</span>
        </button>
        <button type="button" className="canvas-toolbar-btn" onClick={handleRefresh}>
          <span className="canvas-toolbar-icon">
            <RefreshCw size={14} />
          </span>
          <span className="canvas-toolbar-label">Refresh</span>
        </button>
        <div className="canvas-toolbar-separator" />
        <button
          type="button"
          className={`canvas-toolbar-btn${hideIdleTerminals ? " canvas-toolbar-btn--active" : ""}`}
          onClick={() => setHideIdleTerminals((prev) => !prev)}
        >
          <span className="canvas-toolbar-icon">
            {hideIdleTerminals ? <Play size={14} /> : <Pause size={14} />}
          </span>
          <span className="canvas-toolbar-label">
            {hideIdleTerminals ? "Show Idle" : "Hide Idle"}
          </span>
        </button>
        <div className="canvas-toolbar-separator" />
        <button
          type="button"
          className="canvas-toolbar-btn canvas-toolbar-btn--danger"
          onClick={() => setIsDeleteAllDialogOpen(true)}
        >
          <span className="canvas-toolbar-icon">
            <Trash2 size={14} />
          </span>
          <span className="canvas-toolbar-label">Delete All</span>
        </button>
      </div>

      {/* Waiting notifications — compact bars below the toolbar */}
      {waitingNodes.length > 0 && (
        <div className="canvas-waiting-list">
          {waitingNodes.map((node) => {
            const nameRaw = node.label;
            const name = nameRaw.length > 20 ? `${nameRaw.slice(0, 20)}…` : nameRaw;
            const prefix =
              node.agentRuntimeState === "waiting_for_permission"
                ? `${node.waitingToolName ?? "Permission"}: `
                : "Waiting: ";
            return (
              <button
                key={node.id}
                type="button"
                className="canvas-waiting-bar"
                onClick={() => handleNodeClick(node.id)}
              >
                <span className="canvas-waiting-bar-name">
                  <span className="canvas-waiting-bar-prefix">{prefix}</span>
                  {name}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
};
