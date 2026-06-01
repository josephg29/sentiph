import type { ComponentProps } from "react";

import type { PrimaryNavIndex } from "../app/constants";
import { ActivityPrimaryView } from "./ActivityPrimaryView";
import { CanvasPrimaryView } from "./CanvasPrimaryView";
import { ObservabilityPrimaryView } from "./ObservabilityPrimaryView";
import { SettingsPrimaryView } from "./SettingsPrimaryView";

type PrimaryViewRouterProps = {
  activePrimaryNav: PrimaryNavIndex;
  activityPrimaryViewProps: ComponentProps<typeof ActivityPrimaryView>;
  settingsPrimaryViewProps: ComponentProps<typeof SettingsPrimaryView>;
  canvasPrimaryViewProps: ComponentProps<typeof CanvasPrimaryView>;
};

const isCanvasNav = (nav: PrimaryNavIndex) => nav !== 3 && nav !== 8 && nav !== 9;

export const PrimaryViewRouter = ({
  activePrimaryNav,
  activityPrimaryViewProps,
  settingsPrimaryViewProps,
  canvasPrimaryViewProps,
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

      {activePrimaryNav === 3 && <ActivityPrimaryView {...activityPrimaryViewProps} />}

      {activePrimaryNav === 8 && <SettingsPrimaryView {...settingsPrimaryViewProps} />}

      {activePrimaryNav === 9 && <ObservabilityPrimaryView enabled />}
    </div>
  );
};
