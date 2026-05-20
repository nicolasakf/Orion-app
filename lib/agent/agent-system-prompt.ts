/**
 * Orion Agent System Prompt
 *
 * Defines the data scientist persona, decision-making guidelines, and
 * tool usage patterns for the Orion coding agent.
 */

import promptContent from "./prompts/agent-system-prompt.md";
import promptContentAsk from "./prompts/agent-system-prompt-ask.md";
import promptContentEdit from "./prompts/agent-system-prompt-edit.md";
import type { JupyterServerInfo } from "@/lib/kernel/kernel-service";
import { formatPlatformOsForPrompt, type PlatformOS } from "@/lib/utils";
import { filterDiscoverableSubagents } from "@/lib/agent/subagents/discovery";
import { filterModelInvocableSkills } from "@/lib/skills/discovery";
export { buildSubagentSystemPrompt } from "@/lib/agent/subagents";

/** Non-placeholder values only — omit fields we could not determine. */
function isKnownEnvString(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0 && value !== "unknown";
}

/**
 * Builds markdown lines for ## Jupyter Server Environment — only includes facts
 * we know (no "unknown" placeholders).
 */
function buildJupyterServerEnvironmentLines(options: {
  serverInfo?: JupyterServerInfo | null;
  /** Client-determined: Jupyter URL is loopback — OS may match browser when server OS unknown */
  jupyterServerIsLocal?: boolean;
  clientPlatformOs?: PlatformOS;
}): string[] {
  const { serverInfo, jupyterServerIsLocal, clientPlatformOs } = options;
  const lines: string[] = [];

  if (serverInfo && isKnownEnvString(serverInfo.os)) {
    const osDisplay =
      serverInfo.os === "nt"
        ? "Windows"
        : serverInfo.os === "posix"
          ? "Unix/Linux/macOS"
          : serverInfo.os;
    const platformPart = isKnownEnvString(serverInfo.platform) ? ` (\`${serverInfo.platform}\`)` : "";
    lines.push(`- **OS**: ${osDisplay}${platformPart}`);
  } else if (jupyterServerIsLocal && clientPlatformOs) {
    const label = formatPlatformOsForPrompt(clientPlatformOs);
    if (label) {
      lines.push(
        `- **OS**: ${label} (Jupyter server uses a loopback URL; same machine as the user's browser)`
      );
    }
  }

  if (serverInfo && isKnownEnvString(serverInfo.pythonVersion)) {
    lines.push(`- **Python Version**: ${serverInfo.pythonVersion}`);
  }

  if (serverInfo && isKnownEnvString(serverInfo.jupyterVersion)) {
    lines.push(`- **Jupyter Server Version**: ${serverInfo.jupyterVersion}`);
  }

  return lines;
}

/**
 * Shared environment and editor context appended to both the main agent prompt
 * and sub-agent prompts (excluding delegation and skills sections).
 */
