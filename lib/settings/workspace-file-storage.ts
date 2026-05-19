import type { ContentsManager } from "@jupyterlab/services";

import { createDefaultWorkspaceSettingsDocument } from "@/lib/settings/defaults";
import { parseWorkspaceSettingsDocumentFromJson } from "@/lib/settings/migrations";
import type { WorkspaceSettingsDocument } from "@/lib/settings/schema";

const WORKSPACE_SETTINGS_RELATIVE_PATH = ".orion/settings.json";

/** Joins Jupyter path segments without introducing leading slashes. */
function joinJupyterPath(...segments: string[]): string {
  return segments
    .flatMap((segment) => segment.split("/"))
    .filter(Boolean)
    .join("/");
}

/** Returns the Jupyter-relative path for a workspace settings file. */
export function getWorkspaceSettingsPath(workspaceDirectory: string): string {
  return joinJupyterPath(workspaceDirectory, WORKSPACE_SETTINGS_RELATIVE_PATH);
}

/** Removes browser-only secrets from workspace settings overrides. */
function stripWorkspaceSettingsSecrets(
  document: WorkspaceSettingsDocument
): WorkspaceSettingsDocument {
  return {
    ...document,
    overrides: {
      ...document.overrides,
      providers: document.overrides.providers
        ? {
            ...document.overrides.providers,
            credentials: {},
          }
        : undefined,
    },
  };
}

/** Returns whether a ContentsManager failure means the workspace settings file is absent. */
function isMissingWorkspaceSettingsError(error: unknown): boolean {
  const maybeError = error as { response?: { status?: number }; message?: string };
  return (
    maybeError.response?.status === 404 ||
    maybeError.message?.includes("404") === true ||
    maybeError.message?.toLowerCase().includes("not found") === true
  );
}

/** Loads `<workspace>/.orion/settings.json` as workspace-level settings overrides. */
export async function loadWorkspaceSettingsDocument(
  contentsManager: ContentsManager,
  workspaceDirectory: string
): Promise<WorkspaceSettingsDocument> {
  const settingsPath = getWorkspaceSettingsPath(workspaceDirectory);

  try {
    const model = await contentsManager.get(settingsPath, { content: true });
    if (model.type !== "file" || typeof model.content !== "string") {
      return createDefaultWorkspaceSettingsDocument();
    }

    if (!model.content.trim()) {
      return createDefaultWorkspaceSettingsDocument();
    }

    return stripWorkspaceSettingsSecrets(
      parseWorkspaceSettingsDocumentFromJson(model.content)
    );
  } catch (error) {
    if (isMissingWorkspaceSettingsError(error)) {
      return createDefaultWorkspaceSettingsDocument();
    }
    throw error;
  }
}
