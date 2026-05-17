/**
 * SkillRegistry — client-side skill cache and lookup.
 *
 * Merges built-in skills with skills discovered from the Jupyter filesystem.
 * Load order (later overrides earlier on the same `name`; all override built-ins):
 * 1. User-level `.agents/skills`, then `.orion/skills` at the server root (`.orion` overrides `.agents`).
 * 2. With a workspace root: `<workspace>/.agents/skills` → `.orion/skills` (after user layers, so project `.orion` wins overall).
 */

import type { ContentsManager } from "@jupyterlab/services";
import { BUILTIN_SKILLS } from "./builtin-skills";
import { parseFrontmatter } from "./parse-frontmatter";
import type { SkillInfo } from "./types";

/** User-level shared skills (Jupyter server root). Default authoring location with other agents. */
const USER_AGENTS_SKILLS = ".agents/skills";
/** User-level Orion overrides at server root — wins over `USER_AGENTS_SKILLS` for the same `name`. */
const USER_ORION_SKILLS = ".orion/skills";

/** Under `<workspace>/`, in merge order; `.orion/skills` last so it overrides `.agents/skills` in the same project. */
const PROJECT_SKILL_SCAN_BASES = [".agents/skills", ".orion/skills"] as const;

function joinPath(...parts: string[]): string {
  return parts
    .map((part) => part.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

export class SkillRegistry {
  private skills: Map<string, SkillInfo> = new Map();
  private contentsManager: ContentsManager | null = null;
  private workspaceRoot: string = "";

  constructor() {
    this.loadBuiltins();
  }

  private loadBuiltins(): void {
    for (const skill of BUILTIN_SKILLS) {
      this.skills.set(skill.name, skill);
    }
  }

  /**
   * Provide a ContentsManager and workspace root so workspace skills can be discovered.
   * Pass `null` when the kernel disconnects so `refresh()` only restores built-in skills.
   */
  setContentsManager(manager: ContentsManager | null, workspaceRoot: string): void {
    this.contentsManager = manager;
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Re-scan skill directories and merge with built-in skills.
   * Safe to call when no ContentsManager is set — returns immediately.
   */
  async refresh(): Promise<void> {
    this.skills.clear();
    this.loadBuiltins();

    if (!this.contentsManager) return;

    await this.mergeSkillsFromDirectory(USER_AGENTS_SKILLS);
    await this.mergeSkillsFromDirectory(USER_ORION_SKILLS);

    if (this.workspaceRoot) {
      for (const base of PROJECT_SKILL_SCAN_BASES) {
        await this.mergeSkillsFromDirectory(joinPath(this.workspaceRoot, base));
      }
    }
  }

  /**
   * Load every `<subdir>/SKILL.md` under `skillsDir` into the registry (overwrites by name).
   */
  private async mergeSkillsFromDirectory(skillsDir: string): Promise<void> {
    const contents = this.contentsManager;
    if (!contents) return;

    try {
      const dir = await contents.get(skillsDir, { content: true });
      if (dir.type !== "directory" || !Array.isArray(dir.content)) return;

      for (const entry of dir.content as Array<{ name: string; type: string }>) {
        if (entry.type !== "directory") continue;
        const skillPath = `${skillsDir}/${entry.name}/SKILL.md`;
        try {
          const file = await contents.get(skillPath, {
            content: true,
            format: "text",
          });
          if (!file.content) continue;

          const parsed = parseFrontmatter(file.content as string);
          if (!parsed.name || !parsed.description) continue;

          const skill: SkillInfo = {
            name: parsed.name,
            description: parsed.description,
            content: parsed.content,
            ...(parsed.disableModelInvocation !== undefined
              ? { disableModelInvocation: parsed.disableModelInvocation }
              : {}),
            source: "workspace",
            location: skillPath,
          };
          this.skills.set(skill.name, skill);
        } catch {
          // Skip skills that fail to parse or read
        }
      }
    } catch {
      // Directory missing — skip
    }
  }

  /** Return all available skills. */
  getAll(): SkillInfo[] {
    return Array.from(this.skills.values());
  }

  /** Look up a skill by name. Returns undefined if not found. */
  get(name: string): SkillInfo | undefined {
    return this.skills.get(name);
  }
}
