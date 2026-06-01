export type ContextMenuState =
  | { kind: "canvas"; x: number; y: number }
  | { kind: "tentacle"; x: number; y: number; tentacleId: string }
  | { kind: "sentiph"; x: number; y: number }
  | {
      kind: "active-session";
      x: number;
      y: number;
      nodeId: string;
      tentacleId: string;
      sessionId: string;
      label: string;
      workspaceMode?: string;
    };