export function buildAgentEnvironmentContextPrompt(options: {
  serverInfo?: JupyterServerInfo | null;
  /** Client sends true when the Jupyter connection URL is loopback */
  jupyterServerIsLocal?: boolean;
  /** Browser-detected OS; used for OS line when local server and server OS is unknown */
  clientPlatformOs?: PlatformOS;
  workspaceDirectory?: string;
  notebookPath?: string;
  activeFilePath?: string;
}): string {
  const {
    serverInfo,
    jupyterServerIsLocal,
    clientPlatformOs,
    workspaceDirectory,
    notebookPath,
    activeFilePath,
  } = options;

  // XOR: if notebook is open, do not treat activeFilePath as the editor file
  const filePath = notebookPath ? undefined : activeFilePath;

  const sections: string[] = [];

  const jupyterEnvLines = buildJupyterServerEnvironmentLines({
    serverInfo,
    jupyterServerIsLocal,
    clientPlatformOs,
  });
  if (jupyterEnvLines.length > 0) {
    sections.push(`## Jupyter Server Environment\n\n${jupyterEnvLines.join("\n")}`);
  }

  if (workspaceDirectory) {
    sections.push(`## Workspace Directory

Your workspace directory is: \`${workspaceDirectory}\`
- When creating notebooks with \`use_notebook\`, always prefix the notebookPath with this directory (e.g. \`${workspaceDirectory}/new_notebook.ipynb\`).
- Use \`bash\` for shell commands. Pass \`terminalName: ""\` to create a fresh chat-scoped terminal. When you want that fresh terminal to start in the workspace, also pass \`cwd: "${workspaceDirectory}"\`. Reuse is explicit: only pass a non-empty \`terminalName\` when copying the exact value returned by \`bash\` or \`await_command\`; never invent one or assume an unnamed terminal will be reused.
- For long or background commands, use \`await_command\` with the same \`terminalName\` instead of re-running \`bash\`.
- All file paths you reference should be relative to the Jupyter root, starting with this directory.`);
  }

  if (notebookPath) {
    const directory = notebookPath.includes("/")
      ? notebookPath.substring(0, notebookPath.lastIndexOf("/"))
      : workspaceDirectory ?? "";

    sections.push(`## Open Notebook

The user currently has a notebook open in the editor at path: \`${notebookPath}\`
- To work on this notebook, call \`use_notebook\` with notebookName=<notebook-filename>, notebookPath="${notebookPath}", and mode="connect".
- If the user asks to create a **new** notebook, call \`use_notebook\` with a new notebookName, a new notebookPath (e.g. \`${directory}/<descriptive_name>.ipynb\`), and mode="create". Do NOT connect to the existing notebook when the user wants a new one.
- Determine whether to connect or create based on the user's request.`);
  }

  if (filePath) {
    sections.push(`## Open File

The user currently has a non-notebook file open in the editor at path: \`${filePath}\`
**This is the file the user is working in.** When the user says "this file", they mean \`${filePath}\`.
- This is already known — do not call tools to discover or verify this path.
- To read this file, use \`read_file\` with path="${filePath}".
- To edit this file, use \`edit_file\` with path="${filePath}".
- This is not a notebook — do not call \`use_notebook\`, \`read_notebook\`, \`list_notebooks\`, or any notebook tools unless the user explicitly asks to work with a notebook.`);
  }

  return sections.join("\n\n");
}

export const ORION_AGENT_SYSTEM_PROMPT = promptContent;

/** System prompt for Ask mode (read-only tool access). */
export const ORION_AGENT_SYSTEM_PROMPT_ASK = promptContentAsk;

/** System prompt for Edit mode (file/terminal access, no notebook execution). */
export const ORION_AGENT_SYSTEM_PROMPT_EDIT = promptContentEdit;

function buildSubagentDelegationSection(
  availableSubagents?: Array<{
    name: string;
    label?: string;
    description: string;
    options?: { disableModelInvocation?: boolean };
  }>
): string | null {
  if (!availableSubagents || availableSubagents.length === 0) return null;

  const discoverableSubagents = filterDiscoverableSubagents(availableSubagents);
  if (discoverableSubagents.length === 0) return null;

  const agentLines = discoverableSubagents
    .map((agent) => {
      const displayName = agent.label ? `${agent.label} (\`${agent.name}\`)` : agent.name;
      return `- **${displayName}**: ${agent.description}`;
    })
    .join("\n");

  return `## Sub-agent Delegation

Use the \`delegate\` tool to offload tasks to a focused notebook-defined sub-agent. Each sub-agent runs autonomously in a temporary copy of its notebook, can use tools, and returns a concise text summary plus a \`tmpNotebookPath\`. Provide a detailed \`description\` so the sub-agent knows exactly what to do. For a fresh run, pass \`reconnectTmpNotebookPath: ""\`. For follow-up questions about a prior sub-agent run in this same chat, pass that prior result's exact \`tmpNotebookPath\`.

**Available sub-agents:**
${agentLines}`;
}

/**
 * Returns the agent system prompt with dynamic context sections appended.
 *
 * @param options.notebookPath - Open notebook path to embed in the prompt (editor context)
 * @param options.activeFilePath - Open non-notebook file path (used when no notebook is open; embedded as Open File)
 * @param options.workspaceDirectory - Workspace directory relative to Jupyter root
 * @param options.availableSkills - Skills to advertise in the system prompt
 * @param options.availableSubagents - Notebook-defined subagents to advertise in the system prompt
 * @param options.forcedSkillName - Legacy single skill explicitly selected by slash command for this turn
 * @param options.forcedSkillNames - Skills explicitly selected by slash command for this turn
 * @param options.forcedSubagentName - Subagent explicitly selected by slash command for this turn
 * @param options.serverInfo - Basic environment info from the Jupyter server (OS, Python version, etc.)
 * @param options.jupyterServerIsLocal - Client flag: Jupyter URL is loopback; with clientPlatformOs, OS may be inferred
 * @param options.clientPlatformOs - Browser OS; used when local server and server OS unknown
 * @returns Formatted system prompt string
 */
