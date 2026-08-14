import { describe, expect, it } from "vitest";

import {
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
