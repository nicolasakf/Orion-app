import { describe, expect, it } from "vitest";

import {
  createDefaultUserSettingsDocument,
  DEFAULT_SETTINGS,
  DEFAULT_TITLE_GENERATION_MODEL_ID,
} from "@/lib/settings/defaults";
import { mergeSettings } from "@/lib/settings/merge";
import { parseUserSettingsDocumentFromJson } from "@/lib/settings/migrations";
import {
  ToolApprovalModeSchema,
  UserSettingsDocumentSchema,
} from "@/lib/settings/schema";

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

describe("UserSettingsDocumentSchema", () => {
  it("parses the built-in default user document", () => {
    const doc = createDefaultUserSettingsDocument();
    expect(() => UserSettingsDocumentSchema.parse(doc)).not.toThrow();
    expect(doc.settings.agent.context.compactionAutoThreshold).toBe(0.92);
    expect(doc.settings.shell.panelLayout.horizontal).toEqual([15, 50, 20]);
    expect(doc.settings.notebook.output.chartColors).toHaveLength(10);
    expect(doc.settings.chat.interactionModes.map((mode) => mode.id)).toEqual([
      "Agent",
      "Research",
      "Edit",
      "Ask",
    ]);
    expect(
      doc.settings.chat.interactionModes.find((mode) => mode.id === "Research")?.hiddenInSelector
    ).toBe(true);
  });

  it("rejects compaction threshold above 1 on a full document", () => {
    const doc = createDefaultUserSettingsDocument();
    doc.settings.agent.context.compactionAutoThreshold = 1.5;
    const result = UserSettingsDocumentSchema.safeParse(doc);
    expect(result.success).toBe(false);
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
    expect(migrated.settings.agent.context.compactionAutoThreshold).toBe(0.92);
    expect(migrated.settings.agent.toolOutput.textCharBudget).toBe(40_000);
    expect(migrated.settings.shell.mobileBreakpointPx).toBe(768);
    expect(migrated.settings.chat.interactionModes.map((mode) => mode.id)).toEqual([
      "Agent",
      "Research",
      "Edit",
      "Ask",
    ]);
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
          },
          workspace: { pinnedDirectoryPaths: [], pinnedFilePaths: [] },
          providers: { credentials: {} },
        },
      })
    );

    expect(migrated.settings.chat.titleGenerationModelId).toBe("gpt-4o-mini");
    expect(
      "chatGenerationModelId" in migrated.settings.chat
    ).toBe(false);
    expect(migrated.settings.agent.search.maxMatches).toBe(100);
  });
});

describe("mergeSettings", () => {
  it("applies workspace partial overrides while preserving other agent defaults", () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, DEFAULT_SETTINGS, {
      agent: {
        search: {
          maxMatches: 250,
        },
      },
    });

    expect(merged.agent.search.maxMatches).toBe(250);
    expect(merged.agent.search.maxLineLength).toBe(
      DEFAULT_SETTINGS.agent.search.maxLineLength
    );
    expect(merged.agent.context.compactionRetentionTurns).toBe(4);
  });
});
