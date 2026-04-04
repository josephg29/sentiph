import type { ComponentProps, RefObject } from "react";

import type { PrimaryNavIndex } from "../app/constants";
import type { TerminalView } from "../app/types";
import { ActivityPrimaryView } from "./ActivityPrimaryView";
import type { AgentRuntimeState } from "./AgentStateBadge";
import { CanvasPrimaryView } from "./CanvasPrimaryView";
import { CodeIntelPrimaryView } from "./CodeIntelPrimaryView";
import { ConversationsPrimaryView } from "./ConversationsPrimaryView";
import { DeckPrimaryView } from "./DeckPrimaryView";
import { MonitorPrimaryView } from "./MonitorPrimaryView";
import { SettingsPrimaryView } from "./SettingsPrimaryView";
import { TerminalBoard } from "./TerminalBoard";

type PrimaryViewRouterProps = {
  activePrimaryNav: PrimaryNavIndex;
  onDeckSidebarContent?: (content: import("react").ReactNode) => void;
  isMonitorVisible: boolean;
  activityPrimaryViewProps: ComponentProps<typeof ActivityPrimaryView>;
  monitorPrimaryViewProps: ComponentProps<typeof MonitorPrimaryView>;
  settingsPrimaryViewProps: ComponentProps<typeof SettingsPrimaryView>;
  conversationsPrimaryViewProps: ComponentProps<typeof ConversationsPrimaryView>;
  canvasPrimaryViewProps: ComponentProps<typeof CanvasPrimaryView>;
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
    onTerminalRenamed: (terminalId: string, tentacleName: string) => void;
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
  isMonitorVisible,
  activityPrimaryViewProps,
  monitorPrimaryViewProps,
  settingsPrimaryViewProps,
  conversationsPrimaryViewProps,
  canvasPrimaryViewProps,
  terminalBoardProps,
}: PrimaryViewRouterProps) => {
  if (activePrimaryNav === 2) {
    return <DeckPrimaryView onSidebarContent={onDeckSidebarContent} />;
  }

  if (activePrimaryNav === 3) {
    return <ActivityPrimaryView {...activityPrimaryViewProps} />;
  }

  if (activePrimaryNav === 4) {
    if (isMonitorVisible) {
      return <MonitorPrimaryView {...monitorPrimaryViewProps} />;
    }
    return (
      <section className="monitor-view" aria-label="Monitor primary view disabled">
        <section className="monitor-panel monitor-panel--configure">
          <h3>Monitor is disabled</h3>
          <p>Enable Monitor workspace view in Settings to restore this panel.</p>
        </section>
      </section>
    );
  }

  if (activePrimaryNav === 5) {
    return <ConversationsPrimaryView {...conversationsPrimaryViewProps} />;
  }

  if (activePrimaryNav === 6) {
    return <TerminalBoard {...terminalBoardProps} />;
  }

  if (activePrimaryNav === 7) {
    return <CodeIntelPrimaryView enabled={activePrimaryNav === 7} />;
  }

  if (activePrimaryNav === 8) {
    return <SettingsPrimaryView {...settingsPrimaryViewProps} />;
  }

  return <CanvasPrimaryView {...canvasPrimaryViewProps} />;
};
