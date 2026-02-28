import type { CodexUsageSnapshot } from "../codexUsage";
import type { GitHubRepoSummarySnapshot } from "../githubRepoSummary";
import type { MonitorService } from "../monitor";
import type { GitClient, TmuxClient } from "../terminalRuntime";

export type CreateApiServerOptions = {
  workspaceCwd?: string;
  tmuxClient?: TmuxClient;
  gitClient?: GitClient;
  readCodexUsageSnapshot?: () => Promise<CodexUsageSnapshot>;
  readGithubRepoSummary?: () => Promise<GitHubRepoSummarySnapshot>;
  monitorService?: MonitorService;
  allowRemoteAccess?: boolean;
};
