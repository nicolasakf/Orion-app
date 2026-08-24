import { describe, expect, it } from "vitest";

import { isOrionHomeEditorPath } from "@/lib/local/orion-home-editor-path";
import {
  isPersonalContextEditorPath,
  PERSONAL_CONTEXT_EDITOR_PATH,
} from "@/lib/onboarding/personal-context-editor-path";
import { USER_SETTINGS_EDITOR_PATH } from "@/lib/settings/user-settings-editor-path";

describe("personal context editor path", () => {
  it("matches only the virtual ORION.md editor path", () => {
    expect(isPersonalContextEditorPath(PERSONAL_CONTEXT_EDITOR_PATH)).toBe(true);
    expect(isPersonalContextEditorPath("ORION.md")).toBe(false);
    expect(isPersonalContextEditorPath(USER_SETTINGS_EDITOR_PATH)).toBe(false);
    expect(isPersonalContextEditorPath(null)).toBe(false);
  });

  it("treats virtual ~/.orion editor files as home-backed paths", () => {
    expect(isOrionHomeEditorPath(PERSONAL_CONTEXT_EDITOR_PATH)).toBe(true);
    expect(isOrionHomeEditorPath(USER_SETTINGS_EDITOR_PATH)).toBe(true);
    expect(isOrionHomeEditorPath("notes.md")).toBe(false);
  });
});
