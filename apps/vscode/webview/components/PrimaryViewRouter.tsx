import type { ComponentProps, RefObject } from "react";

import type { PrimaryNavIndex } from "../app/constants";
import type { TerminalView } from "../app/types";
import type { AgentRuntimeState } from "./AgentStateBadge";
import { CanvasPrimaryView } from "./CanvasPrimaryView";
import { ConversationsPrimaryView } from "./ConversationsPrimaryView";
import { DeckPrimaryView } from "./DeckPrimaryView";
import { TerminalBoard } from "./TerminalBoard";

type PrimaryViewRouterProps = {
  activePrimaryNav: PrimaryNavIndex;
  onDeckSidebarContent?: (content: import("react").ReactNode) => void;
  canvasPrimaryViewProps: ComponentProps<typeof CanvasPrimaryView>;
  conversationsPrimaryViewProps: ComponentProps<typeof ConversationsPrimaryView>;
  terminalBoardProps: {
    terminals: TerminalView;
    editingTerminalId: string | null;
    gitStatusByTentacleId: ComponentProps<typeof TerminalBoard>["gitStatusByTentacleId"];
    gitStatusLoadingByTentacleId: ComponentProps<
      typeof TerminalBoard
    >["gitStatusLoadingByTentacleId"];
    pullRequestByTentacleId: ComponentProps<typeof TerminalBoard>["pullRequestByTentacleId"];
    pullRequestLoadingByTentacleId: ComponentProps<
      typeof TerminalBoard
    >["pullRequestLoadingByTentacleId"];
    isDeletingTerminalId: string | null;
    isLoading: boolean;
    loadError: string | null;
    onBeginTerminalNameEdit: (terminalId: string, currentTerminalName: string) => void;
    onCancelTerminalRename: () => void;
    onMinimizeTerminal: (terminalId: string) => void;
    onOpenTerminalGitActions: (terminalId: string) => void;
    onRequestDeleteTerminal: ComponentProps<typeof TerminalBoard>["onRequestDeleteTerminal"];
    onSubmitTerminalRename: (terminalId: string, currentTerminalName: string) => void;
    onTerminalDividerKeyDown: ComponentProps<typeof TerminalBoard>["onTerminalDividerKeyDown"];
    onTerminalDividerPointerDown: ComponentProps<
      typeof TerminalBoard
    >["onTerminalDividerPointerDown"];
    onTerminalHeaderWheel: ComponentProps<typeof TerminalBoard>["onTerminalHeaderWheel"];
    onTerminalNameDraftChange: (name: string) => void;
    onSelectTerminal: (terminalId: string) => void;
    onTerminalStateChange: (terminalId: string, state: AgentRuntimeState) => void;
    selectedTerminalId: string | null;
    terminalNameDraft: string;
    terminalNameInputRef: RefObject<HTMLInputElement | null>;
    terminalWidths: Record<string, number>;
    terminalsRef: RefObject<HTMLElement | null>;
    visibleTerminals: TerminalView;
  };
};

export const PrimaryViewRouter = ({
  activePrimaryNav,
  onDeckSidebarContent,
  canvasPrimaryViewProps,
  conversationsPrimaryViewProps,
  terminalBoardProps,
}: PrimaryViewRouterProps) => {
  if (activePrimaryNav === 2) {
    return <DeckPrimaryView onSidebarContent={onDeckSidebarContent} />;
  }

  if (activePrimaryNav === 3) {
    return <ConversationsPrimaryView {...conversationsPrimaryViewProps} />;
  }

  // Default: Agents (nav index 1) — Canvas view matching the web app
  return <CanvasPrimaryView {...canvasPrimaryViewProps} />;
};
