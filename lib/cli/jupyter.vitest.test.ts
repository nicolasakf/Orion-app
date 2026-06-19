// @vitest-environment node

import os from "os";

import { describe, expect, it } from "vitest";

import { startJupyterServer } from "@/lib/cli/jupyter";

describe("startJupyterServer", () => {
  it("rejects with an actionable error instead of crashing when the Python command cannot be spawned", async () => {
    // A non-existent command triggers an async `error` event on the child
    // process. Without an `error` listener Node would throw this as an uncaught
    // exception (the Windows bootstrap regression); it must surface as a
    // rejected promise the CLI can report.
    await expect(
      startJupyterServer(
        "orion-nonexistent-python-binary-xyz",
        [],
        os.tmpdir(),
        2_000
      )
    ).rejects.toThrow(/Could not start Jupyter with orion-nonexistent-python-binary-xyz/);
  });
});
