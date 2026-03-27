import type { ComponentProps } from "react";

import { GitHubPrimaryView } from "./GitHubPrimaryView";
import { UsageHeatmap } from "./UsageHeatmap";

type ActivityPrimaryViewProps = {
  usageHeatmapProps: ComponentProps<typeof UsageHeatmap>;
  githubPrimaryViewProps: ComponentProps<typeof GitHubPrimaryView>;
};

export const ActivityPrimaryView = ({
  usageHeatmapProps,
  githubPrimaryViewProps,
}: ActivityPrimaryViewProps) => {
  return (
    <section className="activity-view" aria-label="Activity primary view">
      <UsageHeatmap {...usageHeatmapProps} />
      <GitHubPrimaryView {...githubPrimaryViewProps} />
    </section>
  );
};
