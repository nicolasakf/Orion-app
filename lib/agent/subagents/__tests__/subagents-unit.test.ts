/**
 * Unit tests for notebook-defined Orion subagents.
 *
 * Run with:
 *   npx tsx lib/agent/subagents/__tests__/subagents-unit.test.ts
 */

import { CellType, type NotebookType } from "@/lib/types";
import { filterModelInvocableSkills } from "@/lib/skills/discovery";
import { parseFrontmatter } from "@/lib/skills/parse-frontmatter";
import { isSkillDefinitionPath } from "@/lib/skills/paths";
import { buildSubagentSystemPrompt } from "../prompt";
import { filterDiscoverableSubagents } from "../discovery";
import {
  SubagentRegistry,
  buildSubagentTmpNotebookPath,
  isSubagentNotebookFilename,
  parseSubagentNotebookDefinition,
  subagentNameFromNotebookFilename,
} from "../registry";
import { runSubagent, executeSubagentToolCallPartsForTest } from "../client-runner";
import {
  buildSkillSlashCommands,
  buildSubagentSlashCommands,
} from "@/components/right-sidebar/slash-commands";
import {
  delegateResultTmpNotebookPath,
  delegateResultToDisplayText,
} from "@/components/right-sidebar/delegate-result";
import { resolveSubagentExecutionModel } from "@/components/right-sidebar/subagent-model-resolution";
import type { SubagentDefinition } from "../types";
import type { UIMessage, UIMessageChunk } from "ai";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<void> | void): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, passed: true, duration: Date.now() - start });
  } catch (err) {
    results.push({
      name,
      passed: false,
      error: err instanceof Error ? err.message : String(err),
      duration: Date.now() - start,
    });
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function notebook(
  cells: NotebookType["cells"],
  metadata: NotebookType["metadata"] = {}
): NotebookType {
  return {
    cells,
    metadata,
    nbformat: 4,
    nbformat_minor: 5,
  };
}

function markdown(source: string): NotebookType["cells"][number] {
  return { cell_type: CellType.MARKDOWN, source: [source], metadata: {} };
}

function code(source: string): NotebookType["cells"][number] {
  return {
    cell_type: CellType.CODE,
    source: [source],
    metadata: {},
    execution_count: null,
    outputs: [],
  };
}

function validNotebook(
  label = "Analyst",
  description = "Analyzes delegated tasks.",
  prompt = "Analyze the delegated task."
): NotebookType {
  return notebook([
    markdown(`# ${label}`),
    markdown(description),
    markdown(prompt),
    markdown("## Steps\nInspect the data."),
    code("print('ready')"),
  ]);
}

function rawNotebook(
  label = "Analyst",
  description = "Analyzes delegated tasks.",
  prompt = "Analyze the delegated task."
): string {
  return JSON.stringify(validNotebook(label, description, prompt));
}

class FakeContentsManager {
  constructor(private readonly entries: Record<string, unknown>) {}

  async get(path: string): Promise<unknown> {
    const value = this.entries[path];
    if (!value) throw new Error(`missing ${path}`);
    return value;
  }
}

function subagentDefinition(name = "analyst"): SubagentDefinition {
  const parsed = parseSubagentNotebookDefinition({
    name,
    location: `.agents/subagents/${name}.agent.ipynb`,
    baseDirectory: ".agents/subagents",
    notebook: validNotebook("Analyst", "Analyzes delegated tasks.", "Analyze carefully."),
    source: "user",
  });
  if (!parsed) throw new Error("test definition failed to parse");
  return parsed;
}

function responseFromChunks(chunks: UIMessageChunk[]): Response {
  const encoder = new TextEncoder();
  const body = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("");
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      },
    }),
    { status: 200 }
  );
}

