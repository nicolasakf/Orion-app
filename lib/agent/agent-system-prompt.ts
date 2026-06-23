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
import { buildRequiredSkillsPromptSection } from "@/lib/agent/implicit-skills";
import { buildRulesPromptSection, type AgentRule } from "@/lib/agent/rules";
import type { AgentCommunicationStyle } from "@/lib/settings/schema";
export { buildSubagentSystemPrompt } from "@/lib/agent/subagents";

/**
 * Communication style section blocks injected into the agent system prompt.
 * The "default" preset injects minimal narration rules; other presets expand on tone.
 */
const COMMUNICATION_STYLE_SECTIONS: Record<AgentCommunicationStyle, string> = {
  default: "",

  narrative: `## Communication Style

You must narrate your work so the user can follow along. This is critical for building trust and keeping the user informed.

**Rules:**
- Before each tool call (or group of related tool calls), write a brief 1-2 sentence explanation of what you're doing and why.
- After receiving tool results, briefly acknowledge what you found before moving on.
- Use natural, conversational language (e.g., "Let me check the data file...", "Found 3 columns with missing values, fixing those now...").
- Keep messages short and action-oriented — don't be verbose or overly formal.
- Never make tool calls without at least a brief preceding explanation.

**Good example:**
> "Let me read the notebook to understand the current state."
> → [read_notebook]
> "I see you have a DataFrame loaded with sales data. Let me check its shape and columns."
> → [execute_code]
> "The data has 1,000 rows and 5 columns. I'll add a new cell to start the analysis."
> → [insert_cell]

**Bad example (avoid this):**
> → [read_notebook] → [execute_code] → [insert_cell] → "Done, I added the analysis."`,

  friendly: `## Communication Style

Be warm, encouraging, and approachable — like a knowledgeable colleague who enjoys helping.

**Rules:**
- Before each tool call (or group), write a short, upbeat explanation of what you're about to do.
- After results, respond with a friendly acknowledgment before moving on (e.g., "Great — found it!", "Looks good so far!").
- Use warm, conversational language — avoid sounding robotic or overly formal.
- Keep messages concise and positive; don't pad with excessive reassurances.`,

  pragmatic: `## Communication Style

Be direct and minimal. State exactly what you're doing and what you found — nothing more.

**Rules:**
- One sentence before each tool call group describing the action.
- One sentence after results stating the key finding.
- No filler words, pleasantries, or verbose explanations.
- Prefer bullet points over prose where possible.`,
};

/** Options for building the communication style section of the system prompt. */
interface CommunicationStylePromptOptions {
  style?: AgentCommunicationStyle;
  /** When non-empty, overrides the preset style. */
  customStyle?: string;
}

/** Returns the communication style prompt section for a preset or custom instructions. */
function buildCommunicationStyleSection(
  options?: CommunicationStylePromptOptions
): string {
  const customStyle = options?.customStyle?.trim();
  if (customStyle) {
    return `## Communication Style\n\n${customStyle}`;
  }

  return COMMUNICATION_STYLE_SECTIONS[options?.style ?? "default"];
}

