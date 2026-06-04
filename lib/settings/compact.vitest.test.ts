import { describe, expect, it } from "vitest";

import {
  compactSettingsForPersistence,
  compactUserSettingsDocument,
  settingsValuesEqual,
} from "@/lib/settings/compact";
import {
  createDefaultUserSettingsDocument,
  DEFAULT_SETTINGS,
} from "@/lib/settings/defaults";

describe("compactSettingsForPersistence", () => {
  it("returns an empty object when settings match defaults", () => {
    expect(compactSettingsForPersistence(DEFAULT_SETTINGS)).toEqual({});
  });

  it("keeps only top-level and nested overrides", () => {
    const compacted = compactSettingsForPersistence({
      ...DEFAULT_SETTINGS,
      appearance: { theme: "light" },
      chat: {
        ...DEFAULT_SETTINGS.chat,
        toolApprovalMode: "auto_run",
        pinnedModelIds: ["gpt-5.5"],
        fontSize: 13,
      },
      workspace: {
        pinnedDirectoryPaths: ["project/a"],
      },
    });

    expect(compacted).toEqual({
      appearance: { theme: "light" },
      chat: {
        toolApprovalMode: "auto_run",
        pinnedModelIds: ["gpt-5.5"],
        fontSize: 13,
      },
      workspace: {
        pinnedDirectoryPaths: ["project/a"],
      },
    });
  });

  it("drops agent, shell, and notebook builtin blocks when unchanged", () => {
    const document = createDefaultUserSettingsDocument();
    document.settings.appearance.theme = "dark";

    const compacted = compactUserSettingsDocument(document);
    expect(compacted.settings).toEqual({
      appearance: { theme: "dark" },
    });
    expect("agent" in compacted.settings).toBe(false);
    expect("shell" in compacted.settings).toBe(false);
  });

  it("keeps non-default titleGenerationModelId in chat overrides", () => {
    const compacted = compactSettingsForPersistence({
      ...DEFAULT_SETTINGS,
      chat: {
        ...DEFAULT_SETTINGS.chat,
        titleGenerationModelId: "claude-sonnet-4-6",
        toolApprovalMode: "auto_run",
        pinnedModelIds: ["gpt-5.5"],
        fontSize: 13,
      },
    });

    expect(compacted.chat?.titleGenerationModelId).toBe("claude-sonnet-4-6");
  });

  it("omits empty provider credentials matching defaults", () => {
    const document = createDefaultUserSettingsDocument();
    document.settings.appearance.theme = "light";

    const compacted = compactUserSettingsDocument(document);
    expect(compacted.settings.providers).toBeUndefined();
  });
});

describe("settingsValuesEqual", () => {
  it("compares nested structures", () => {
    expect(settingsValuesEqual([1, 2], [1, 2])).toBe(true);
    expect(settingsValuesEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
    expect(settingsValuesEqual({ a: 1 }, { a: 2 })).toBe(false);
  });
});
