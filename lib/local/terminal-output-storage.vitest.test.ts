// @vitest-environment node

import { readFile, rm, stat } from "fs/promises";
import { mkdtemp } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  formatHomeRelativePath,
  saveTerminalOutputSpill,
} from "@/lib/local/terminal-output-storage.server";
import { getTerminalOutputDirectory } from "@/lib/local/orion-paths.server";

let tempDirectory: string;

beforeEach(async () => {
  tempDirectory = await mkdtemp(path.join(os.tmpdir(), "orion-terminal-"));
  process.env.ORION_HOME_DIR = tempDirectory;
});

afterEach(async () => {
  delete process.env.ORION_HOME_DIR;
  await rm(tempDirectory, { recursive: true, force: true });
});

describe("terminal output spill storage", () => {
  it("creates ~/.orion/terminal and saves spill logs there", async () => {
    const filePath = await saveTerminalOutputSpill("line one\nline two\n");
    const terminalDir = getTerminalOutputDirectory();

    expect((await stat(terminalDir)).isDirectory()).toBe(true);
    expect(filePath).toMatch(/^~\/\.orion\/terminal\/terminal_output_.+\.log$/);

    const absolutePath = path.join(terminalDir, path.basename(filePath));
    await expect(readFile(absolutePath, "utf8")).resolves.toBe(
      "line one\nline two\n"
    );
  });

  it("formats paths under the Orion data directory as ~/.orion/...", () => {
    expect(
      formatHomeRelativePath(path.join(tempDirectory, "terminal", "a.log"))
    ).toBe("~/.orion/terminal/a.log");
  });

  it("leaves unrelated absolute paths unchanged when formatting", () => {
    expect(formatHomeRelativePath("/tmp/output.log")).toBe("/tmp/output.log");
  });
});
