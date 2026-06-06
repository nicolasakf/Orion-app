import type { ContentsManager } from "@jupyterlab/services";

import type { AgentRule, AgentRuleScope } from "./types";
import { MAX_AGENT_RULE_CONTENT_CHARS } from "./constants";

const RULE_FILENAMES = ["AGENTS.md", "CLAUDE.md"] as const;

function joinPath(...parts: string[]): string {
  return parts
    .map((part) => part.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

function normalizePath(path: string): string {
  return joinPath(path);
}

export class RuleRegistry {
  private contentsManager: ContentsManager | null = null;
  private workspaceRoot = "";
  private rules: AgentRule[] = [];

  /**
   * Provide a ContentsManager and workspace root so rule files can be discovered.
   */
  setContentsManager(manager: ContentsManager | null, workspaceRoot: string): void {
    this.contentsManager = manager;
    this.workspaceRoot = normalizePath(workspaceRoot);
  }

  /** Re-scan root/workspace rule files and keep the latest valid results. */
  async refresh(): Promise<void> {
    this.rules = [];
    if (!this.contentsManager) return;

    if (this.workspaceRoot) {
      const globalRule = await this.loadFirstRule("", "global");
      if (globalRule) this.rules.push(globalRule);
    }

    const workspaceRule = await this.loadFirstRule(this.workspaceRoot, "workspace");
    if (workspaceRule) this.rules.push(workspaceRule);
  }

  /** Return the loaded rules in prompt order. */
  getAll(): AgentRule[] {
    return [...this.rules];
  }

  private async loadFirstRule(basePath: string, scope: AgentRuleScope): Promise<AgentRule | null> {
    for (const filename of RULE_FILENAMES) {
      const path = joinPath(basePath, filename);
      const content = await this.readRuleContent(path);
      if (content !== null) {
        return { path, filename, scope, content };
      }
    }

    return null;
  }

  private async readRuleContent(path: string): Promise<string | null> {
    const contents = this.contentsManager;
    if (!contents) return null;

    try {
      const model = await contents.get(path, { content: true, format: "text" });
      if (model.type !== "file" || typeof model.content !== "string") return null;

      const content = model.content.trim();
      if (!content) return null;
      if (content.length > MAX_AGENT_RULE_CONTENT_CHARS) return null;

      return content;
    } catch {
      return null;
    }
  }
}
