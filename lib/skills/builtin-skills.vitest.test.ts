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
      expect.arrayContaining(["create-app", "create-rule", "orion-settings", "chat-history", "deep-eda"])
    );
  });

  it("has parseable frontmatter for every built-in skill", () => {
    for (const skill of readBuiltinSkills()) {
      expect(skill.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(skill.description ?? "").not.toBe("");
      expect(skill.content.length).toBeGreaterThan(0);
    }
  });

  it("makes Matplotlib raster evidence the deep-EDA visualization default", () => {
    const skill = readBuiltinSkills().find((candidate) => candidate.name === "deep-eda");
    expect(skill?.content).toContain("matplotlib.pyplot as plt");
    expect(skill?.content).toContain("Do not use Plotly");
    expect(skill?.content).toContain("no PNG/JPEG plot");
  });
});
