import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getWorkspacePathActionAvailability,
  revealWorkspacePath,
} from "./workspace-actions.client";

interface TestDesktopBridge {
  getManagedJupyterBaseUrl: ReturnType<typeof vi.fn>;
  openWorkspacePath: ReturnType<typeof vi.fn>;
  revealWorkspacePath: ReturnType<typeof vi.fn>;
}

function setDesktopBridge(bridge: TestDesktopBridge | undefined): void {
  const testWindow = window as unknown as { orionDesktopShell?: TestDesktopBridge };
  if (bridge) {
    testWindow.orionDesktopShell = bridge;
  } else {
    delete testWindow.orionDesktopShell;
  }
}

/** Creates a bridge double that represents Electron's local managed Jupyter runtime. */
function createDesktopBridge(managedJupyterBaseUrl: string | null): TestDesktopBridge {
  return {
    getManagedJupyterBaseUrl: vi.fn().mockResolvedValue(managedJupyterBaseUrl),
    openWorkspacePath: vi.fn().mockResolvedValue(undefined),
    revealWorkspacePath: vi.fn().mockResolvedValue(undefined),
  };
}

describe("desktop workspace action client helpers", () => {
  afterEach(() => {
    setDesktopBridge(undefined);
  });

  it("marks browser renderers unavailable", async () => {
    const availability = await getWorkspacePathActionAvailability({
      path: "report.pdf",
      jupyterBaseUrl: "http://127.0.0.1:8888/",
    });

    expect(availability).toEqual({
      available: false,
      message: "This workspace action is available only in the Orion desktop app.",
    });
  });

  it("marks Electron windows connected to a remote Jupyter runtime unavailable", async () => {
    const desktopBridge = createDesktopBridge("http://127.0.0.1:8888/");
    setDesktopBridge(desktopBridge);

    const availability = await getWorkspacePathActionAvailability({
      path: "report.pdf",
      kernelService: {
        getServerSettings: () => ({ baseUrl: "https://remote.example.test/jupyter/" }),
      },
    });

    expect(availability).toEqual({
      available: false,
      message:
        "This workspace action is available only for the local Jupyter runtime launched by Orion.",
    });
  });

  it("does not invoke a native action for a remote Jupyter runtime", async () => {
    const desktopBridge = createDesktopBridge("http://127.0.0.1:8888/");
    setDesktopBridge(desktopBridge);

    await expect(
      revealWorkspacePath({
        path: "report.pdf",
        kernelService: {
          getServerSettings: () => ({ baseUrl: "https://remote.example.test/jupyter/" }),
        },
      })
    ).resolves.toEqual({
      ok: false,
      message:
        "This workspace action is available only for the local Jupyter runtime launched by Orion.",
    });
    expect(desktopBridge.revealWorkspacePath).not.toHaveBeenCalled();
  });

  it("invokes the typed reveal bridge for the managed local Jupyter runtime", async () => {
    const desktopBridge = createDesktopBridge("http://127.0.0.1:8888/");
    setDesktopBridge(desktopBridge);

    await expect(
      revealWorkspacePath({
        path: "nested/report.pdf",
        jupyterBaseUrl: "http://localhost:8888/?token=renderer-token",
      })
    ).resolves.toEqual({ ok: true });

    expect(desktopBridge.revealWorkspacePath).toHaveBeenCalledWith({
      path: "nested/report.pdf",
      jupyterBaseUrl: "http://localhost:8888/?token=renderer-token",
    });
  });
});
