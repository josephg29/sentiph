import { useCallback, useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { buildUiStateUrl } from "../../runtime/runtimeEndpoints";
import type { PrimaryNavIndex } from "../constants";
import { DEFAULT_SIDEBAR_WIDTH, PRIMARY_NAV_ITEMS, UI_STATE_SAVE_DEBOUNCE_MS } from "../constants";
import { clampSidebarWidth, normalizeFrontendUiStateSnapshot } from "../normalizers";
import {
  DEFAULT_TERMINAL_COMPLETION_SOUND,
  type TerminalCompletionSoundId,
} from "../notificationSounds";
import type { FrontendUiStateSnapshot, TerminalView } from "../types";

type UsePersistedUiStateOptions = {
  columns: TerminalView;
};

type UsePersistedUiStateResult = {
  activePrimaryNav: PrimaryNavIndex;
  setActivePrimaryNav: Dispatch<SetStateAction<PrimaryNavIndex>>;
  isUiStateHydrated: boolean;
  setIsUiStateHydrated: Dispatch<SetStateAction<boolean>>;
  isAgentsSidebarVisible: boolean;
  setIsAgentsSidebarVisible: Dispatch<SetStateAction<boolean>>;
  sidebarWidth: number;
  setSidebarWidth: Dispatch<SetStateAction<number>>;
  isActiveAgentsSectionExpanded: boolean;
  setIsActiveAgentsSectionExpanded: Dispatch<SetStateAction<boolean>>;
  isRuntimeStatusStripVisible: boolean;
  setIsRuntimeStatusStripVisible: Dispatch<SetStateAction<boolean>>;
  isMonitorVisible: boolean;
  setIsMonitorVisible: Dispatch<SetStateAction<boolean>>;
  isBottomTelemetryVisible: boolean;
  setIsBottomTelemetryVisible: Dispatch<SetStateAction<boolean>>;
  isCodexUsageVisible: boolean;
  setIsCodexUsageVisible: Dispatch<SetStateAction<boolean>>;
  isClaudeUsageVisible: boolean;
  setIsClaudeUsageVisible: Dispatch<SetStateAction<boolean>>;
  isClaudeUsageSectionExpanded: boolean;
  setIsClaudeUsageSectionExpanded: Dispatch<SetStateAction<boolean>>;
  isCodexUsageSectionExpanded: boolean;
  setIsCodexUsageSectionExpanded: Dispatch<SetStateAction<boolean>>;
  terminalCompletionSound: TerminalCompletionSoundId;
  setTerminalCompletionSound: Dispatch<SetStateAction<TerminalCompletionSoundId>>;
  minimizedTerminalIds: string[];
  setMinimizedTerminalIds: Dispatch<SetStateAction<string[]>>;
  terminalWidths: Record<string, number>;
  setTerminalWidths: Dispatch<SetStateAction<Record<string, number>>>;
  canvasOpenTerminalIds: string[];
  setCanvasOpenTerminalIds: Dispatch<SetStateAction<string[]>>;
  canvasOpenTentacleIds: string[];
  setCanvasOpenTentacleIds: Dispatch<SetStateAction<string[]>>;
  canvasTerminalsPanelWidth: number | null;
  setCanvasTerminalsPanelWidth: Dispatch<SetStateAction<number | null>>;
  readUiState: (signal?: AbortSignal) => Promise<FrontendUiStateSnapshot | null>;
  applyHydratedUiState: (
    snapshot: FrontendUiStateSnapshot | null,
    nextColumns: TerminalView,
  ) => void;
};

export const usePersistedUiState = ({
  columns,
}: UsePersistedUiStateOptions): UsePersistedUiStateResult => {
  const [activePrimaryNav, setActivePrimaryNav] = useState<PrimaryNavIndex>(1);
  const [isAgentsSidebarVisible, setIsAgentsSidebarVisible] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isActiveAgentsSectionExpanded, setIsActiveAgentsSectionExpanded] = useState(true);
  const [isRuntimeStatusStripVisible, setIsRuntimeStatusStripVisible] = useState(true);
  const [isMonitorVisible, setIsMonitorVisible] = useState(true);
  const [isBottomTelemetryVisible, setIsBottomTelemetryVisible] = useState(true);
  const [isCodexUsageVisible, setIsCodexUsageVisible] = useState(true);
  const [isClaudeUsageVisible, setIsClaudeUsageVisible] = useState(true);
  const [isClaudeUsageSectionExpanded, setIsClaudeUsageSectionExpanded] = useState(true);
  const [isCodexUsageSectionExpanded, setIsCodexUsageSectionExpanded] = useState(true);
  const [terminalCompletionSound, setTerminalCompletionSound] = useState<TerminalCompletionSoundId>(
    DEFAULT_TERMINAL_COMPLETION_SOUND,
  );
  const [isUiStateHydrated, setIsUiStateHydrated] = useState(false);
  const [minimizedTerminalIds, setMinimizedTerminalIds] = useState<string[]>([]);
  const [terminalWidths, setTerminalWidths] = useState<Record<string, number>>({});
  const [canvasOpenTerminalIds, setCanvasOpenTerminalIds] = useState<string[]>([]);
  const [canvasOpenTentacleIds, setCanvasOpenTentacleIds] = useState<string[]>([]);
  const [canvasTerminalsPanelWidth, setCanvasTerminalsPanelWidth] = useState<number | null>(null);

  const readUiState = useCallback(async (signal?: AbortSignal) => {
    try {
      const requestOptions: {
        method: "GET";
        headers: { Accept: string };
        signal?: AbortSignal;
      } = {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      };
      if (signal) {
        requestOptions.signal = signal;
      }

      const response = await fetch(buildUiStateUrl(), requestOptions);
      if (!response.ok) {
        return null;
      }

      return normalizeFrontendUiStateSnapshot(await response.json());
    } catch {
      return null;
    }
  }, []);

  const applyHydratedUiState = useCallback(
    (snapshot: FrontendUiStateSnapshot | null, nextColumns: TerminalView) => {
      if (!snapshot) {
        return;
      }

      if (
        snapshot.activePrimaryNav !== undefined &&
        snapshot.activePrimaryNav >= 1 &&
        snapshot.activePrimaryNav <= PRIMARY_NAV_ITEMS.length
      ) {
        setActivePrimaryNav(snapshot.activePrimaryNav as PrimaryNavIndex);
      }

      if (snapshot.isAgentsSidebarVisible !== undefined) {
        setIsAgentsSidebarVisible(snapshot.isAgentsSidebarVisible);
      }

      if (snapshot.sidebarWidth !== undefined) {
        setSidebarWidth(clampSidebarWidth(snapshot.sidebarWidth));
      }

      if (snapshot.isActiveAgentsSectionExpanded !== undefined) {
        setIsActiveAgentsSectionExpanded(snapshot.isActiveAgentsSectionExpanded);
      }

      if (snapshot.isRuntimeStatusStripVisible !== undefined) {
        setIsRuntimeStatusStripVisible(snapshot.isRuntimeStatusStripVisible);
      }

      if (snapshot.isMonitorVisible !== undefined) {
        setIsMonitorVisible(snapshot.isMonitorVisible);
      }

      if (snapshot.isBottomTelemetryVisible !== undefined) {
        setIsBottomTelemetryVisible(snapshot.isBottomTelemetryVisible);
      }

      if (snapshot.isCodexUsageVisible !== undefined) {
        setIsCodexUsageVisible(snapshot.isCodexUsageVisible);
      }

      if (snapshot.isClaudeUsageVisible !== undefined) {
        setIsClaudeUsageVisible(snapshot.isClaudeUsageVisible);
      }

      if (snapshot.isCodexUsageSectionExpanded !== undefined) {
        setIsCodexUsageSectionExpanded(snapshot.isCodexUsageSectionExpanded);
      }

      if (snapshot.isClaudeUsageSectionExpanded !== undefined) {
        setIsClaudeUsageSectionExpanded(snapshot.isClaudeUsageSectionExpanded);
      }

      if (snapshot.terminalCompletionSound !== undefined) {
        setTerminalCompletionSound(snapshot.terminalCompletionSound);
      }

      if (snapshot.minimizedTerminalIds) {
        const activeTerminalIds = new Set(nextColumns.map((entry) => entry.terminalId));
        setMinimizedTerminalIds(
          snapshot.minimizedTerminalIds.filter((id) => activeTerminalIds.has(id)),
        );
      }

      if (snapshot.terminalWidths) {
        const activeTerminalIds = new Set(nextColumns.map((entry) => entry.terminalId));
        setTerminalWidths(
          Object.entries(snapshot.terminalWidths).reduce<Record<string, number>>(
            (acc, [id, width]) => {
              if (activeTerminalIds.has(id)) {
                acc[id] = width;
              }
              return acc;
            },
            {},
          ),
        );
      }

      if (snapshot.canvasOpenTerminalIds) {
        setCanvasOpenTerminalIds(snapshot.canvasOpenTerminalIds);
      }

      if (snapshot.canvasOpenTentacleIds) {
        setCanvasOpenTentacleIds(snapshot.canvasOpenTentacleIds);
      }

      if (snapshot.canvasTerminalsPanelWidth !== undefined) {
        setCanvasTerminalsPanelWidth(snapshot.canvasTerminalsPanelWidth);
      }
    },
    [],
  );

  useEffect(() => {
    if (!isUiStateHydrated) {
      return;
    }

    const activeTerminalIds = new Set(columns.map((entry) => entry.terminalId));
    const payload: FrontendUiStateSnapshot = {
      activePrimaryNav,
      isAgentsSidebarVisible,
      sidebarWidth: clampSidebarWidth(sidebarWidth),
      isActiveAgentsSectionExpanded,
      isRuntimeStatusStripVisible,
      isMonitorVisible,
      isBottomTelemetryVisible,
      isCodexUsageVisible,
      isClaudeUsageVisible,
      isClaudeUsageSectionExpanded,
      isCodexUsageSectionExpanded,
      terminalCompletionSound,
      minimizedTerminalIds: minimizedTerminalIds.filter((id) => activeTerminalIds.has(id)),
      terminalWidths: Object.entries(terminalWidths).reduce<Record<string, number>>(
        (acc, [id, width]) => {
          if (activeTerminalIds.has(id)) {
            acc[id] = width;
          }
          return acc;
        },
        {},
      ),
      canvasOpenTerminalIds,
      canvasOpenTentacleIds,
      ...(canvasTerminalsPanelWidth != null ? { canvasTerminalsPanelWidth } : {}),
    };

    const timerId = window.setTimeout(() => {
      void fetch(buildUiStateUrl(), {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }).catch((error: unknown) => {
        console.warn("[ui-state] Failed to persist UI state:", error);
      });
    }, UI_STATE_SAVE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [
    activePrimaryNav,
    canvasOpenTerminalIds,
    canvasOpenTentacleIds,
    canvasTerminalsPanelWidth,
    columns,
    isActiveAgentsSectionExpanded,
    isAgentsSidebarVisible,
    isBottomTelemetryVisible,
    isRuntimeStatusStripVisible,
    isMonitorVisible,
    isCodexUsageVisible,
    isClaudeUsageVisible,
    isClaudeUsageSectionExpanded,
    isCodexUsageSectionExpanded,
    isUiStateHydrated,
    minimizedTerminalIds,
    sidebarWidth,
    terminalCompletionSound,
    terminalWidths,
  ]);

  return {
    activePrimaryNav,
    setActivePrimaryNav,
    isUiStateHydrated,
    setIsUiStateHydrated,
    isAgentsSidebarVisible,
    setIsAgentsSidebarVisible,
    sidebarWidth,
    setSidebarWidth,
    isActiveAgentsSectionExpanded,
    setIsActiveAgentsSectionExpanded,
    isRuntimeStatusStripVisible,
    setIsRuntimeStatusStripVisible,
    isMonitorVisible,
    setIsMonitorVisible,
    isBottomTelemetryVisible,
    setIsBottomTelemetryVisible,
    isCodexUsageVisible,
    setIsCodexUsageVisible,
    isClaudeUsageVisible,
    setIsClaudeUsageVisible,
    isClaudeUsageSectionExpanded,
    setIsClaudeUsageSectionExpanded,
    isCodexUsageSectionExpanded,
    setIsCodexUsageSectionExpanded,
    terminalCompletionSound,
    setTerminalCompletionSound,
    minimizedTerminalIds,
    setMinimizedTerminalIds,
    terminalWidths,
    setTerminalWidths,
    canvasOpenTerminalIds,
    setCanvasOpenTerminalIds,
    canvasOpenTentacleIds,
    setCanvasOpenTentacleIds,
    canvasTerminalsPanelWidth,
    setCanvasTerminalsPanelWidth,
    readUiState,
    applyHydratedUiState,
  };
};
