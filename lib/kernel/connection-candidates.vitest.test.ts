import { describe, expect, it } from "vitest";

import { getAutoConnectionCandidates } from "@/lib/kernel/connection-candidates";
import type { LauncherJupyterConnection } from "@/lib/kernel/launcher-connection";

const launcherConnection: LauncherJupyterConnection = {
  baseUrl: "http://127.0.0.1:9000/",
  token: "launcher-token",
  source: "managed",
  pythonPath: "/Users/taylor/.orion/runtime/venv/bin/python",
  jupyterVersion: "2.14.0",
  capabilities: {
    kernelspecs: true,
    sessions: true,
    kernels: true,
    contents: true,
    terminals: true,
    sysInfo: false,
  },
  createdAt: "2026-05-22T12:00:00.000Z",
};

describe("auto connection candidates", () => {
  it("tries CLI handoff before saved connections", () => {
    expect(
      getAutoConnectionCandidates(launcherConnection, [
        { baseUrl: "http://127.0.0.1:8888/", token: "saved-token" },
      ])
    ).toEqual([
      {
        baseUrl: "http://127.0.0.1:9000/",
        token: "launcher-token",
        displayName: "Orion-managed Jupyter",
        source: "launcher",
      },
      {
        baseUrl: "http://127.0.0.1:8888/",
        token: "saved-token",
        displayName: undefined,
        source: "saved",
      },
    ]);
  });

  it("dedupes saved connections that match the CLI handoff", () => {
    expect(
      getAutoConnectionCandidates(launcherConnection, [
        { baseUrl: "http://127.0.0.1:9000/", token: "launcher-token" },
        { baseUrl: "http://127.0.0.1:8888/", token: "saved-token" },
      ])
    ).toHaveLength(2);
  });
});