export function buildAgentSystemPrompt(options?: {
  /** Open notebook path (editor). Mutually exclusive with activeFilePath. */
  notebookPath?: string;
  /** Open non-notebook file path (editor). Mutually exclusive with notebookPath. */
  activeFilePath?: string;
  workspaceDirectory?: string;
  /** Skills available in this session — injected as an Available Skills section */
  availableSkills?: Array<{ name: string; description: string; disableModelInvocation?: boolean }>;
  /** Subagents available in this session — injected as an Available Subagents section */
  availableSubagents?: Array<{
    name: string;
    label?: string;
    description: string;
    options?: { disableModelInvocation?: boolean };
  }>;
  /** Skill selected by user for this turn — enforce loading this skill before answering */
  forcedSkillName?: string;
  forcedSkillNames?: string[];
  /** Subagent selected by user for this turn — enforce delegate before answering */
  forcedSubagentName?: string;
  /** Basic environment info fetched from the Jupyter server on connect */
  serverInfo?: JupyterServerInfo | null;
  jupyterServerIsLocal?: boolean;
  clientPlatformOs?: PlatformOS;
}): string {
  const {
    notebookPath,
    workspaceDirectory,
    availableSkills,
    availableSubagents,
    forcedSkillName,
    forcedSkillNames,
    forcedSubagentName,
    serverInfo,
    jupyterServerIsLocal,
    clientPlatformOs,
  } = options ?? {};

  // XOR enforcement: a request has either a notebook or a file, never both.
  // If both are somehow provided, notebookPath takes precedence.
  const activeFilePath = notebookPath ? undefined : options?.activeFilePath;
  const sections: string[] = [ORION_AGENT_SYSTEM_PROMPT];

  const subagentSection = buildSubagentDelegationSection(availableSubagents);
  if (subagentSection) sections.push(subagentSection);

  // Inject skills section when skills are available.
  if (availableSkills && availableSkills.length > 0) {
    const modelInvocableSkills = filterModelInvocableSkills(availableSkills);
    if (modelInvocableSkills.length > 0) {
      const skillLines = modelInvocableSkills
        .map((s) => `- **${s.name}**: ${s.description}`)
        .join("\n");
      sections.push(`## Available Skills

Skills provide specialized workflow instructions for specific task types.
Use the \`load_skill\` tool to load a skill when the user's task matches its description.

${skillLines}`);
    }
  }

  const requiredSkillNames = forcedSkillNames?.length
    ? forcedSkillNames
    : forcedSkillName
      ? [forcedSkillName]
      : [];

  if (requiredSkillNames.length > 0) {
    const skillList = requiredSkillNames.map((name) => `\`${name}\``).join(", ");
    const loadLines = requiredSkillNames
      .map((name) => `- You MUST call \`load_skill\` with \`name: "${name}"\`.`)
      .join("\n");
    sections.push(`## Active Skill Requirement

The user explicitly selected the ${skillList} skill${requiredSkillNames.length === 1 ? "" : "s"} for this turn.
${loadLines}
- Load the selected skill${requiredSkillNames.length === 1 ? "" : "s"} before doing any other work.`);
  }

  if (forcedSubagentName) {
    sections.push(`## Active Sub-agent Requirement

The user explicitly selected the \`${forcedSubagentName}\` sub-agent for this turn.
- You MUST call \`delegate\` with \`subagent: "${forcedSubagentName}"\` IMMEDIATELY. This MUST be the first thing you do.
- Pass the user's request as the \`description\`.
- Pass \`reconnectTmpNotebookPath: ""\` unless the user is explicitly asking about a prior sub-agent run and you have that run's \`tmpNotebookPath\`.`);
  }

  const envContext = buildAgentEnvironmentContextPrompt({
    serverInfo,
    jupyterServerIsLocal,
    clientPlatformOs,
    workspaceDirectory,
    notebookPath,
    activeFilePath,
  });
  if (envContext) {
    sections.push(envContext);
  }

  return sections.join("\n\n");
}

/** Shared options accepted by Ask and Edit mode prompt builders. */
interface ModeModePromptOptions {
  notebookPath?: string;
  activeFilePath?: string;
  workspaceDirectory?: string;
  serverInfo?: JupyterServerInfo | null;
  jupyterServerIsLocal?: boolean;
  clientPlatformOs?: PlatformOS;
}

