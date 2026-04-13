import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import type { WorkspaceSetupSnapshot, WorkspaceSetupStep } from "@octogent/core";

import { readDeckTentacles } from "./deck/readDeckTentacles";
import {
  ensureOctogentGitignoreEntry,
  ensureProjectScaffold,
  hasOctogentGitignoreEntry,
  loadProjectConfig,
  migrateStateToGlobal,
  registerProject,
} from "./projectPersistence";
import { readSetupState } from "./setupState";
import { collectStartupPrerequisiteReport } from "./startupPrerequisites";

export const initializeWorkspaceFiles = (workspaceCwd: string, projectStateDir: string) => {
  const projectName = loadProjectConfig(workspaceCwd)?.displayName;
  const projectConfig = ensureProjectScaffold(workspaceCwd, projectName);
  registerProject(workspaceCwd, projectConfig.displayName);
  mkdirSync(join(projectStateDir, "state"), { recursive: true });
  migrateStateToGlobal(workspaceCwd, projectStateDir);

  return { projectConfig, projectStateDir };
};

export const ensureWorkspaceGitignore = (workspaceCwd: string) =>
  ensureOctogentGitignoreEntry(workspaceCwd);

export const readWorkspaceSetupSnapshot = (
  workspaceCwd: string,
  projectStateDir: string,
): WorkspaceSetupSnapshot => {
  const prerequisites = collectStartupPrerequisiteReport();
  const projectConfig = loadProjectConfig(workspaceCwd);
  const octogentDir = join(workspaceCwd, ".octogent");
  const hasProjectScaffold =
    projectConfig !== null &&
    existsSync(join(octogentDir, "tentacles")) &&
    existsSync(join(octogentDir, "worktrees")) &&
    existsSync(join(projectStateDir, "state"));
  const hasGitignore = hasOctogentGitignoreEntry(workspaceCwd);
  const tentacles = readDeckTentacles(workspaceCwd, projectStateDir);
  const tentacleCount = tentacles.length;
  const hasAnyTentacles = tentacleCount > 0;
  const setupState = readSetupState(projectStateDir);
  const isFirstRun = !hasAnyTentacles && !setupState.tentaclesInitializedAt;

  const steps: WorkspaceSetupStep[] = [
    {
      id: "initialize-workspace",
      title: "Initialize workspace",
      description: "Create Octogent project files and runtime directories.",
      complete: hasProjectScaffold,
      required: true,
      actionLabel: "Initialize workspace",
      statusText: hasProjectScaffold
        ? "Workspace files are ready."
        : "Create .octogent project files before continuing.",
      guidance: hasProjectScaffold
        ? null
        : "Workspace initialization failed. Run the Octogent initializer in this repository.",
      command: hasProjectScaffold ? null : "octogent init",
    },
    {
      id: "ensure-gitignore",
      title: "Ignore .octogent",
      description: "Add .octogent to .gitignore, or create .gitignore when it is missing.",
      complete: hasGitignore,
      required: true,
      actionLabel: "Update .gitignore",
      statusText: hasGitignore
        ? ".gitignore covers .octogent."
        : "Add .octogent to .gitignore before creating tentacles.",
      guidance: hasGitignore
        ? null
        : "Git ignore entry is missing. Create or update .gitignore with the Octogent workspace path.",
      command: hasGitignore ? null : "printf '.octogent\\n' >> .gitignore",
    },
    {
      id: "check-claude",
      title: "Check Claude Code",
      description: "Verify the default Claude Code workflow is available on this machine.",
      complete: prerequisites.availability.claude,
      required: false,
      actionLabel: "Check Claude Code",
      statusText: prerequisites.availability.claude
        ? "Claude Code is available."
        : "Claude Code is unavailable.",
      guidance: prerequisites.availability.claude
        ? null
        : "Install Claude Code and log in before using the default Claude workflow.",
      command: prerequisites.availability.claude ? null : "claude login",
    },
    {
      id: "check-git",
      title: "Check Git",
      description: "Verify Git is available for worktree-backed tentacles.",
      complete: prerequisites.availability.git,
      required: false,
      actionLabel: "Check Git",
      statusText: prerequisites.availability.git ? "Git is available." : "Git is unavailable.",
      guidance: prerequisites.availability.git
        ? null
        : "Install Git to enable worktree terminals and branch flows.",
      command: prerequisites.availability.git ? null : "git --version",
    },
    {
      id: "check-curl",
      title: "Check curl",
      description: "Verify curl is available for Claude hook callbacks.",
      complete: prerequisites.availability.curl,
      required: false,
      actionLabel: "Check curl",
      statusText: prerequisites.availability.curl ? "curl is available." : "curl is unavailable.",
      guidance: prerequisites.availability.curl
        ? null
        : "Install curl to restore Claude hook callbacks.",
      command: prerequisites.availability.curl ? null : "curl --version",
    },
    {
      id: "create-tentacles",
      title: "Create tentacles",
      description: "Create at least one tentacle before launching a coding agent.",
      complete: hasAnyTentacles,
      required: true,
      actionLabel: null,
      statusText: hasAnyTentacles
        ? `${tentacleCount} tentacle${tentacleCount === 1 ? "" : "s"} ready.`
        : "Create your first tentacle to continue.",
      guidance: hasAnyTentacles
        ? null
        : "Use the planner or manual creation to add at least one tentacle.",
      command: null,
    },
  ];

  return {
    isFirstRun,
    shouldShowSetupCard: isFirstRun || (!hasAnyTentacles && (!hasProjectScaffold || !hasGitignore)),
    hasAnyTentacles,
    tentacleCount,
    steps,
  };
};
