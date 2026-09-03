// @vitest-environment node

import { mkdtemp } from "fs/promises";
import { createServer } from "net";
import os from "os";
import path from "path";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_ORION_PORT,
  findAvailableOrionPort,
  startOrionAppServer,
} from "@/lib/cli/app-server";

describe("startOrionAppServer", () => {
  it("uses port 7070 by default", () => {
    expect(DEFAULT_ORION_PORT).toBe(7070);
  });

  it("chooses the next port when the requested port is busy", async () => {
    const occupiedServer = createServer();
    await new Promise<void>((resolve) => occupiedServer.listen(0, "127.0.0.1", resolve));
    const address = occupiedServer.address();
    if (typeof address !== "object" || address === null) {
      throw new Error("Test server did not expose a TCP port.");
    }

    try {
      await expect(findAvailableOrionPort(address.port)).resolves.toBeGreaterThan(address.port);
    } finally {
      await new Promise<void>((resolve, reject) =>
        occupiedServer.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });

  it("rejects an invalid requested port", async () => {
    await expect(findAvailableOrionPort(0)).rejects.toThrow(
      "ORION_PORT must be an integer between 1 and 65535."
    );
  });

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
