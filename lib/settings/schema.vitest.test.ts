import { describe, expect, it } from "vitest";

import {
  createDefaultUserSettingsDocument,
  DEFAULT_SETTINGS,
  DEFAULT_TITLE_GENERATION_MAX_LENGTH,
  DEFAULT_TITLE_GENERATION_MODEL_ID,
} from "@/lib/settings/defaults";
import { mergeSettings } from "@/lib/settings/merge";
import {
  parseUserSettingsDocumentFromJson,
  parseWorkspaceSettingsDocumentFromJson,
} from "@/lib/settings/migrations";
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
    expect(doc.settings.onboarding.signInStepCompleted).toBe(false);
    expect(doc.settings.onboarding.businessProfileStepCompleted).toBe(false);
    expect(doc.settings.appearance.experienceMode).toBe("business");
    expect(doc.settings.appearance.experienceModeChosen).toBe(false);
    expect(doc.settings.providers.inferenceProviderChosen).toBe(false);
    expect(doc.settings.chat.titleGenerationMaxLength).toBe(
      DEFAULT_TITLE_GENERATION_MAX_LENGTH
    );
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
    expect(migrated.settings.chat.titleGenerationMaxLength).toBe(
      DEFAULT_TITLE_GENERATION_MAX_LENGTH
    );
    expect(migrated.settings.appearance.experienceMode).toBe("business");
    expect(migrated.settings.onboarding.signInStepCompleted).toBe(true);
    expect(migrated.settings.onboarding.businessProfileStepCompleted).toBe(true);
    expect(migrated.settings.appearance.experienceModeChosen).toBe(true);
    expect(migrated.settings.providers.inferenceProviderChosen).toBe(true);
    expect(migrated.settings.agent.context.compactionAutoThreshold).toBe(0.92);
    expect(migrated.settings.agent.toolOutput.textCharBudget).toBe(40_000);
    expect(migrated.settings.agent.execution.maxParallelReadOnlyCalls).toBe(10);
    expect(migrated.settings.shell.mobileBreakpointPx).toBe(768);
    expect(migrated.settings.chat.interactionModes.map((mode) => mode.id)).toEqual([
      "Agent",
      "Research",
      "Edit",
      "Ask",
    ]);
    expect(migrated.settings.chat.notifyOnAgentFinish).toBe(true);
    expect(migrated.settings.chat.playSoundOnAgentFinish).toBe(true);
  });

  it("accepts any positive integer for read-only tool concurrency", () => {
    const doc = createDefaultUserSettingsDocument();
    doc.settings.agent.execution.maxParallelReadOnlyCalls = 100_000;
    expect(UserSettingsDocumentSchema.safeParse(doc).success).toBe(true);

    for (const invalidValue of [0, -1, 1.5, Number.NaN]) {
      const invalidDoc = createDefaultUserSettingsDocument();
      invalidDoc.settings.agent.execution.maxParallelReadOnlyCalls = invalidValue;
      expect(UserSettingsDocumentSchema.safeParse(invalidDoc).success).toBe(false);
    }

    const workspace = parseWorkspaceSettingsDocumentFromJson(
      JSON.stringify({
        version: 1,
        overrides: {
          agent: {
            execution: {
              maxParallelReadOnlyCalls: 250_000,
            },
          },
        },
      })
    );
    expect(
      workspace.overrides.agent?.execution?.maxParallelReadOnlyCalls
    ).toBe(250_000);
  });

  it("requires title lengths between 10 and 100 characters", () => {
    for (const titleGenerationMaxLength of [9, 101, 35.5]) {
      const doc = createDefaultUserSettingsDocument();
      doc.settings.chat.titleGenerationMaxLength = titleGenerationMaxLength;
      expect(UserSettingsDocumentSchema.safeParse(doc).success).toBe(false);
    }
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
    expect(migrated.settings.agent.terminal.poolIdleTimeoutMs).toBe(3_600_000);
  });

  it("strips retired hidden system-terminal settings", () => {
    const migrated = parseUserSettingsDocumentFromJson(
      JSON.stringify({
        version: 1,
        settings: {
          agent: {
            terminal: {
              executorTimeoutMs: 15_000,
              executorAvailabilityTimeoutMs: 3_000,
              executorPollIntervalMs: 300,
              poolSystemSize: 2,
            },
            search: { maxMatches: 100 },
          },
        },
      })
    );

    const terminal = migrated.settings.agent.terminal as Record<string, unknown>;
    const agent = migrated.settings.agent as Record<string, unknown>;
    expect(terminal).not.toHaveProperty("executorTimeoutMs");
    expect(terminal).not.toHaveProperty("executorAvailabilityTimeoutMs");
    expect(terminal).not.toHaveProperty("executorPollIntervalMs");
    expect(terminal).not.toHaveProperty("poolSystemSize");
    expect(agent).not.toHaveProperty("search");
  });

  it("strips retired hidden system-terminal workspace overrides", () => {
    const migrated = parseWorkspaceSettingsDocumentFromJson(
      JSON.stringify({
        version: 1,
        overrides: {
          agent: {
            terminal: { poolSystemSize: 2 },
            search: { maxMatches: 100 },
          },
        },
      })
    );

    const agent = migrated.overrides.agent as Record<string, unknown>;
    expect(agent).not.toHaveProperty("search");
    expect(agent.terminal).toEqual({});
  });
});

describe("mergeSettings", () => {
  it("applies workspace partial overrides while preserving other agent defaults", () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, DEFAULT_SETTINGS, {
      agent: {
        execution: {
          maxParallelReadOnlyCalls: 999,
        },
        terminal: {
          poolIdleTimeoutMs: 250,
        },
      },
    });

    expect(merged.agent.execution.maxParallelReadOnlyCalls).toBe(999);
    expect(merged.agent.terminal.poolIdleTimeoutMs).toBe(250);
    expect(merged.agent.terminal.foregroundBudgetMs).toBe(
      DEFAULT_SETTINGS.agent.terminal.foregroundBudgetMs
    );
    expect(merged.agent.context.compactionRetentionTurns).toBe(4);
  });
});
