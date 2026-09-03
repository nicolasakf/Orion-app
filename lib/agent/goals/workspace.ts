import { normalizeGoalArtifactPath } from "./manifest";
import type { GoalWorkspace } from "./types";

/** Captures the effective workspace identity used by a newly approved goal. */
export function createGoalWorkspace(
  workspaceDirectory: string | null | undefined,
  rootDirectory: string | null | undefined,
): GoalWorkspace {
  return {
    workspaceDirectory: workspaceDirectory ?? "",
    ...(rootDirectory ? { rootDirectory } : {}),
  };
}

/** Checks that current Jupyter and host roots still identify the pinned workspace. */
export function matchesPinnedGoalWorkspace(
  pinned: GoalWorkspace,
  current: GoalWorkspace,
): boolean {
  const pinnedRoot = pinned.rootDirectory?.replace(/[\\/]+$/, "");
  const currentRoot = current.rootDirectory?.replace(/[\\/]+$/, "");
  return (
    normalizeGoalArtifactPath(pinned.workspaceDirectory) ===
      normalizeGoalArtifactPath(current.workspaceDirectory) &&
    pinnedRoot === currentRoot
  );
}