/** Returns a protected custom-instructions section appended to a mode base prompt. */
function buildCustomInteractionModeSection(customSystemPrompt?: string): string {
  const trimmed = customSystemPrompt?.trim();
  if (!trimmed) return "";
  return `## Custom Interaction Mode Instructions\n\n${trimmed}`;
}

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
- Use \`bash\` for shell commands. For a fresh terminal in this workspace, pass \`terminalName: ""\` and \`cwd: "${workspaceDirectory}"\`; follow the \`bash\` / \`await_command\` tool descriptions for terminal reuse and long-running commands.
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
- Official notebook reads see Orion's unsaved editor buffer, and official notebook mutations save the active dirty editor before writing; shell commands read only the saved disk copy.
- Determine whether to connect or create based on the user's request.`);
  }

  if (filePath) {
    sections.push(`## Open File

The user currently has a non-notebook file open in the editor at path: \`${filePath}\`
**This is the file the user is working in.** When the user says "this file", they mean \`${filePath}\`.
- This is already known — do not call tools to discover or verify this path.
- To read this file, use \`read_file\` with path="${filePath}".
- To edit this file, use \`edit_file\` with path="${filePath}".
- Official reads see Orion's unsaved editor buffer, and official mutation tools save the active dirty editor before writing; shell commands read only the saved disk copy.
- This is not a notebook — do not call \`use_notebook\`, \`read_notebook\`, or any notebook tools unless the user explicitly asks to work with a notebook.`);
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
 * @param options.agentRules - AGENTS.md / CLAUDE.md rule files loaded for this workspace
 * @param options.forcedSkillName - Legacy single skill explicitly selected by slash command for this turn
 * @param options.forcedSkillNames - Skills explicitly selected by slash command for this turn
 * @param options.forcedSubagentName - Subagent explicitly selected by slash command for this turn
 * @param options.serverInfo - Basic environment info from the Jupyter server (OS, Python version, etc.)
 * @param options.jupyterServerIsLocal - Client flag: Jupyter URL is loopback; with clientPlatformOs, OS may be inferred
 * @param options.clientPlatformOs - Browser OS; used when local server and server OS unknown
 * @param options.communicationStyle - Communication style preset ("default" | "narrative" | "friendly" | "pragmatic")
 * @param options.customCommunicationStyle - Optional custom instructions; overrides preset when non-empty
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
  /** AGENTS.md / CLAUDE.md rule files loaded for this workspace. */
  agentRules?: AgentRule[];
  /** Skill selected by user for this turn — enforce loading this skill before answering */
  forcedSkillName?: string;
  forcedSkillNames?: string[];
  /** Subagent selected by user for this turn — enforce delegate before answering */
  forcedSubagentName?: string;
  /** Basic environment info fetched from the Jupyter server on connect */
  serverInfo?: JupyterServerInfo | null;
  jupyterServerIsLocal?: boolean;
  clientPlatformOs?: PlatformOS;
  /** Communication style preset; omitting or "default" uses minimal narration instructions */
  communicationStyle?: AgentCommunicationStyle;
  /** Custom communication instructions; overrides preset when non-empty */
  customCommunicationStyle?: string;
  /** User-authored instructions appended to this mode's protected base prompt. */
  customSystemPrompt?: string;
  /** Whether to advertise loadable skills in this mode. */
  enableSkills?: boolean;
  /** Whether to advertise notebook-defined sub-agent delegation in this mode. */
  enableSubagents?: boolean;
}): string {
  const {
    notebookPath,
    workspaceDirectory,
    availableSkills,
    availableSubagents,
    agentRules,
    forcedSkillName,
    forcedSkillNames,
    forcedSubagentName,
    serverInfo,
    jupyterServerIsLocal,
    clientPlatformOs,
    communicationStyle,
    customCommunicationStyle,
    customSystemPrompt,
  } = options ?? {};
  const enableSkills = options?.enableSkills ?? true;
  const enableSubagents = options?.enableSubagents ?? true;

  // XOR enforcement: a request has either a notebook or a file, never both.
  // If both are somehow provided, notebookPath takes precedence.
  const activeFilePath = notebookPath ? undefined : options?.activeFilePath;
  const sections: string[] = [ORION_AGENT_SYSTEM_PROMPT];

  const styleSection = buildCommunicationStyleSection({
    style: communicationStyle,
    customStyle: customCommunicationStyle,
  });
  if (styleSection) sections.push(styleSection);

  const rulesSection = buildRulesPromptSection(agentRules);
  if (rulesSection) sections.push(rulesSection);

  const customModeSection = buildCustomInteractionModeSection(customSystemPrompt);
  if (customModeSection) sections.push(customModeSection);

  const subagentSection = enableSubagents
    ? buildSubagentDelegationSection(availableSubagents)
    : null;
  if (subagentSection) sections.push(subagentSection);

  // Inject skills section when skills are available.
  if (enableSkills && availableSkills && availableSkills.length > 0) {
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
    const requiredSkillsSection = buildRequiredSkillsPromptSection(requiredSkillNames);
    if (requiredSkillsSection) sections.push(requiredSkillsSection);
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
  /** AGENTS.md / CLAUDE.md rule files loaded for this workspace. */
  agentRules?: AgentRule[];
  /** Communication style preset; omitting or "default" uses minimal narration instructions */
  communicationStyle?: AgentCommunicationStyle;
  /** Custom communication instructions; overrides preset when non-empty */
  customCommunicationStyle?: string;
  customSystemPrompt?: string;
}

/**
 * Builds the system prompt for Ask mode (read-only tool access).
 * No skills or sub-agent delegation sections — Ask mode is exploration only.
 */
export function buildAskModeSystemPrompt(options?: ModeModePromptOptions): string {
  const sections: string[] = [ORION_AGENT_SYSTEM_PROMPT_ASK];

  const styleSection = buildCommunicationStyleSection({
    style: options?.communicationStyle,
    customStyle: options?.customCommunicationStyle,
  });
  if (styleSection) sections.push(styleSection);

  const rulesSection = buildRulesPromptSection(options?.agentRules);
  if (rulesSection) sections.push(rulesSection);

  const customModeSection = buildCustomInteractionModeSection(options?.customSystemPrompt);
  if (customModeSection) sections.push(customModeSection);

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
  agentRules?: AgentRule[];
  forcedSkillName?: string;
  forcedSkillNames?: string[];
  forcedSubagentName?: string;
  serverInfo?: JupyterServerInfo | null;
  jupyterServerIsLocal?: boolean;
  clientPlatformOs?: PlatformOS;
  /** Communication style preset; omitting or "default" uses minimal narration instructions */
  communicationStyle?: AgentCommunicationStyle;
  /** Custom communication instructions; overrides preset when non-empty */
  customCommunicationStyle?: string;
  /** User-authored instructions appended to this mode's protected base prompt. */
  customSystemPrompt?: string;
  /** Whether to advertise loadable skills in this mode. */
  enableSkills?: boolean;
  /** Whether to advertise notebook-defined sub-agent delegation in this mode. */
  enableSubagents?: boolean;
}): string {
  const sections: string[] = [ORION_AGENT_SYSTEM_PROMPT_EDIT];

  const styleSection = buildCommunicationStyleSection({
    style: options?.communicationStyle,
    customStyle: options?.customCommunicationStyle,
  });
  if (styleSection) sections.push(styleSection);

  const rulesSection = buildRulesPromptSection(options?.agentRules);
  if (rulesSection) sections.push(rulesSection);

  const customModeSection = buildCustomInteractionModeSection(options?.customSystemPrompt);
  if (customModeSection) sections.push(customModeSection);

  const subagentSection = options?.enableSubagents === false
    ? null
    : buildSubagentDelegationSection(options?.availableSubagents);
  if (subagentSection) sections.push(subagentSection);

  // Skills
  if (options?.enableSkills !== false && options?.availableSkills && options.availableSkills.length > 0) {
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
    const requiredSkillsSection = buildRequiredSkillsPromptSection(requiredSkillNames);
    if (requiredSkillsSection) sections.push(requiredSkillsSection);
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
