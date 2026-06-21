import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildInstallCommand, GET, POST } from "./route";

describe("CLI update API", () => {
  beforeEach(() => {
    vi.stubEnv("ORION_LAUNCH_MODE", "cli");
    vi.stubEnv("ORION_INSTALL_CHANNEL", "pip");
    vi.stubEnv("ORION_CURRENT_VERSION", "0.10.1");
    vi.stubEnv("ORION_LAUNCHER_EXECUTABLE", "/tmp/python");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns validated package update state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ info: { version: "0.11.0" } }))
      )
    );
    const response = await GET();
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ source: "pip", status: "available", latestVersion: "0.11.0" })
    );
  });

  it("rejects cross-origin installation requests", async () => {
    const request = new NextRequest("http://127.0.0.1:3001/api/update", {
      method: "POST",
      headers: {
        host: "127.0.0.1:3001",
        origin: "https://example.com",
        "content-type": "application/json",
      },
      body: JSON.stringify({ action: "install" }),
    });
    expect((await POST(request)).status).toBe(403);
  });

  it("builds only the allowlisted pip self-update command", () => {
    expect(buildInstallCommand("pip")).toEqual([
      "/tmp/python",
      ["-m", "pip", "install", "--upgrade", "orion-notebook"],
    ]);
  });
});
