import { readdirSync, readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import { parseFrontmatter } from "@/lib/skills/parse-frontmatter";

const BUILTIN_SKILLS_DIR = path.resolve(__dirname, "builtin");

/** Reads built-in SKILL.md files directly because Vitest does not apply Next raw-loader rules. */
function readBuiltinSkills() {
  return readdirSync(BUILTIN_SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const raw = readFileSync(
        path.join(BUILTIN_SKILLS_DIR, entry.name, "SKILL.md"),
        "utf8"
      );
      return parseFrontmatter(raw);
    });
}

describe("built-in skills", () => {
  it("includes core Orion built-in skills", () => {
    expect(readBuiltinSkills().map((skill) => skill.name)).toEqual(
      expect.arrayContaining([
        "create-app",
        "create-rule",
        "orion-docs",
        "orion-settings",
        "chat-history",
        "explore",
        "analyze-my-data",
        "monthly-report",
        "margin-analysis",
        "inventory-aging",
      ])
    );
  });

  it("has parseable frontmatter for every built-in skill", () => {
    for (const skill of readBuiltinSkills()) {
      expect(skill.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(skill.description ?? "").not.toBe("");
      expect(skill.content.length).toBeGreaterThan(0);
    }
  });

  it("documents the parallel read-only execution setting", () => {
    const skill = readBuiltinSkills().find(
      (candidate) => candidate.name === "orion-settings"
    );
    expect(skill?.content).toContain('"maxParallelReadOnlyCalls": 10');
    expect(skill?.content).toContain("### `agent.execution`");
  });

  it("keeps explore as an EDA profile shortcut", () => {
    const skill = readBuiltinSkills().find((candidate) => candidate.name === "explore");
    expect(skill?.content).toContain("EDA profile");
    expect(skill?.content).toContain("Use normal notebook, kernel, file, web, and terminal tools");
    expect(skill?.content).toContain("schema_integrity");
    expect(skill?.content).toContain("Matplotlib/Seaborn");
    expect(skill?.content).toContain("staged research coverage");
    expect(skill?.content).toContain("before the first execution");
  });
});
