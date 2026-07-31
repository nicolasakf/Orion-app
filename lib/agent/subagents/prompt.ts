import { buildRulesPromptSection, type AgentRule } from "@/lib/agent/rules";
import { buildRequiredSkillsPromptSection } from "@/lib/agent/implicit-skills";
import { isAbsoluteAgentPath, toAgentAbsolutePath } from "@/lib/agent/path-resolver";
import { PARALLEL_TOOL_CALLS_PROMPT_SECTION } from "@/lib/agent/tool-execution-policy";
import type { SubagentPromptPayload } from "./types";

export function buildSubagentSystemPrompt(options: {
  subagent: SubagentPromptPayload;
  envContext?: string;
  agentRules?: AgentRule[];
  forcedSkillNames?: string[];
  rootDirectory?: string;
}): string {
  const { subagent, envContext, agentRules, forcedSkillNames, rootDirectory } = options;
  const toPromptPath = (path: string): string =>
    isAbsoluteAgentPath(path) ? path : toAgentAbsolutePath(path, { rootDirectory }) ?? path;
  const originalNotebookPath = toPromptPath(subagent.originalNotebookPath);
  const tmpNotebookPath = toPromptPath(subagent.tmpNotebookPath);
  const tripleBacktick = "```";
  const fencedSystemPrompt = `${tripleBacktick}markdown\n${subagent.systemPrompt}\n${tripleBacktick}`;
  const rulesSection = buildRulesPromptSection(agentRules);
  const sections = [
    `You are a notebook-defined Orion sub-agent named "${subagent.label}" (\`${subagent.name}\`). You were spawned by a parent agent to complete one focused task and return a concise result.

## Sub-agent Notebook

- Original reusable definition: \`${originalNotebookPath}\` (reference only)
- Writable temporary run copy: \`${tmpNotebookPath}\`

**CRITICAL — never touch the original notebook.** Do not pass \`${originalNotebookPath}\` to any tool (including \`use_notebook\`, file or notebook editors, or shell) to open, connect, run cells, edit, save, move, or delete. That path is shown only so you know which definition you are running; all notebook work must happen exclusively in the temporary copy above.

## Original Notebook Structure

You **do not need to read or run the first three cells** after connecting to the notebook. Your label and introductory role here reflect cell 1; cell 2 is parent-facing (slash UI and parent prompts only); cell 3 is duplicated verbatim under **Your Sub-agent System Prompt** below, which you should treat as authoritative. Spend your notebook tooling on cells 4 and onward.

- Cell 1: markdown H1 label for the sub-agent.
- Cell 2: markdown description used in parent-agent prompts and slash command UI.
- Cell 3: markdown system prompt for the sub-agent (same text as **Your Sub-agent System Prompt** below).
- Cell 4 and later: runnable markdown and code body cells that define the workflow.

## Your Sub-agent System Prompt

The content below defines your **task and goals** for this sub-agent role (notebook cell 3). Use it to decide what to do and how to judge when the work is complete.

${fencedSystemPrompt}`,
    PARALLEL_TOOL_CALLS_PROMPT_SECTION,
    rulesSection,
    buildRequiredSkillsPromptSection(forcedSkillNames ?? []),
    `## Runtime Instructions

- First, call \`use_notebook\` with \`notebookPath: "${tmpNotebookPath}"\`, \`notebookName: "${subagent.name}"\`, and \`mode: "connect"\`.
- Inspect, run, and edit cells in the temporary notebook as needed to complete the delegated task.
- Do not call \`delegate\`; recursive sub-agent spawning is blocked.
- Your final response is the only result the parent agent will see. Make it concise, complete, and include relevant notebook paths, outputs, files, links, caveats, etc.

## Execution Visibility

Prefer durable notebook work:

- Prefer putting substantive analysis code into the temporary notebook with \`insert_cell\` or \`overwrite_cell_source\`.
- Prefer running notebook code with \`execute_cell\` so the code and outputs remain visible in the sub-agent report notebook.

Avoid ephemeral execution when you can:

- Avoid \`execute_code\` for substantive analysis that should appear in the report notebook.
- Avoid \`bash\` for data analysis or code execution that could be represented in notebook cells.
- Prefer reserving \`execute_code\` for tiny inspection probes, and summarize the probe in your final response.
- Prefer reserving \`bash\` for filesystem, environment, or system tasks that cannot reasonably be done in notebook cells.`,
    envContext,
  ].filter((section): section is string => typeof section === "string" && section.trim().length > 0);

  return sections.join("\n\n");
}