async function main(): Promise<void> {
  console.log("\n--- Notebook validation ---");

  await runTest("detects agent notebook filenames and strips compound suffix", () => {
    assert(isSubagentNotebookFilename("analyst.agent.ipynb"), "agent notebook should match");
    assert(isSubagentNotebookFilename("Analyst.Agent.IPYNB"), "agent notebook check should ignore case");
    assert(!isSubagentNotebookFilename("analyst.ipynb"), "plain notebooks should not match");
    assert(
      subagentNameFromNotebookFilename("data-profiler.agent.ipynb") === "data-profiler",
      "compound suffix should be removed from command id"
    );
  });

  await runTest("parses a valid notebook-defined subagent", () => {
    const parsed = parseSubagentNotebookDefinition({
      name: "data-profiler",
      location: ".agents/subagents/data-profiler.agent.ipynb",
      baseDirectory: ".agents/subagents",
      notebook: validNotebook(
        "Data Profiler",
        "Profiles tabular datasets and reports useful summaries.",
        "Profile the delegated dataset carefully."
      ),
      source: "user",
    });
    assert(parsed?.name === "data-profiler", "name should come from filename stem");
    assert(parsed?.label === "Data Profiler", "label should come from first H1");
    assert(
      parsed?.description === "Profiles tabular datasets and reports useful summaries.",
      "second cell is description"
    );
    assert(parsed?.systemPrompt === "Profile the delegated dataset carefully.", "third cell is system prompt");
  });

  await runTest("parses default subagent options from missing notebook metadata", () => {
    const parsed = parseSubagentNotebookDefinition({
      name: "analyst",
      location: ".agents/subagents/analyst.agent.ipynb",
      baseDirectory: ".agents/subagents",
      notebook: validNotebook(),
      source: "user",
    });

    assert(
      parsed?.options?.disableModelInvocation === false,
      "disableModelInvocation should default to false"
    );
    assert(parsed?.options?.model === undefined, "model should default to inherited parent model");
  });

  await runTest("parses model and disable-model-invocation options from notebook metadata", () => {
    const parsed = parseSubagentNotebookDefinition({
      name: "web-search",
      location: ".agents/subagents/web-search.agent.ipynb",
      baseDirectory: ".agents/subagents",
      notebook: notebook(
        [
          markdown("# Web Search"),
          markdown("Searches the web for delegated questions."),
          markdown("Search carefully."),
        ],
        {
          orion: {
            subagent: {
              model: " gemini-3-flash-preview ",
              "disable-model-invocation": true,
              ignored: "value",
            },
          },
        }
      ),
      source: "user",
    });

    assert(parsed?.options?.model === "gemini-3-flash-preview", "model should be trimmed");
    assert(
      parsed?.options?.disableModelInvocation === true,
      "disable-model-invocation should parse true"
    );
  });

  await runTest("malformed subagent options fall back to defaults", () => {
    const parsed = parseSubagentNotebookDefinition({
      name: "analyst",
      location: ".agents/subagents/analyst.agent.ipynb",
      baseDirectory: ".agents/subagents",
      notebook: notebook(
        [
          markdown("# Analyst"),
          markdown("Analyzes delegated tasks."),
          markdown("Analyze carefully."),
        ],
        {
          orion: {
            subagent: {
              model: "",
              "disable-model-invocation": "true",
            },
          },
        }
      ),
      source: "user",
    });

    assert(parsed?.options?.model === undefined, "blank model should be ignored");
    assert(
      parsed?.options?.disableModelInvocation === false,
      "non-boolean disable-model-invocation should default false"
    );
  });

  await runTest("strips description and system prompt markdown headings", () => {
    const parsed = parseSubagentNotebookDefinition({
      name: "data-profiler",
      location: ".agents/subagents/data-profiler.agent.ipynb",
      baseDirectory: ".agents/subagents",
      notebook: notebook([
        markdown("# Data Profiler"),
        markdown("## Description\n\nProfiles tabular datasets."),
        markdown("# System Prompt\n\nProfile carefully."),
        code("print('ready')"),
      ]),
      source: "user",
    });
    assert(parsed?.description === "Profiles tabular datasets.", "description heading should be stripped");
    assert(parsed?.systemPrompt === "Profile carefully.", "system prompt heading should be stripped");
  });

  await runTest("rejects invalid filename stems", () => {
    const parsed = parseSubagentNotebookDefinition({
      name: "Data_Profiler",
      location: ".agents/subagents/Data_Profiler.agent.ipynb",
      baseDirectory: ".agents/subagents",
      notebook: validNotebook(),
      source: "user",
    });
    assert(parsed === null, "invalid names should be skipped");
  });

  await runTest("rejects missing markdown H1", () => {
    const parsed = parseSubagentNotebookDefinition({
      name: "analyst",
      location: ".agents/subagents/analyst.agent.ipynb",
      baseDirectory: ".agents/subagents",
      notebook: notebook([markdown("Analyst"), markdown("Description"), markdown("Prompt")]),
      source: "user",
    });
    assert(parsed === null, "first cell must begin with H1");
  });

  await runTest("rejects missing description or system prompt cells", () => {
    const missingDescription = parseSubagentNotebookDefinition({
      name: "analyst",
      location: ".agents/subagents/analyst.agent.ipynb",
      baseDirectory: ".agents/subagents",
      notebook: notebook([markdown("# Analyst"), code("print('not markdown')"), markdown("Prompt")]),
      source: "user",
    });
    const missingSystemPrompt = parseSubagentNotebookDefinition({
      name: "analyst",
      location: ".agents/subagents/analyst.agent.ipynb",
      baseDirectory: ".agents/subagents",
      notebook: notebook([markdown("# Analyst"), markdown("Description")]),
      source: "user",
    });
    assert(missingDescription === null, "second cell must be markdown description");
    assert(missingSystemPrompt === null, "third cell must be markdown system prompt");
  });

  await runTest("rejects raw body cells", () => {
    const parsed = parseSubagentNotebookDefinition({
      name: "analyst",
      location: ".agents/subagents/analyst.agent.ipynb",
      baseDirectory: ".agents/subagents",
      notebook: notebook([
        markdown("# Analyst"),
        markdown("Description"),
        markdown("Prompt"),
        { cell_type: CellType.RAW, source: ["raw"], metadata: {} },
      ]),
      source: "user",
    });
    assert(parsed === null, "body cells must be markdown or code");
  });

  console.log("\n--- Discovery ---");

  await runTest("loads user subagents and project subagents override by filename", async () => {
    const registry = new SubagentRegistry();
    registry.setContentsManager(
      new FakeContentsManager({
        ".agents/subagents": {
          type: "directory",
          content: [
            { name: "analyst.agent.ipynb", type: "notebook", path: ".agents/subagents/analyst.agent.ipynb" },
            { name: "draft.ipynb", type: "notebook", path: ".agents/subagents/draft.ipynb" },
            { name: "tmp", type: "directory", path: ".agents/subagents/tmp" },
          ],
        },
        ".agents/subagents/analyst.agent.ipynb": {
          type: "notebook",
          content: rawNotebook("User Analyst", "User description.", "User prompt."),
        },
        ".agents/subagents/draft.ipynb": {
          type: "notebook",
          content: rawNotebook("Draft Analyst", "Draft description.", "Draft prompt."),
        },
        "project/.agents/subagents": {
          type: "directory",
          content: [
            { name: "analyst.agent.ipynb", type: "notebook", path: "project/.agents/subagents/analyst.agent.ipynb" },
          ],
        },
        "project/.agents/subagents/analyst.agent.ipynb": {
          type: "notebook",
          content: rawNotebook("Project Analyst", "Project description.", "Project prompt."),
        },
      }) as never,
      "project"
    );

    await registry.refresh();
    const all = registry.getAll();
    assert(all.length === 1, `expected one overridden subagent, got ${all.length}`);
    assert(all[0].label === "Project Analyst", "project subagent should override user subagent");
    assert(all[0].source === "project", "source should be project");
  });

  await runTest("user .orion/subagents overrides user .agents/subagents for same stem", async () => {
    const registry = new SubagentRegistry();
    registry.setContentsManager(
      new FakeContentsManager({
        ".agents/subagents": {
          type: "directory",
          content: [
            { name: "analyst.agent.ipynb", type: "notebook", path: ".agents/subagents/analyst.agent.ipynb" },
          ],
        },
        ".agents/subagents/analyst.agent.ipynb": {
          type: "notebook",
          content: rawNotebook("Agents Analyst", "Agents description.", "Agents prompt."),
        },
        ".orion/subagents": {
          type: "directory",
          content: [
            { name: "analyst.agent.ipynb", type: "notebook", path: ".orion/subagents/analyst.agent.ipynb" },
          ],
        },
        ".orion/subagents/analyst.agent.ipynb": {
          type: "notebook",
          content: rawNotebook("Orion Analyst", "Orion description.", "Orion prompt."),
        },
      }) as never,
      ""
    );

    await registry.refresh();
    const all = registry.getAll();
    assert(all.length === 1, `expected one subagent, got ${all.length}`);
    assert(all[0].label === "Orion Analyst", "user .orion should override user .agents");
    assert(all[0].baseDirectory === ".orion/subagents", "definition should record .orion base path");
    assert(all[0].source === "user", "source should be user");
  });

  await runTest("project .orion/subagents overrides project .agents/subagents for same stem", async () => {
    const registry = new SubagentRegistry();
    registry.setContentsManager(
      new FakeContentsManager({
        "proj/.agents/subagents": {
          type: "directory",
          content: [
            { name: "analyst.agent.ipynb", type: "notebook", path: "proj/.agents/subagents/analyst.agent.ipynb" },
          ],
        },
        "proj/.agents/subagents/analyst.agent.ipynb": {
          type: "notebook",
          content: rawNotebook("Project Agents", "Pa description.", "Pa prompt."),
        },
        "proj/.orion/subagents": {
          type: "directory",
          content: [
            { name: "analyst.agent.ipynb", type: "notebook", path: "proj/.orion/subagents/analyst.agent.ipynb" },
          ],
        },
        "proj/.orion/subagents/analyst.agent.ipynb": {
          type: "notebook",
          content: rawNotebook("Project Orion", "Po description.", "Po prompt."),
        },
      }) as never,
      "proj"
    );

    await registry.refresh();
    const all = registry.getAll();
    assert(all.length === 1, `expected one subagent, got ${all.length}`);
    assert(all[0].label === "Project Orion", "project .orion should override project .agents");
    assert(all[0].baseDirectory === "proj/.orion/subagents", "definition should record project .orion base path");
  });

  await runTest("project .orion/subagents wins over user-level definitions", async () => {
    const registry = new SubagentRegistry();
    registry.setContentsManager(
      new FakeContentsManager({
        ".agents/subagents": {
          type: "directory",
          content: [
            { name: "analyst.agent.ipynb", type: "notebook", path: ".agents/subagents/analyst.agent.ipynb" },
          ],
        },
        ".agents/subagents/analyst.agent.ipynb": {
          type: "notebook",
          content: rawNotebook("User Agents", "Ua.", "Ua."),
        },
        ".orion/subagents": {
          type: "directory",
          content: [
            { name: "analyst.agent.ipynb", type: "notebook", path: ".orion/subagents/analyst.agent.ipynb" },
          ],
        },
        ".orion/subagents/analyst.agent.ipynb": {
          type: "notebook",
          content: rawNotebook("User Orion", "Uo.", "Uo."),
        },
        "repo/.agents/subagents": {
          type: "directory",
          content: [
            { name: "analyst.agent.ipynb", type: "notebook", path: "repo/.agents/subagents/analyst.agent.ipynb" },
          ],
        },
        "repo/.agents/subagents/analyst.agent.ipynb": {
          type: "notebook",
          content: rawNotebook("Proj Agents", "Pa.", "Pa."),
        },
        "repo/.orion/subagents": {
          type: "directory",
          content: [
            { name: "analyst.agent.ipynb", type: "notebook", path: "repo/.orion/subagents/analyst.agent.ipynb" },
          ],
        },
        "repo/.orion/subagents/analyst.agent.ipynb": {
          type: "notebook",
          content: rawNotebook("Proj Orion", "Po.", "Po."),
        },
      }) as never,
      "repo"
    );

    await registry.refresh();
    const all = registry.getAll();
    assert(all.length === 1, `expected one subagent, got ${all.length}`);
    assert(all[0].label === "Proj Orion", "project .orion should win overall");
    assert(all[0].source === "project", "source should be project");
  });

  await runTest("builds tmp notebook paths under .orion subagent tmp directory", () => {
    const path = buildSubagentTmpNotebookPath({
      baseDirectory: "project/.orion/subagents",
      name: "analyst",
      runId: "run:123",
      date: new Date("2026-05-05T10:11:12.123Z"),
    });
    assert(
      path === "project/.orion/subagents/tmp/analyst/2026-05-05T10-11-12-123Z-run123.ipynb",
      `unexpected tmp path: ${path}`
    );
  });

  await runTest("builds tmp notebook paths under .agents subagent tmp directory", () => {
    const path = buildSubagentTmpNotebookPath({
      baseDirectory: "project/.agents/subagents",
      name: "analyst",
      runId: "run:123",
      date: new Date("2026-05-05T10:11:12.123Z"),
    });
    assert(
      path === "project/.agents/subagents/tmp/analyst/2026-05-05T10-11-12-123Z-run123.ipynb",
      `unexpected tmp path: ${path}`
    );
  });

  console.log("\n--- Prompt and slash commands ---");

  await runTest("subagent system prompt includes tmp notebook connection instruction", () => {
    const prompt = buildSubagentSystemPrompt({
      subagent: {
        name: "analyst",
        label: "Analyst",
        originalNotebookPath: ".agents/subagents/analyst.agent.ipynb",
        tmpNotebookPath: ".agents/subagents/tmp/analyst/run.ipynb",
        systemPrompt: "Analyze carefully.",
      },
    });
    assert(prompt.includes('notebookPath: ".agents/subagents/tmp/analyst/run.ipynb"'), "tmp path should be in use_notebook instruction");
    assert(prompt.includes("Analyze carefully."), "system prompt should be included");
    assert(!prompt.includes("print('x')"), "notebook body cells should not be included in the prompt");
  });

  await runTest("buildSubagentSlashCommands creates subagent category commands", () => {
    const commands = buildSubagentSlashCommands([
      {
        name: "analyst",
        label: "Analyst",
        description: "Analyzes things.",
        options: { disableModelInvocation: true },
      },
    ]);
    assert(commands[0].name === "subagent:analyst", "command name should be prefixed");
    assert(commands[0].label === "/analyst", "slash label should use filename stem");
    assert(commands[0].category === "subagent", "category should be subagent");
  });

  await runTest("hidden subagents are omitted from parent prompt discovery", () => {
    const discoverable = filterDiscoverableSubagents([
      {
        name: "visible-agent",
        label: "Visible Agent",
        description: "Visible description.",
        options: { disableModelInvocation: false },
      },
      {
        name: "hidden-agent",
        label: "Hidden Agent",
        description: "Hidden description.",
        options: { disableModelInvocation: true },
      },
    ]);

    assert(discoverable.length === 1, `expected one discoverable subagent, got ${discoverable.length}`);
    assert(discoverable[0].name === "visible-agent", "discoverable subagent should remain");
  });

  await runTest("skill frontmatter disables model invocation without blocking slash availability", () => {
    const parsed = parseFrontmatter(`---
name: private-skill
description: Runs only when selected explicitly.
disable-model-invocation: true
---

# Private skill`);
    assert(parsed.disableModelInvocation === true, "skill frontmatter should parse disable-model-invocation");

    const modelInvocableSkills = filterModelInvocableSkills([
      { name: "visible-skill", description: "Visible skill." },
      {
        name: "private-skill",
        description: "Runs only when selected explicitly.",
        disableModelInvocation: true,
      },
    ]);
    const commands = buildSkillSlashCommands([
      { name: "private-skill", description: "Runs only when selected explicitly." },
    ]);

    assert(modelInvocableSkills.length === 1, "only one skill should remain model-invocable");
    assert(modelInvocableSkills[0].name === "visible-skill", "model-invocable skill should remain");
    assert(commands[0].label === "/private-skill", "disabled skill should remain slash-invocable");
  });

  await runTest("skill definition paths are detected for registry refresh", () => {
    assert(isSkillDefinitionPath(".orion/skills/private-skill/SKILL.md"), "orion skill path should match");
    assert(isSkillDefinitionPath(".agents/skills/private-skill/SKILL.md"), ".agents skill path should match");
    assert(isSkillDefinitionPath("project/.agents/skills/private-skill/SKILL.md"), "workspace skill path should match");
    assert(!isSkillDefinitionPath(".orion/skills/private-skill/reference.md"), "companion files should not match");
    assert(!isSkillDefinitionPath(".orion/skills/SKILL.md"), "skills directory root should not match");
  });

  await runTest("delegate result display handles strings and structured outputs", () => {
    const structured = {
      summary: "Report ready.",
      tmpNotebookPath: ".agents/subagents/tmp/analyst/run.ipynb",
      subagent: "analyst",
      reconnected: false,
    };

    assert(
      delegateResultToDisplayText("Legacy summary.") === "Legacy summary.",
      "legacy string output should display directly"
    );
    assert(
      delegateResultToDisplayText(structured) === "Report ready.",
      "structured output should display only the summary"
    );
    assert(
      delegateResultTmpNotebookPath(structured) === ".agents/subagents/tmp/analyst/run.ipynb",
      "structured output should expose tmp notebook path"
    );
  });

  console.log("\n--- Model options ---");

  await runTest("resolves configured subagent model over parent chat model", () => {
    const resolution = resolveSubagentExecutionModel({
      subagentName: "web-search",
      configuredModelId: "gemini-3-flash-preview",
      selectedModelId: "claude-sonnet-4-5",
      parentModel: {
        value: "claude-sonnet-4-5",
        label: "Claude Sonnet",
        provider: "anthropic",
      },
      modelsWithAccess: [
        {
          value: "gemini-3-flash-preview",
          label: "Gemini 3 Flash",
          provider: "google",
          isAccessible: true,
        },
      ],
      modelSettingsMap: {
        "gemini-3-flash-preview": { custom: true },
      },
    });

    assert(resolution.ok === true, "configured model should resolve");
    if (!resolution.ok) return;
    assert(resolution.modelId === "gemini-3-flash-preview", "configured model should win");
    assert(resolution.providerId === "google", "provider should come from model catalog");
    assert(
      resolution.modelSettings?.custom === true,
      "model settings should come from the configured model"
    );
  });

  await runTest("configured unavailable subagent model produces clear error", () => {
    const resolution = resolveSubagentExecutionModel({
      subagentName: "web-search",
      configuredModelId: "missing-model",
      selectedModelId: "claude-sonnet-4-5",
      parentModel: {
        value: "claude-sonnet-4-5",
        label: "Claude Sonnet",
        provider: "anthropic",
      },
      modelsWithAccess: [],
      modelSettingsMap: {},
    });

    assert(resolution.ok === false, "missing configured model should fail");
    if (resolution.ok) return;
    assert(
      resolution.errorText.includes("missing-model") && resolution.errorText.includes("not available"),
      `unexpected error: ${resolution.errorText}`
    );
  });

  console.log("\n--- Runner guards ---");

  await runTest("runSubagent throws AbortError when signal is pre-aborted", async () => {
    const abortController = new AbortController();
    abortController.abort();

    let errorName = "";
    try {
      await runSubagent({
        subagentType: "analyst",
        availableSubagents: [subagentDefinition()],
        description: "test",
        modelId: "claude-sonnet-4-5",
        providerId: "anthropic",
        subagentDevLogInstance: 1,
        executeToolCall: async () => "ok",
        createTmpNotebookCopy: async () => ".agents/subagents/tmp/analyst/run.ipynb",
        abortSignal: abortController.signal,
      });
    } catch (err) {
      errorName = err instanceof Error ? err.name : "";
    }

    assert(errorName === "AbortError", `Expected AbortError but got: ${errorName}`);
  });

  await runTest("runSubagent rejects unknown subagent before creating tmp copy", async () => {
    let copyCalled = false;
    let message = "";
    try {
      await runSubagent({
        subagentType: "missing",
        availableSubagents: [subagentDefinition()],
        description: "test",
        modelId: "claude-sonnet-4-5",
        providerId: "anthropic",
        subagentDevLogInstance: 1,
        executeToolCall: async () => "ok",
        createTmpNotebookCopy: async () => {
          copyCalled = true;
          return ".agents/subagents/tmp/missing/run.ipynb";
        },
      });
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    assert(!copyCalled, "tmp copy should not be created for unknown subagent");
    assert(message.includes("was not found"), `unexpected error: ${message}`);
  });

  await runTest("recursive delegate tool calls are blocked", async () => {
    const results = await executeSubagentToolCallPartsForTest(
      [
        {
          type: "tool-delegate",
          toolCallId: "call-1",
          state: "input-available",
          input: { subagent: "analyst", description: "nested" },
        },
      ],
      {
        subagentType: "analyst",
        availableSubagents: [subagentDefinition()],
        description: "test",
        modelId: "claude-sonnet-4-5",
        providerId: "anthropic",
        subagentDevLogInstance: 1,
        executeToolCall: async () => {
          throw new Error("delegate should not execute");
        },
        createTmpNotebookCopy: async () => ".agents/subagents/tmp/analyst/run.ipynb",
      }
    );
    assert(String(results.get("call-1")).includes("[BLOCKED]"), "delegate should be blocked");
  });

  await runTest("subagent tool execution reports timing lifecycle callbacks", async () => {
    const events: string[] = [];
    const results = await executeSubagentToolCallPartsForTest(
      [
        {
          type: "tool-read_file",
          toolCallId: "call-read",
          state: "input-available",
          input: { path: "notes.md" },
        },
      ],
      {
        subagentType: "analyst",
        availableSubagents: [subagentDefinition()],
        description: "test",
        modelId: "claude-sonnet-4-5",
        providerId: "anthropic",
        subagentDevLogInstance: 1,
        executeToolCall: async () => "contents",
        onToolStart: (toolCallId) => events.push(`start:${toolCallId}`),
        onToolEnd: (toolCallId) => events.push(`end:${toolCallId}`),
        createTmpNotebookCopy: async () => ".agents/subagents/tmp/analyst/run.ipynb",
      }
    );

    assert(results.get("call-read") === "contents", "tool result should be preserved");
    assert(
      events.join(",") === "start:call-read,end:call-read",
      `unexpected timing events: ${events.join(",")}`
    );
  });

  await runTest("runSubagent reports transcript snapshots through completion", async () => {
    const originalFetch = globalThis.fetch;
    const snapshots: UIMessage[][] = [];
    const requests: unknown[] = [];
    const responses = [
      responseFromChunks([
        { type: "start", messageId: "assistant-1" },
        {
          type: "tool-input-available",
          toolCallId: "call-read",
          toolName: "read_file",
          input: { path: "notes.md" },
        },
        { type: "finish", finishReason: "tool-calls" },
      ]),
      responseFromChunks([
        { type: "start", messageId: "assistant-2" },
        { type: "text-start", id: "text-1" },
        { type: "text-delta", id: "text-1", delta: "Done." },
        { type: "text-end", id: "text-1" },
        { type: "finish", finishReason: "stop" },
      ]),
    ];

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(init?.body ? JSON.parse(String(init.body)) : null);
      const response = responses.shift();
      if (!response) throw new Error("unexpected fetch");
      return response;
    }) as typeof fetch;

    try {
      const result = await runSubagent({
        subagentType: "analyst",
        availableSubagents: [subagentDefinition()],
        description: "inspect notes",
        modelId: "claude-sonnet-4-5",
        providerId: "anthropic",
        subagentDevLogInstance: 1,
        executeToolCall: async (toolName) => `result from ${toolName}`,
        createTmpNotebookCopy: async () => ".agents/subagents/tmp/analyst/run.ipynb",
        onMessagesChange: (messages) => snapshots.push(messages),
      });

      assert(result.summary === "Done.", `unexpected summary: ${result.summary}`);
      assert(snapshots[0]?.[0]?.role === "user", "first snapshot should include the user prompt");
      assert(
        snapshots.some((messages) =>
          messages.some((message) =>
            message.parts.some(
              (part) =>
                part.type === "tool-read_file" &&
                "state" in part &&
                part.state === "input-available"
            )
          )
        ),
        "transcript should include assistant tool input"
      );
      assert(
        snapshots.some((messages) =>
          messages.some((message) =>
            message.parts.some(
              (part) =>
                part.type === "tool-read_file" &&
                "state" in part &&
                part.state === "output-available" &&
                "output" in part &&
                part.output === "result from read_file"
            )
          )
        ),
        "transcript should include tool output"
      );
      assert(
        snapshots.at(-1)?.some((message) =>
          message.parts.some((part) => part.type === "text" && part.text === "Done.")
        ) === true,
        "final transcript should include assistant text"
      );
      assert(requests.length === 2, `expected two subagent requests, got ${requests.length}`);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await runTest("runSubagent request body uses caller-resolved model and provider", async () => {
    const originalFetch = globalThis.fetch;
    const requests: Array<Record<string, unknown>> = [];

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {});
      return responseFromChunks([
        { type: "start", messageId: "assistant-model" },
        { type: "text-start", id: "text-model" },
        { type: "text-delta", id: "text-model", delta: "Model-specific done." },
        { type: "text-end", id: "text-model" },
        { type: "finish", finishReason: "stop" },
      ]);
    }) as typeof fetch;

    try {
      const resolution = resolveSubagentExecutionModel({
        subagentName: "web-search",
        configuredModelId: "gemini-3-flash-preview",
        selectedModelId: "claude-sonnet-4-5",
        parentModel: {
          value: "claude-sonnet-4-5",
          label: "Claude Sonnet",
          provider: "anthropic",
        },
        modelsWithAccess: [
          {
            value: "gemini-3-flash-preview",
            label: "Gemini 3 Flash",
            provider: "google",
            isAccessible: true,
          },
        ],
        modelSettingsMap: {},
      });
      assert(resolution.ok === true, "configured model should resolve before run");
      if (!resolution.ok) return;

      await runSubagent({
        subagentType: "web-search",
        availableSubagents: [subagentDefinition("web-search")],
        description: "search",
        modelId: resolution.modelId,
        providerId: resolution.providerId,
        subagentDevLogInstance: 1,
        executeToolCall: async () => "ok",
        createTmpNotebookCopy: async () => ".agents/subagents/tmp/web-search/run.ipynb",
      });

      assert(requests[0].model === "gemini-3-flash-preview", "request should use configured model");
      assert(requests[0].provider === "google", "request should use configured provider");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await runTest("runSubagent reconnects to an existing tmp notebook and transcript", async () => {
    const originalFetch = globalThis.fetch;
    const requests: Array<Record<string, unknown>> = [];
    const snapshots: UIMessage[][] = [];
    let copyCalled = false;
    const priorMessages: UIMessage[] = [
      {
        id: "prior-user",
        role: "user",
        parts: [{ type: "text", text: "original task" }],
      },
      {
        id: "prior-assistant",
        role: "assistant",
        parts: [{ type: "text", text: "Original report." }],
      },
    ];

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {});
      return responseFromChunks([
        { type: "start", messageId: "assistant-followup" },
        { type: "text-start", id: "text-followup" },
        { type: "text-delta", id: "text-followup", delta: "Follow-up done." },
        { type: "text-end", id: "text-followup" },
        { type: "finish", finishReason: "stop" },
      ]);
    }) as typeof fetch;

    try {
      const result = await runSubagent({
        subagentType: "analyst",
        availableSubagents: [subagentDefinition()],
        description: "answer a follow-up",
        modelId: "claude-sonnet-4-5",
        providerId: "anthropic",
        subagentDevLogInstance: 3,
        reconnectTmpNotebookPath: ".agents/subagents/tmp/analyst/existing.ipynb",
        reconnectMessages: priorMessages,
        executeToolCall: async () => "ok",
        createTmpNotebookCopy: async () => {
          copyCalled = true;
          return ".agents/subagents/tmp/analyst/new.ipynb";
        },
        onMessagesChange: (messages) => snapshots.push(messages),
      });

      assert(!copyCalled, "reconnect should not create a new tmp notebook");
      assert(result.reconnected === true, "result should mark reconnect");
      assert(
        result.tmpNotebookPath === ".agents/subagents/tmp/analyst/existing.ipynb",
        `unexpected tmp path: ${result.tmpNotebookPath}`
      );
      assert(result.summary === "Follow-up done.", `unexpected summary: ${result.summary}`);
      assert(requests.length === 1, `expected one subagent request, got ${requests.length}`);

      const request = requests[0];
      const requestMessages = request.messages as Array<{ role: string; parts: Array<{ type: string; text?: string }> }>;
      const promptPayload = request.subagentPrompt as { tmpNotebookPath?: string };
      assert(
        promptPayload.tmpNotebookPath === ".agents/subagents/tmp/analyst/existing.ipynb",
        "subagent prompt should reuse the existing tmp notebook"
      );
      assert(requestMessages.length === 3, `expected prior transcript plus follow-up, got ${requestMessages.length}`);
      assert(
        requestMessages[2].parts[0].text === "answer a follow-up",
        "follow-up prompt should be appended after prior messages"
      );
      assert(snapshots[0].length === 3, "first snapshot should include prior transcript plus follow-up");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log("\n=== Subagent Unit Test Results ===");
  for (const result of results) {
    const icon = result.passed ? "✓" : "✗";
    console.log(`  ${icon} ${result.name} (${result.duration}ms)`);
    if (!result.passed && result.error) {
      console.log(`      ERROR: ${result.error}`);
    }
  }

  console.log(`\n  Passed: ${passed}/${results.length}`);

  if (failed > 0) {
    console.error(`\n  ${failed} test(s) FAILED.`);
    process.exit(1);
  }

  console.log("\n  All tests passed.");
}

main().catch((error) => {
  console.error("Test suite failed:", error);
  process.exit(1);
});
