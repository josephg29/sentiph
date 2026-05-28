import type { ComponentProps } from "react";

import type { PrimaryNavIndex } from "../app/constants";
import type { UseMonitorRuntimeResult } from "../app/hooks/useMonitorRuntime";
import { ActivityPrimaryView } from "./ActivityPrimaryView";
import { CanvasPrimaryView } from "./CanvasPrimaryView";
import { CodeIntelPrimaryView } from "./CodeIntelPrimaryView";
import { DeckPrimaryView } from "./DeckPrimaryView";
import { MonitorPrimaryView } from "./MonitorPrimaryView";
import { ObservabilityPrimaryView } from "./ObservabilityPrimaryView";
import { SettingsPrimaryView } from "./SettingsPrimaryView";

type PrimaryViewRouterProps = {
  activePrimaryNav: PrimaryNavIndex;
  deckPrimaryViewProps: ComponentProps<typeof DeckPrimaryView>;
  isMonitorVisible: boolean;
  activityPrimaryViewProps: ComponentProps<typeof ActivityPrimaryView>;
  settingsPrimaryViewProps: ComponentProps<typeof SettingsPrimaryView>;
  canvasPrimaryViewProps: ComponentProps<typeof CanvasPrimaryView>;
  monitorRuntime: Pick<
    UseMonitorRuntimeResult,
    | "monitorConfig"
    | "monitorFeed"
    | "monitorError"
    | "isRefreshingMonitorFeed"
    | "isSavingMonitorConfig"
    | "refreshMonitorFeed"
    | "patchMonitorConfig"
  >;
};

const isCanvasNav = (nav: PrimaryNavIndex) =>
  nav !== 2 && nav !== 3 && nav !== 4 && nav !== 5 && nav !== 8 && nav !== 9;

export const PrimaryViewRouter = ({
  activePrimaryNav,
  deckPrimaryViewProps,
  isMonitorVisible,
  activityPrimaryViewProps,
  settingsPrimaryViewProps,
  canvasPrimaryViewProps,
  monitorRuntime,
}: PrimaryViewRouterProps) => {
  const canvasActive = isCanvasNav(activePrimaryNav);

  return (
    <div className="primary-view-router">
      {/*
       * Canvas is always mounted so Terminal WebSocket connections and xterm
       * instances survive nav tab switches. When inactive it is absolutely
       * positioned behind the active view and hidden from view/input.
       */}
      <div
        className={`primary-view-canvas-slot${canvasActive ? "" : " primary-view-canvas-slot--hidden"}`}
        aria-hidden={!canvasActive}
      >
        <CanvasPrimaryView {...canvasPrimaryViewProps} />
      </div>

      {activePrimaryNav === 2 && <DeckPrimaryView {...deckPrimaryViewProps} />}

      {activePrimaryNav === 3 && <ActivityPrimaryView {...activityPrimaryViewProps} />}

      {activePrimaryNav === 4 && <CodeIntelPrimaryView enabled />}

      {activePrimaryNav === 5 &&
        (isMonitorVisible ? (
          <MonitorPrimaryView monitorRuntime={monitorRuntime} />
        ) : (
          <section className="monitor-view" aria-label="Monitor primary view disabled">
            <section className="monitor-panel monitor-panel--configure">
              <h3>Monitor is disabled</h3>
              <p>Enable Monitor workspace view in Settings to restore this panel.</p>
            </section>
          </section>
        ))}

      {activePrimaryNav === 8 && <SettingsPrimaryView {...settingsPrimaryViewProps} />}

      {activePrimaryNav === 9 && <ObservabilityPrimaryView enabled />}
    </div>
  );
};
