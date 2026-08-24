import { describe, expect, it } from "vitest";
import type { ContentsManager } from "@jupyterlab/services";

import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";
import { mergeSettings } from "@/lib/settings/merge";
import {
  getWorkspaceSettingsPath,
  isJupyterRootWorkspace,
  loadWorkspaceSettingsDocument,
} from "@/lib/settings/workspace-file-storage";

/** Creates a minimal ContentsManager test double for workspace settings reads. */
function createContentsManager(
  files: Record<string, string>,
  onGet?: (path: string) => void
): ContentsManager {
  return {
    get: async (path: string) => {
      onGet?.(path);
      if (!(path in files)) {
        throw new Error("404: Not Found");
      }
      return {
        type: "file",
        content: files[path],
      };
    },
  } as unknown as ContentsManager;
}

describe("workspace file settings storage", () => {
  it("builds workspace settings paths relative to the Jupyter workspace", () => {
    expect(getWorkspaceSettingsPath("project")).toBe("project/.orion/settings.json");
    expect(getWorkspaceSettingsPath("")).toBe(".orion/settings.json");
  });

  it("detects the Jupyter server root workspace", () => {
    expect(isJupyterRootWorkspace("")).toBe(true);
    expect(isJupyterRootWorkspace("/")).toBe(true);
    expect(isJupyterRootWorkspace("project")).toBe(false);
  });

  it("does not load workspace overrides for the Jupyter server root workspace", async () => {
    const requestedPaths: string[] = [];
    const contentsManager = createContentsManager(
      {
        ".orion/settings.json": JSON.stringify({
          version: 1,
          overrides: {
            chat: {
              fontSize: 18,
            },
          },
        }),
      },
      (path) => requestedPaths.push(path)
    );

    await expect(loadWorkspaceSettingsDocument(contentsManager, "")).resolves.toEqual({
      version: 2,
      overrides: {},
    });
    expect(requestedPaths).toEqual([]);
  });

  it("loads overrides from <workspace>/.orion/settings.json", async () => {
    const contentsManager = createContentsManager({
      "project/.orion/settings.json": JSON.stringify({
        version: 1,
        overrides: {
          chat: {
            fontSize: 16,
          },
        },
      }),
    });

    const document = await loadWorkspaceSettingsDocument(
      contentsManager,
      "project"
    );

    expect(document.overrides.chat?.fontSize).toBe(16);
  });

  it("accepts full settings-shaped workspace files as overrides", async () => {
    const contentsManager = createContentsManager({
      "project/.orion/settings.json": JSON.stringify({
        version: 1,
        settings: {
          ...DEFAULT_SETTINGS,
          editor: {
            ...DEFAULT_SETTINGS.editor,
            fontSize: 18,
          },
        },
      }),
    });

    const document = await loadWorkspaceSettingsDocument(
      contentsManager,
      "project"
    );

    expect(document.overrides.editor?.fontSize).toBe(18);
  });

  it("strips provider credentials from workspace overrides", async () => {
    const contentsManager = createContentsManager({
      "project/.orion/settings.json": JSON.stringify({
        version: 1,
        overrides: {
          providers: {
            credentials: {
              openai: {
                type: "api_key",
                apiKey: "sk-workspace",
              },
            },
          },
        },
      }),
    });

    const document = await loadWorkspaceSettingsDocument(
      contentsManager,
      "project"
    );

    expect(document.overrides.providers?.credentials).toEqual({});
  });

  it("applies workspace overrides after user settings", () => {
    const merged = mergeSettings(
      DEFAULT_SETTINGS,
      {
        ...DEFAULT_SETTINGS,
        chat: {
          ...DEFAULT_SETTINGS.chat,
          fontSize: 13,
        },
      },
      {},
      {
        chat: {
          fontSize: 17,
        },
      }
    );

    expect(merged.chat.fontSize).toBe(17);
  });

  it("returns empty overrides when the workspace settings file is missing", async () => {
    const contentsManager = createContentsManager({});

    await expect(
      loadWorkspaceSettingsDocument(contentsManager, "project")
    ).resolves.toEqual({ version: 2, overrides: {} });
  });
});
