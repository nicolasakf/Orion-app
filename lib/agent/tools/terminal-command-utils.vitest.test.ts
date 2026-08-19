import { describe, expect, it } from "vitest";

import {
  classifyUnfinishedCommand,
  detectInteractivePrompt,
  IDLE_STALL_MS,
  parseCommandProgress,
  stripTerminalMarkerNoise,
} from "./terminal-command-utils";

const pending = {
  startMarker: "ORION_CMD_START_1786631045081_fwpc6z",
  endMarkerPrefix: "ORION_CMD_END_1786631045081_fwpc6z",
};

describe("parseCommandProgress", () => {
  it("recognizes the completion marker attached to spinner output", () => {
    const raw = [
      "echoed wrapper containing 'ORION_CMD_START_1786631045081_fwpc6z'",
      pending.startMarker,
      "### Browser `default` opened.",
      "⠙ORION_CMD_END_1786631045081_fwpc6z:0",
      "%",
      "prompt",
    ].join("\n");

    expect(parseCommandProgress(raw, pending)).toEqual({
      completed: true,
      exitCode: 0,
      output: "### Browser `default` opened.\n⠙",
    });
  });

  it("preserves ordinary output attached immediately before the marker", () => {
    const raw = `${pending.startMarker}\nno-final-newline${pending.endMarkerPrefix}:0\nprompt`;

    expect(parseCommandProgress(raw, pending)).toEqual({
      completed: true,
      exitCode: 0,
      output: "no-final-newline",
    });
  });

  it("parses ANSI-decorated markers and nonzero exit codes", () => {
    const raw = `\u001b[32m${pending.startMarker}\u001b[0m\nfailed\n\u001b[31m${pending.endMarkerPrefix}:17\u001b[0m`;

    expect(parseCommandProgress(raw, pending)).toEqual({
      completed: true,
      exitCode: 17,
      output: "failed",
    });
  });

  it("stays incomplete until a marker split across chunks is complete", () => {
    const firstChunk = `${pending.startMarker}\npartial\n${pending.endMarkerPrefix}:`;
    const secondChunk = "0\nprompt";

    expect(parseCommandProgress(firstChunk, pending).completed).toBe(false);
    expect(parseCommandProgress(firstChunk + secondChunk, pending)).toEqual({
      completed: true,
      exitCode: 0,
      output: "partial",
    });
  });

  it("uses the last standalone start marker instead of the echoed wrapper", () => {
    const raw = [
      `command printf '%s' '${pending.startMarker}'; encoded payload`,
      pending.startMarker,
      "actual output",
      `${pending.endMarkerPrefix}:0`,
    ].join("\n");

    expect(parseCommandProgress(raw, pending).output).toBe("actual output");
  });

  it("removes attached marker tokens without deleting adjacent text", () => {
    expect(
      stripTerminalMarkerNoise(
        `before${pending.startMarker}middle${pending.endMarkerPrefix}:0after`
      )
    ).toBe("beforemiddleafter");
  });
});

describe("detectInteractivePrompt", () => {
  it.each([
    ['{\n  "login": "octocat"\n}\n(END)', "pager end-of-file prompt"],
    ["some manual text\n--More--(24%)", "pager prompt (--More--)"],
    ["reading /etc/hosts\n:", "pager prompt (:)"],
    ["Delete branch feature? [y/N]", "yes/no confirmation prompt"],
    ["Enter passphrase for key '/home/u/.ssh/id_ed25519':", "password prompt"],
    ["Press ENTER to continue", "keypress prompt"],
  ])("flags %j as an interactive prompt", (output, expected) => {
    expect(detectInteractivePrompt(output)).toContain(expected);
  });

  it("ignores prompt-like text that is not the final line", () => {
    const listing = ["notes.txt", "(END)", "credits: [y/N]", "total 3 files"].join(
      "\n"
    );
    expect(detectInteractivePrompt(listing)).toBeNull();
  });

  it("ignores ordinary output ending in a colon", () => {
    expect(detectInteractivePrompt("Installed packages:")).toBeNull();
  });

  it("ignores empty output", () => {
    expect(detectInteractivePrompt("   \n\n")).toBeNull();
  });

  it("sees through ANSI decoration around the prompt", () => {
    expect(detectInteractivePrompt("body\n\u001b[7m(END)\u001b[0m")).not.toBeNull();
  });
});

describe("classifyUnfinishedCommand", () => {
  it("stalls immediately on a prompt even when output is fresh", () => {
    const result = classifyUnfinishedCommand({
      output: "hosts file\n(END)",
      lastOutputAtMs: Date.now(),
    });
    expect(result.stalled).toBe(true);
    expect(result.promptLabel).not.toBeNull();
  });

  it("stalls on prolonged silence with no prompt", () => {
    const result = classifyUnfinishedCommand({
      output: "compiling",
      lastOutputAtMs: Date.now() - IDLE_STALL_MS - 1_000,
    });
    expect(result.stalled).toBe(true);
    expect(result.promptLabel).toBeNull();
    expect(result.idleMs).toBeGreaterThanOrEqual(IDLE_STALL_MS);
  });

  it("keeps a chatty long-running command in the running state", () => {
    const result = classifyUnfinishedCommand({
      output: "[42/100] building",
      lastOutputAtMs: Date.now() - 500,
    });
    expect(result.stalled).toBe(false);
  });
});
