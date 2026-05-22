import { describe, expect, it } from "vitest";

import { DEFAULT_TITLE_GENERATION_MODEL_ID } from "@/lib/settings/defaults";
import { parseUserSettingsDocumentFromJson } from "@/lib/settings/migrations";
import { ToolApprovalModeSchema } from "@/lib/settings/schema";

describe("ToolApprovalModeSchema", () => {
  it.each([
    ["always_ask", "always_ask"],
    ["Always Ask", "always_ask"],
    ["always ask", "always_ask"],
    ["auto_run", "auto_run"],
    ["Auto Run", "auto_run"],
    ["Autorun", "auto_run"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(ToolApprovalModeSchema.parse(input)).toBe(expected);
  });
});

describe("settings migrations", () => {
  it("backfills the title generation model for older user settings", () => {
    const migrated = parseUserSettingsDocumentFromJson(
      JSON.stringify({
        version: 1,
        settings: {
          appearance: { theme: "system" },
          chat: {
            toolApprovalMode: "always_ask",
            pinnedModelIds: [],
            fontSize: 12,
          },
        },
      })
    );

    expect(migrated.settings.chat.titleGenerationModelId).toBe(
      DEFAULT_TITLE_GENERATION_MODEL_ID
    );
  });

  it("migrates chatGenerationModelId to titleGenerationModelId", () => {
    const migrated = parseUserSettingsDocumentFromJson(
      JSON.stringify({
        version: 1,
        settings: {
          appearance: { theme: "system" },
          chat: {
            chatGenerationModelId: "gpt-4o-mini",
            toolApprovalMode: "always_ask",
            pinnedModelIds: [],
            fontSize: 12,
            communicationStyle: "default",
          },
          fileTree: { fontSize: 12 },
          editor: {
            fontSize: 12,
            wordWrap: "off",
            minimapEnabled: false,
            tabSize: 2,
            insertSpaces: true,
          },
          notebook: {
            scrollbarVisible: true,
            presentationHideAllCellInputs: false,
          },
          workspace: { pinnedDirectoryPaths: [] },
          providers: { credentials: {} },
        },
      })
    );

    expect(migrated.settings.chat.titleGenerationModelId).toBe("gpt-4o-mini");
    expect(
      "chatGenerationModelId" in migrated.settings.chat
    ).toBe(false);
  });
});
