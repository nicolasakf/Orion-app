// @vitest-environment node

import { mkdtemp } from "fs/promises";
import os from "os";
import path from "path";

import { describe, expect, it } from "vitest";

import { startOrionAppServer } from "@/lib/cli/app-server";

describe("startOrionAppServer", () => {
  it("honors an explicit app directory before resolving bundled defaults", async () => {
    const appDirectory = await mkdtemp(path.join(os.tmpdir(), "orion-app-server-"));

    await expect(
      startOrionAppServer({
        appDirectory,
        nodeExecutable: "/tmp/orion-node",
        readyTimeoutMs: 1,
      })
    ).rejects.toThrow(`Orion app bundle was not found at ${path.join(appDirectory, "server.js")}`);
  });
});

