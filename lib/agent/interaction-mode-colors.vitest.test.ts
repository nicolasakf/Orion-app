import { describe, expect, it } from "vitest";

import {
  DEFAULT_INTERACTION_MODE_SELECTOR_COLORS,
  getDefaultInteractionModeSelectorColor,
  normalizeInteractionModeConfigs,
} from "./interaction-modes";
import {
  getInteractionModeColorStyle,
  getInteractionModeColors,
} from "./interaction-mode-colors";

describe("interaction mode selector colors", () => {
  it("uses the requested built-in defaults", () => {
    expect(DEFAULT_INTERACTION_MODE_SELECTOR_COLORS).toEqual({
      Agent: null,
      Goal: "#22C55E",
      Explore: "#3B82F6",
      Edit: "#EF4444",
      Ask: "#EAB308",
    });
  });

  it("normalizes persisted selector colors and repairs invalid values", () => {
    const modes = normalizeInteractionModeConfigs([
      { id: "Agent", selectorColor: "#112233" },
      { id: "Explore", selectorColor: "not-a-color" },
      { id: "Ask", selectorColor: null },
    ]);

    expect(modes.find((mode) => mode.id === "Agent")?.selectorColor).toBe(
      "#112233",
    );
    expect(modes.find((mode) => mode.id === "Explore")?.selectorColor).toBe(
      "#3B82F6",
    );
    expect(modes.find((mode) => mode.id === "Ask")?.selectorColor).toBeNull();
  });

  it("derives custom mode defaults from the selected base mode", () => {
    const modes = normalizeInteractionModeConfigs([
      {
        id: "research",
        label: "Research",
        description: "",
        baseMode: "Ask",
        toolNames: [],
        customSystemPrompt: "",
        builtIn: false,
        bashPolicy: "read_only",
      },
    ]);

    expect(modes.find((mode) => mode.id === "research")?.selectorColor).toBe(
      "#EAB308",
    );
    expect(
      getDefaultInteractionModeSelectorColor({
        baseMode: "Edit",
        orchestration: "normal",
      }),
    ).toBe("#EF4444");
  });

  it("maps selector colors to default or tinted chat styling", () => {
    expect(getInteractionModeColorStyle(null)).toMatchObject({
      color: null,
      triggerClassName: "bg-muted hover:bg-accent",
      iconClassName: "opacity-70",
    });
    expect(getInteractionModeColorStyle("#3B82F6")).toMatchObject({
      color: "#3B82F6",
      iconStyle: { color: "#3B82F6" },
    });
    expect(
      getInteractionModeColors(
        normalizeInteractionModeConfigs([]).find((mode) => mode.id === "Agent"),
      ).color,
    ).toBeNull();
  });
});
