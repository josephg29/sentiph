import {
  Check as CheckIcon,
  Hexagon,
  ListTodo,
  Terminal as TerminalIcon,
  Trash2,
} from "lucide-react";

import { SENTIPH_ID } from "../../app/hooks/useCanvasGraphData";
import type { TerminalView } from "../../app/types";
import type { ContextMenuState } from "./types";

type CanvasContextMenuProps = {
  contextMenu: ContextMenuState;
  columns: TerminalView;
  panelRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  setContextMenu: (value: ContextMenuState | null) => void;
  setPendingOpenAgentId: (value: string | null) => void;
  onCreateTerminal?: (() => Promise<string | undefined> | undefined) | undefined;
  onDeleteActiveSession?:
    | ((terminalId: string, terminalName: string, workspaceMode?: string) => void)
    | undefined;
  handleCreateAgent: (tentacleId: string) => void;
  handleTentacleAction: (tentacleId: string, action: string) => void;
  handleNodeClick: (nodeId: string) => void;
};

export const CanvasContextMenu = ({
  contextMenu,
  columns,
  panelRefs,
  setContextMenu,
  setPendingOpenAgentId,
  onCreateTerminal,
  onDeleteActiveSession,
  handleCreateAgent,
  handleTentacleAction,
  handleNodeClick,
}: CanvasContextMenuProps) => {
  return (
    <>
      <div
        aria-label="Close canvas context menu"
        className="canvas-context-menu-backdrop"
        onClick={() => setContextMenu(null)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          // Close current menu, then re-derive what's under the cursor on the SVG
          setContextMenu(null);
          // Use rAF so the backdrop is removed before we probe elementFromPoint
          requestAnimationFrame(() => {
            const under = document.elementFromPoint(e.clientX, e.clientY);
            if (under) {
              under.dispatchEvent(
                new MouseEvent("contextmenu", {
                  bubbles: true,
                  clientX: e.clientX,
                  clientY: e.clientY,
                }),
              );
            }
          });
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " " && e.key !== "Escape") return;
          e.preventDefault();
          setContextMenu(null);
        }}
        role="button"
        tabIndex={0}
      />
      <div
        className="canvas-context-menu"
        style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setContextMenu(null);
          requestAnimationFrame(() => {
            const under = document.elementFromPoint(e.clientX, e.clientY);
            if (under) {
              under.dispatchEvent(
                new MouseEvent("contextmenu", {
                  bubbles: true,
                  clientX: e.clientX,
                  clientY: e.clientY,
                }),
              );
            }
          });
        }}
      >
        {contextMenu.kind === "canvas" && (
          <button
            type="button"
            className="canvas-context-menu-item"
            onClick={() => {
              setContextMenu(null);
              const result = onCreateTerminal?.();
              if (result && typeof result.then === "function") {
                void result.then((agentId) => {
                  if (agentId) setPendingOpenAgentId(agentId);
                });
              }
            }}
          >
            <span className="canvas-context-menu-icon">
              <TerminalIcon size={14} />
            </span>
            New Terminal
          </button>
        )}
        {contextMenu.kind === "tentacle" && (
          <>
            <button
              type="button"
              className="canvas-context-menu-item"
              onClick={() => handleCreateAgent(contextMenu.tentacleId)}
            >
              <span className="canvas-context-menu-icon">
                <TerminalIcon size={14} />
              </span>
              New Terminal
            </button>
            <button
              type="button"
              className="canvas-context-menu-item"
              onClick={() =>
                handleTentacleAction(contextMenu.tentacleId, "tentacle-reorganize-todos")
              }
            >
              <span className="canvas-context-menu-icon">
                <ListTodo size={14} />
              </span>
              Update To-Do List
            </button>
            <button
              type="button"
              className="canvas-context-menu-item"
              onClick={() =>
                handleTentacleAction(contextMenu.tentacleId, "tentacle-update-tentacle")
              }
            >
              <span className="canvas-context-menu-icon">
                <Hexagon size={14} />
              </span>
              Update Tentacle
            </button>
          </>
        )}
        {contextMenu.kind === "sentiph" && (
          <button
            type="button"
            className="canvas-context-menu-item"
            onClick={() => {
              setContextMenu(null);
              handleNodeClick(`t:${SENTIPH_ID}`);
            }}
          >
            <span className="canvas-context-menu-icon">
              <TerminalIcon size={14} />
            </span>
            Open Sentiph
          </button>
        )}
        {contextMenu.kind === "active-session" && (
          <>
            <button
              type="button"
              className="canvas-context-menu-item"
              onClick={() => {
                const nodeId = contextMenu.nodeId;
                const terminal = columns.find((t) => t.terminalId === contextMenu.sessionId);
                const currentName = terminal?.tentacleName ?? contextMenu.label;
                const panel = panelRefs.current.get(nodeId);
                setContextMenu(null);
                if (panel) {
                  const input = panel.querySelector<HTMLInputElement>(
                    ".canvas-terminal-column-name--editable",
                  );
                  input?.click();
                }
                void currentName;
              }}
            >
              <span className="canvas-context-menu-icon">
                <CheckIcon size={14} />
              </span>
              Rename
            </button>
            <button
              type="button"
              className="canvas-context-menu-item canvas-context-menu-item--danger"
              onClick={() => {
                onDeleteActiveSession?.(
                  contextMenu.sessionId,
                  contextMenu.label,
                  contextMenu.workspaceMode,
                );
                setContextMenu(null);
              }}
            >
              <span className="canvas-context-menu-icon">
                <Trash2 size={14} />
              </span>
              Delete
            </button>
          </>
        )}
      </div>
    </>
  );
};
