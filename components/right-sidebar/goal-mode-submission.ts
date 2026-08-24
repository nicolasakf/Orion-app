import type { InteractionModeConfig } from "@/lib/agent/interaction-modes";

export type GoalModeActivation = "selector" | "slash";

export interface GoalModeSubmission {
  activation: GoalModeActivation;
  objective: string;
}

/** Resolves whether the composer submission should begin goal contract authoring. */
export function resolveGoalModeSubmission(options: {
  input: string;
  slashCommand: string | null;
  interactionMode: InteractionModeConfig;
}): GoalModeSubmission | null {
  if (options.slashCommand === "goal") {
    return {
      activation: "slash",
      objective: options.input.trimStart().slice("/goal".length).trimStart(),
    };
  }
  if (options.slashCommand !== null) return null;
  if (options.interactionMode.orchestration !== "goal") return null;
  return {
    activation: "selector",
    objective: options.input.trim(),
  };
}
