import type { GraphNode } from "../../app/canvas/types";
import type { ConversationSessionSummary, TerminalView } from "../../app/types";
import { CanvasTentaclePanel } from "../canvas/CanvasTentaclePanel";
import { CanvasTerminalColumn } from "../canvas/CanvasTerminalColumn";

type CanvasTerminalsPanelProps = {
  terminalsPanelRef: React.RefObject<HTMLDivElement | null>;
  terminalsPanelWidth: number | null;
  isHydratingTerminals: boolean;
  openTentacles: Map<string, GraphNode>;
  openTerminals: Map<string, GraphNode>;
  selectedNodeId: string | null;
  columns: TerminalView;
  terminalLayoutVersion: string;
  sessionsByTentacleId: ReadonlyMap<string, ConversationSessionSummary[]>;
  setPanelRef: (nodeId: string) => (element: HTMLElement | null) => void;
  setSelectedNodeId: (value: string | null) => void;
  handleCloseTentacle: (nodeId: string) => void;
  handleCreateAgent: (tentacleId: string) => void;
  handleMinimizeTerminal: (nodeId: string) => void;
  handleCloseTerminal: (node: GraphNode) => void;
  handleDividerPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleDividerPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleDividerPointerUp: () => void;
  onNavigateToConversation?: ((sessionId: string) => void) | undefined;
  onTerminalRenamed?: ((terminalId: string, tentacleName: string) => void) | undefined;
  onTerminalActivity?: ((terminalId: string) => void) | undefined;
};

export const CanvasTerminalsPanel = ({
  terminalsPanelRef,
  terminalsPanelWidth,
  isHydratingTerminals,
  openTentacles,
  openTerminals,
  selectedNodeId,
  columns,
  terminalLayoutVersion,
  sessionsByTentacleId,
  setPanelRef,
  setSelectedNodeId,
  handleCloseTentacle,
  handleCreateAgent,
  handleMinimizeTerminal,
  handleCloseTerminal,
  handleDividerPointerDown,
  handleDividerPointerMove,
  handleDividerPointerUp,
  onNavigateToConversation,
  onTerminalRenamed,
  onTerminalActivity,
}: CanvasTerminalsPanelProps) => {
  return (
    <>
      <div
        className="canvas-panel-divider"
        role="separator"
        aria-orientation="vertical"
        tabIndex={0}
        onPointerDown={handleDividerPointerDown}
        onPointerMove={handleDividerPointerMove}
        onPointerUp={handleDividerPointerUp}
      />
      <div
        ref={terminalsPanelRef}
        className="canvas-terminals-panel"
        style={terminalsPanelWidth != null ? { flex: `0 0 ${terminalsPanelWidth}px` } : undefined}
      >
        {Array.from(openTentacles.entries()).map(([nodeId, node]) => (
          <CanvasTentaclePanel
            key={nodeId}
            node={node}
            isFocused={selectedNodeId === nodeId}
            panelRef={setPanelRef(nodeId)}
            sessions={sessionsByTentacleId.get(node.tentacleId) ?? []}
            onClose={() => handleCloseTentacle(nodeId)}
            onFocus={() => setSelectedNodeId(nodeId)}
            onCreateAgent={(tentacleId) => {
              handleCreateAgent(tentacleId);
            }}
            onNavigateToConversation={onNavigateToConversation}
          />
        ))}
        {isHydratingTerminals && openTerminals.size === 0 && (
          <div className="canvas-terminal-skeleton">
            <div className="canvas-terminal-skeleton__header" />
            <div className="canvas-terminal-skeleton__body">
              <div className="canvas-terminal-skeleton__line" style={{ width: "60%" }} />
              <div className="canvas-terminal-skeleton__line" style={{ width: "80%" }} />
              <div className="canvas-terminal-skeleton__line" style={{ width: "45%" }} />
            </div>
          </div>
        )}
        {Array.from(openTerminals.entries()).map(([nodeId, node]) => (
          <CanvasTerminalColumn
            key={nodeId}
            node={node}
            terminals={columns}
            layoutVersion={terminalLayoutVersion}
            isFocused={selectedNodeId === nodeId}
            panelRef={setPanelRef(nodeId)}
            onMinimize={() => handleMinimizeTerminal(nodeId)}
            onClose={() => handleCloseTerminal(node)}
            onFocus={() => setSelectedNodeId(nodeId)}
            onTerminalRenamed={onTerminalRenamed}
            onTerminalActivity={onTerminalActivity}
          />
        ))}
      </div>
    </>
  );
};