/**
 * Builds the system prompt for Ask mode (read-only tool access).
 * No skills or sub-agent delegation sections — Ask mode is exploration only.
 */
export function buildAskModeSystemPrompt(options?: ModeModePromptOptions): string {
  const sections: string[] = [ORION_AGENT_SYSTEM_PROMPT_ASK];

  const envContext = buildAgentEnvironmentContextPrompt({
    serverInfo: options?.serverInfo,
    jupyterServerIsLocal: options?.jupyterServerIsLocal,
    clientPlatformOs: options?.clientPlatformOs,
    workspaceDirectory: options?.workspaceDirectory,
    notebookPath: options?.notebookPath,
    activeFilePath: options?.notebookPath ? undefined : options?.activeFilePath,
  });
  if (envContext) sections.push(envContext);

  return sections.join("\n\n");
}

/**
 * Builds the system prompt for Edit mode (file/terminal access, no notebook execution).
 * Includes sub-agent delegation and skills sections just like Agent mode.
 */
export function buildEditModeSystemPrompt(options?: {
  notebookPath?: string;
  activeFilePath?: string;
  workspaceDirectory?: string;
  availableSkills?: Array<{ name: string; description: string; disableModelInvocation?: boolean }>;
  availableSubagents?: Array<{
    name: string;
    label?: string;
    description: string;
    options?: { disableModelInvocation?: boolean };
  }>;
  forcedSkillName?: string;
  forcedSkillNames?: string[];
  forcedSubagentName?: string;
  serverInfo?: JupyterServerInfo | null;
  jupyterServerIsLocal?: boolean;
  clientPlatformOs?: PlatformOS;
}): string {
  const sections: string[] = [ORION_AGENT_SYSTEM_PROMPT_EDIT];

  const subagentSection = buildSubagentDelegationSection(options?.availableSubagents);
  if (subagentSection) sections.push(subagentSection);

  // Skills
  if (options?.availableSkills && options.availableSkills.length > 0) {
    const modelInvocableSkills = filterModelInvocableSkills(options.availableSkills);
    if (modelInvocableSkills.length > 0) {
      const skillLines = modelInvocableSkills.map((s) => `- **${s.name}**: ${s.description}`).join("\n");
      sections.push(`## Available Skills

Skills provide specialized workflow instructions for specific task types.
Use the \`load_skill\` tool to load a skill when the user's task matches its description.

${skillLines}`);
    }
  }

  const requiredSkillNames = options?.forcedSkillNames?.length
    ? options.forcedSkillNames
    : options?.forcedSkillName
      ? [options.forcedSkillName]
      : [];

  if (requiredSkillNames.length > 0) {
    const skillList = requiredSkillNames.map((name) => `\`${name}\``).join(", ");
    const loadLines = requiredSkillNames
      .map((name) => `- You MUST call \`load_skill\` with \`name: "${name}"\`.`)
      .join("\n");
    sections.push(`## Active Skill Requirement

The user explicitly selected the ${skillList} skill${requiredSkillNames.length === 1 ? "" : "s"} for this turn.
${loadLines}
- Load the selected skill${requiredSkillNames.length === 1 ? "" : "s"} before doing any other work.`);
  }

  if (options?.forcedSubagentName) {
    sections.push(`## Active Sub-agent Requirement

The user explicitly selected the \`${options.forcedSubagentName}\` sub-agent for this turn.
- You MUST call \`delegate\` with \`subagent: "${options.forcedSubagentName}"\` IMMEDIATELY. This MUST be the first thing you do.
- Pass the user's request as the \`description\`.
- Pass \`reconnectTmpNotebookPath: ""\` unless the user is explicitly asking about a prior sub-agent run and you have that run's \`tmpNotebookPath\`.`);
  }

  const activeFilePath = options?.notebookPath ? undefined : options?.activeFilePath;
  const envContext = buildAgentEnvironmentContextPrompt({
    serverInfo: options?.serverInfo,
    jupyterServerIsLocal: options?.jupyterServerIsLocal,
    clientPlatformOs: options?.clientPlatformOs,
    workspaceDirectory: options?.workspaceDirectory,
    notebookPath: options?.notebookPath,
    activeFilePath,
  });
  if (envContext) sections.push(envContext);

  return sections.join("\n\n");
}
