import { describe, expect, it } from "vitest";

import {
  ORION_UI_SKILL_NAME,
  buildRequiredSkillsPromptSection,
  resolveImplicitForcedSkillNames,
} from "./implicit-skills";

describe("resolveImplicitForcedSkillNames", () => {
  it("loads orion-ui when a notebook is open in the editor", () => {
    expect(
      resolveImplicitForcedSkillNames({
        notebookPath: "analysis/experiment.ipynb",
      })
    ).toEqual([ORION_UI_SKILL_NAME]);
  });

  it("skips orion-ui when a non-notebook file is open in the editor", () => {
    expect(
      resolveImplicitForcedSkillNames({
        activeFilePath: "src/train.py",
      })
    ).toEqual([]);
  });

  it("skips orion-ui when no editor context is provided", () => {
    expect(resolveImplicitForcedSkillNames({})).toEqual([]);
  });

  it("loads orion-ui for sub-agent runs regardless of parent editor context", () => {
    expect(
      resolveImplicitForcedSkillNames({
        origin: "subagent",
        activeFilePath: "README.md",
      })
    ).toEqual([ORION_UI_SKILL_NAME]);
  });
});

describe("buildRequiredSkillsPromptSection", () => {
  it("returns null when no skills are required", () => {
    expect(buildRequiredSkillsPromptSection([])).toBeNull();
  });

  it("lists each required load_skill call", () => {
    const section = buildRequiredSkillsPromptSection(["orion-ui", "deep-eda"]);
    expect(section).toContain("## Required Skills");
    expect(section).toContain("`orion-ui`");
    expect(section).toContain('load_skill` with `name: "deep-eda"');
  });
});
