import type { ComponentProps, RefObject } from "react";

import type { PrimaryNavIndex } from "../app/constants";
import type { TentacleView } from "../app/types";
import type { AgentRuntimeState } from "./AgentStateBadge";
import { ConversationsPrimaryView } from "./ConversationsPrimaryView";
import { GitHubPrimaryView } from "./GitHubPrimaryView";
import { MonitorPrimaryView } from "./MonitorPrimaryView";
import { SandboxPrimaryView } from "./SandboxPrimaryView";
import { SettingsPrimaryView } from "./SettingsPrimaryView";
import { TentacleBoard } from "./TentacleBoard";

type PrimaryViewRouterProps = {
  activePrimaryNav: PrimaryNavIndex;
  isMonitorVisible: boolean;
  githubPrimaryViewProps: ComponentProps<typeof GitHubPrimaryView>;
  monitorPrimaryViewProps: ComponentProps<typeof MonitorPrimaryView>;
  settingsPrimaryViewProps: ComponentProps<typeof SettingsPrimaryView>;
  conversationsPrimaryViewProps: ComponentProps<typeof ConversationsPrimaryView>;
  tentacleBoardProps: {
    columns: TentacleView;
    editingTentacleId: string | null;
    gitStatusByTentacleId: ComponentProps<typeof TentacleBoard>["gitStatusByTentacleId"];
    gitStatusLoadingByTentacleId: ComponentProps<
      typeof TentacleBoard
    >["gitStatusLoadingByTentacleId"];
    pullRequestByTentacleId: ComponentProps<typeof TentacleBoard>["pullRequestByTentacleId"];
    pullRequestLoadingByTentacleId: ComponentProps<
      typeof TentacleBoard
    >["pullRequestLoadingByTentacleId"];
    isDeletingTentacleId: string | null;
    isLoading: boolean;
    loadError: string | null;
    onBeginTentacleNameEdit: (tentacleId: string, currentTentacleName: string) => void;
    onCancelTentacleRename: () => void;
    onMinimizeTentacle: (tentacleId: string) => void;
    onOpenTentacleGitActions: (tentacleId: string) => void;
    onRequestDeleteTentacle: ComponentProps<typeof TentacleBoard>["onRequestDeleteTentacle"];
    onSubmitTentacleRename: (tentacleId: string, currentTentacleName: string) => void;
    onTentacleDividerKeyDown: ComponentProps<typeof TentacleBoard>["onTentacleDividerKeyDown"];
    onTentacleDividerPointerDown: ComponentProps<
      typeof TentacleBoard
    >["onTentacleDividerPointerDown"];
    onTentacleHeaderWheel: ComponentProps<typeof TentacleBoard>["onTentacleHeaderWheel"];
    onTentacleNameDraftChange: (name: string) => void;
    onSelectTentacle: (tentacleId: string) => void;
    onSelectTerminal: (terminalId: string) => void;
    onTentacleStateChange: (tentacleId: string, state: AgentRuntimeState) => void;
    onCreateTentacleAgent: (
      tentacleId: string,
      anchorAgentId: string,
      placement: "up" | "down",
    ) => void;
    onDeleteTentacleAgent: (tentacleId: string, agentId: string) => void;
    selectedTentacleId: string | null;
    selectedTerminalId: string | null;
    tentacleNameDraft: string;
    tentacleNameInputRef: RefObject<HTMLInputElement | null>;
    tentacleWidths: Record<string, number>;
    tentaclesRef: RefObject<HTMLElement | null>;
    visibleColumns: TentacleView;
  };
};

export const PrimaryViewRouter = ({
  activePrimaryNav,
  isMonitorVisible,
  githubPrimaryViewProps,
  monitorPrimaryViewProps,
  settingsPrimaryViewProps,
  conversationsPrimaryViewProps,
  tentacleBoardProps,
}: PrimaryViewRouterProps) => {
  if (activePrimaryNav === 2) {
    return <GitHubPrimaryView {...githubPrimaryViewProps} />;
  }

  if (activePrimaryNav === 3) {
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

  if (activePrimaryNav === 4) {
    return <ConversationsPrimaryView {...conversationsPrimaryViewProps} />;
  }

  if (activePrimaryNav === 5) {
    return <SettingsPrimaryView {...settingsPrimaryViewProps} />;
  }

  if (activePrimaryNav === 6) {
    return <SandboxPrimaryView />;
  }

  return <TentacleBoard {...tentacleBoardProps} />;
};
