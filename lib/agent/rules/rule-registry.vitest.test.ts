import type { ContentsManager } from "@jupyterlab/services";
import { describe, expect, it } from "vitest";

import { RuleRegistry } from "./registry";
import { MAX_AGENT_RULE_CONTENT_CHARS } from "./constants";
import { parseAgentRulesPayload } from "./request-schema";

function createContentsManager(files: Record<string, unknown>): ContentsManager {
  return {
    async get(path: string) {
      if (!(path in files)) {
        throw new Error(`missing: ${path}`);
      }
      return {
        type: "file",
        content: files[path],
      };
    },
  } as unknown as ContentsManager;
}

describe("RuleRegistry", () => {
  it("loads AGENTS.md before CLAUDE.md in the same scope", async () => {
    const registry = new RuleRegistry();
    registry.setContentsManager(
      createContentsManager({
        "AGENTS.md": "Use agent rules.",
        "CLAUDE.md": "Use claude rules.",
      }),
      ""
    );

    await registry.refresh();

    expect(registry.getAll()).toEqual([
      {
        path: "AGENTS.md",
        filename: "AGENTS.md",
        scope: "workspace",
        content: "Use agent rules.",
      },
    ]);
  });

  it("loads root global and nested workspace rules", async () => {
    const registry = new RuleRegistry();
    registry.setContentsManager(
      createContentsManager({
        "AGENTS.md": "Global root rule.",
        "project/CLAUDE.md": "Workspace fallback rule.",
      }),
      "project"
    );

    await registry.refresh();

    expect(registry.getAll()).toEqual([
      {
        path: "AGENTS.md",
        filename: "AGENTS.md",
        scope: "global",
        content: "Global root rule.",
      },
      {
        path: "project/CLAUDE.md",
        filename: "CLAUDE.md",
        scope: "workspace",
        content: "Workspace fallback rule.",
      },
    ]);
  });

  it("does not duplicate the root rule for a Jupyter-root workspace", async () => {
    const registry = new RuleRegistry();
    registry.setContentsManager(
      createContentsManager({
        "AGENTS.md": "Root workspace rule.",
      }),
      ""
    );

    await registry.refresh();

    expect(registry.getAll()).toHaveLength(1);
    expect(registry.getAll()[0]?.scope).toBe("workspace");
  });

  it("skips missing, empty, non-text, and oversized rules without failing", async () => {
    const registry = new RuleRegistry();
    registry.setContentsManager(
      createContentsManager({
        "AGENTS.md": "",
        "CLAUDE.md": { text: "not text" },
        "project/AGENTS.md": "x".repeat(MAX_AGENT_RULE_CONTENT_CHARS + 1),
      }),
      "project"
    );

    await registry.refresh();

    expect(registry.getAll()).toEqual([]);
  });
});

describe("parseAgentRulesPayload", () => {
  it("accepts valid rule payloads and defaults undefined to an empty list", () => {
    expect(parseAgentRulesPayload(undefined)).toEqual([]);
    expect(
      parseAgentRulesPayload([
        {
          path: "AGENTS.md",
          filename: "AGENTS.md",
          scope: "workspace",
          content: "Follow local rules.",
        },
      ])
    ).toEqual([
      {
        path: "AGENTS.md",
        filename: "AGENTS.md",
        scope: "workspace",
        content: "Follow local rules.",
      },
    ]);
  });

  it("rejects malformed or oversized rule payloads", () => {
    expect(parseAgentRulesPayload({})).toBeNull();
    expect(
      parseAgentRulesPayload([
        {
          path: "AGENTS.md",
          filename: "README.md",
          scope: "workspace",
          content: "nope",
        },
      ])
    ).toBeNull();
    expect(
      parseAgentRulesPayload([
        { path: "a", filename: "AGENTS.md", scope: "workspace", content: "1" },
        { path: "b", filename: "AGENTS.md", scope: "workspace", content: "2" },
        { path: "c", filename: "AGENTS.md", scope: "workspace", content: "3" },
      ])
    ).toBeNull();
  });
});
