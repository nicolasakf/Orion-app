import { describe, expect, it } from "vitest";

import { getDefaultInteractionModeConfig } from "@/lib/agent/interaction-modes";

import { resolveGoalModeSubmission } from "./goal-mode-submission";

describe("goal mode submission", () => {
  it("starts contract authoring from a normal prompt while Goal is selected", () => {
    expect(
      resolveGoalModeSubmission({
        input: "  Ship a measurable retention analysis.  ",
        slashCommand: null,
        interactionMode: getDefaultInteractionModeConfig("Goal"),
      }),
    ).toEqual({
      activation: "selector",
      objective: "Ship a measurable retention analysis.",
    });
  });

  it("keeps /goal as a shortcut regardless of the selected mode", () => {
    expect(
      resolveGoalModeSubmission({
        input: "/goal   Ship a measurable retention analysis.",
        slashCommand: "goal",
        interactionMode: getDefaultInteractionModeConfig("Ask"),
      }),
    ).toEqual({
      activation: "slash",
      objective: "Ship a measurable retention analysis.",
    });
  });

  it("leaves ordinary Agent submissions unchanged", () => {
    expect(
      resolveGoalModeSubmission({
        input: "Fix the failing test.",
        slashCommand: null,
        interactionMode: getDefaultInteractionModeConfig("Agent"),
      }),
    ).toBeNull();
  });

  it("does not swallow other slash commands while Goal is selected", () => {
    expect(
      resolveGoalModeSubmission({
        input: "/compact",
        slashCommand: "compact",
        interactionMode: getDefaultInteractionModeConfig("Goal"),
      }),
    ).toBeNull();
  });
});
