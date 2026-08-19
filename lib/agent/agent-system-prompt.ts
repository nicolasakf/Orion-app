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
import {
  buildModeToolAccessSection,
  resolveModeToolCapabilities,
  type CapabilityBaseMode,
  type ModeToolCapabilities,
} from "@/lib/agent/mode-capabilities";
import type { InteractionModeBashPolicy } from "@/lib/agent/interaction-modes";
import type { OrionToolName } from "@/lib/agent/tool-schemas";
import { PARALLEL_TOOL_CALLS_PROMPT_SECTION } from "@/lib/agent/tool-execution-policy";
import {
  buildPersonalContextPromptSection,
  MEMORY_UPDATE_POLICY_PROMPT_SECTION,
} from "@/lib/agent/personal-context-prompt";
import type {
  AgentCommunicationStyle,
  NotebookUiPreferences,
} from "@/lib/settings/schema";
import { buildUiPreferencesPromptSection } from "@/lib/agent/ui-preferences-prompt";
import { isAbsoluteAgentPath, toAgentAbsolutePath } from "./path-resolver";
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

/** Builds the shared model-invocable skills section used by interaction modes. */
function buildAvailableSkillsPromptSection(
  availableSkills?: Array<{
    name: string;
    description: string;
    disableModelInvocation?: boolean;
  }>
): string {
  if (!availableSkills || availableSkills.length === 0) return "";

  const modelInvocableSkills = filterModelInvocableSkills(availableSkills);
  if (modelInvocableSkills.length === 0) return "";

  const skillLines = modelInvocableSkills
    .map((skill) => `- **${skill.name}**: ${skill.description}`)
    .join("\n");
  return `## Available Skills

Skills provide specialized workflow instructions for specific task types.
Use the \`load_skill\` tool to load a skill when the user's task matches its description.

${skillLines}`;
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
  /** Absolute host path to the Jupyter contents root, when known for local sessions. */
  rootDirectory?: string;
  workspaceDirectory?: string;
  /** Path of the notebook currently connected to the agent's notebook tools. */
  connectedNotebookPath?: string | null;
  notebookPath?: string;
  activeFilePath?: string;
  /**
   * Tools the resolved mode actually grants. Editor and path guidance is phrased
   * against these so the context never tells the model to call a missing tool.
   */
  capabilities?: ModeToolCapabilities;
}): string {
  const {
    serverInfo,
    jupyterServerIsLocal,
    clientPlatformOs,
    rootDirectory,
    workspaceDirectory,
    connectedNotebookPath,
    notebookPath,
    activeFilePath,
  } = options;
  const capabilities =
    options.capabilities ?? resolveModeToolCapabilities({ baseMode: "Agent" });

  // XOR: if notebook is open, do not treat activeFilePath as the editor file
  const filePath = notebookPath ? undefined : activeFilePath;
  const toPromptPath = (path: string | undefined): string | undefined => {
    if (path === undefined) return undefined;
    if (isAbsoluteAgentPath(path)) return path;
    return toAgentAbsolutePath(path, { rootDirectory }) ?? path;
  };
  const workspacePromptPath = toPromptPath(workspaceDirectory);
  const connectedNotebookPromptPath = toPromptPath(
    connectedNotebookPath ?? undefined,
  );
  const notebookPromptPath = toPromptPath(notebookPath);
  const filePromptPath = toPromptPath(filePath);

  const sections: string[] = [];

  const jupyterEnvLines = buildJupyterServerEnvironmentLines({
    serverInfo,
    jupyterServerIsLocal,
    clientPlatformOs,
  });
  if (jupyterEnvLines.length > 0) {
    sections.push(`## Jupyter Server Environment\n\n${jupyterEnvLines.join("\n")}`);
  }

  /** Terminal line, emitted only when the mode can actually run shell commands. */
  const terminalLine = (cwd: string): string =>
    capabilities.canRunShell
      ? `\n- Use \`bash\` for shell commands. For a fresh terminal in this workspace, pass \`terminalName: ""\` and \`cwd: "${cwd}"\`; follow the \`bash\` / \`await_command\` tool descriptions for terminal reuse and long-running commands.`
      : "";
  const outsideRootLine =
    "- Orion cannot access files outside the Jupyter root. If the user asks for one, say the path is outside the Jupyter root and cannot be accessed.";

  if (rootDirectory) {
    sections.push(`## Jupyter Path Context

Jupyter root absolute path: \`${rootDirectory}\`
Workspace absolute path: \`${workspacePromptPath ?? rootDirectory}\`
- Use absolute host paths for all path-like tool inputs, including \`notebookPath\`, \`filePath\`, search/list paths, and fresh \`bash\` \`cwd\` values.
- Orion can access files anywhere under the Jupyter root, including outside the active workspace.
${outsideRootLine}
- Tool implementations convert absolute paths back to Jupyter-relative paths internally; do not do that conversion yourself.${terminalLine(
      workspacePromptPath ?? rootDirectory
    )}`);
  } else if (workspaceDirectory) {
    sections.push(`## Jupyter Path Context

Workspace directory relative to the Jupyter root: \`${workspaceDirectory}\`
- Absolute host paths are unavailable for this Jupyter connection because Orion does not know the Jupyter root directory.
- Use Jupyter-root-relative paths for path-like tool inputs, prefixed with this workspace directory when needed.
${outsideRootLine}${terminalLine(workspaceDirectory)}`);
  } else {
    sections.push(`## Jupyter Path Context

Neither the Jupyter root nor a workspace directory is known for this session.
- Absolute host paths are unavailable; use Jupyter-root-relative paths for path-like tool inputs.
${outsideRootLine}
- Discover the available paths with a listing tool before assuming any location exists.${terminalLine(
      "."
    )}`);
  }

  if (connectedNotebookPromptPath) {
    sections.push(`## Connected Notebook

The notebook currently connected to the agent's notebook tools is: \`${connectedNotebookPromptPath}\`.
- Cell-level notebook tools operate on this notebook unless a tool call explicitly selects a different notebook ID.`);
  } else if (capabilities.canConnectNotebook) {
    sections.push(`## Connected Notebook

No notebook is currently connected to the agent's notebook tools.
- Call \`use_notebook\` before using cell-level notebook tools.`);
  } else {
    sections.push(`## Connected Notebook

No notebook is currently connected to the agent's notebook tools.
- \`use_notebook\` is unavailable in this mode, so cell-level notebook tools cannot be used until the user opens or connects a notebook. Say that instead of trying to connect one yourself.`);
  }

  if (notebookPath) {
    const notebookDisplayPath = notebookPromptPath ?? notebookPath;
    const directory = notebookDisplayPath.includes("/")
      ? notebookDisplayPath.substring(0, notebookDisplayPath.lastIndexOf("/"))
      : workspacePromptPath ?? workspaceDirectory ?? "";

    const isOpenNotebookConnected =
      connectedNotebookPromptPath === notebookDisplayPath;
    const connectionLines = capabilities.canConnectNotebook
      ? [
          isOpenNotebookConnected
            ? "- This notebook is already connected to the agent's notebook tools; do not call `use_notebook` again unless the connection changes."
            : `- To work on this notebook, call \`use_notebook\` with notebookName=<notebook-filename>, notebookPath="${notebookDisplayPath}", and mode="connect".`,
          `- If the user asks to create a **new** notebook, call \`use_notebook\` with a new notebookName, a new notebookPath (e.g. \`${directory}/<descriptive_name>.ipynb\`), and mode="create". Do NOT connect to the existing notebook when the user wants a new one.`,
          "- Determine whether to connect or create based on the user's request.",
        ]
      : [
          "- `use_notebook` is unavailable in this mode: you cannot connect to this notebook or create a new one. Work with whatever is already connected, and tell the user if the notebook they mean is not.",
        ];
    const bufferLine = capabilities.canEditNotebookCells
      ? "- Official notebook reads see Orion's unsaved editor buffer, and official notebook mutations save the active dirty editor before writing; shell commands read only the saved disk copy."
      : "- Official notebook reads see Orion's unsaved editor buffer; shell commands read only the saved disk copy.";

    sections.push(`## Open Notebook

The user currently has a notebook open in the editor at path: \`${notebookDisplayPath}\`
${connectionLines.join("\n")}
${bufferLine}`);
  }

  if (filePath) {
    const fileDisplayPath = filePromptPath ?? filePath;
    const editLine = capabilities.canEditFiles
      ? `\n- To edit this file, use \`edit_file\` with path="${fileDisplayPath}".`
      : "\n- `edit_file` is unavailable in this mode; describe the change instead of making it.";
    const fileBufferLine = capabilities.canEditFiles
      ? "- Official reads see Orion's unsaved editor buffer, and official mutation tools save the active dirty editor before writing; shell commands read only the saved disk copy."
      : "- Official reads see Orion's unsaved editor buffer; shell commands read only the saved disk copy.";

    sections.push(`## Open File

The user currently has a non-notebook file open in the editor at path: \`${fileDisplayPath}\`
**This is the file the user is working in.** When the user says "this file", they mean \`${fileDisplayPath}\`.
- This is already known — do not call tools to discover or verify this path.
- To read this file, use \`read_file\` with path="${fileDisplayPath}".${editLine}
${fileBufferLine}
- This is not a notebook — do not call \`read_notebook\` or any notebook tools unless the user explicitly asks to work with a notebook.`);
  }

  return sections.join("\n\n");
}

export const ORION_AGENT_SYSTEM_PROMPT = promptContent;

/** System prompt for Ask mode (read-only tool access). */
export const ORION_AGENT_SYSTEM_PROMPT_ASK = promptContentAsk;

/** System prompt for Edit mode (file/terminal access, no notebook execution). */
export const ORION_AGENT_SYSTEM_PROMPT_EDIT = promptContentEdit;

const RESEARCH_MODE_SECTION = `## Research Mode

You are in Orion Research mode. Work as an adaptive investigator: gather evidence, inspect outputs, document what you learned in the notebook, and choose the next action from what the evidence shows.

Core loop:
- Generate or gather evidence before important conclusions.
- Review generated PNG/JPEG plots, tables, and statistics before continuing. If a plot preview is unavailable, use numeric or structural checks before relying on it.
- Treat the notebook as the research journal. After each evidence-producing step, add concise markdown that states what the output shows, the research decision it motivates, and any limitation or open question.
- Do not draft the whole notebook up front. Work in coherent research steps: write or run the next focused check, inspect evidence, document the observation and decision, then continue.
- A research step should answer one investigative move, such as loading/schema sanity, missingness checks, one plot family, one relationship question, or one anomaly check.
- Keep batches flexible when one coherent step needs several cells, but avoid full-notebook scaffolding before the first execution.
- Finish with a notebook synthesis section covering findings, decisions made along the way, uncertainty, limitations, and useful next steps.`;

/**
 * Communication guidance for Business View. The user is not a data practitioner;
 * keep analysis rigorous internally but explain outcomes in business terms.
 */
const BUSINESS_AUDIENCE_SECTION = `## Business Audience

The user is in Business View. They are a business owner, manager, or operator—not an analyst or data scientist.

This guidance applies only to **user-facing messages**. In notebooks, code, tool use, and internal reasoning, work with full technical rigor—use whatever methods, libraries, and terminology the analysis requires.

When communicating with them:
- Write as you would to a business owner: plain language focused on outcomes, trends, risks, and decisions they can act on.
- Use familiar business terms (revenue, customers, margins, growth, seasonality) instead of data-science or statistical jargon unless the user uses those terms first.
- Explain what findings mean for the business, not how you computed them.
- Do not assume they know notebooks, code, kernels, or technical tooling unless they ask.
- Stay accurate: simplify the explanation, not the analysis behind it.`;

/**
 * Terminology rule for Business View. Applies to every mode, because the
 * experience mode and the interaction mode are chosen independently.
 */
const BUSINESS_TERMINOLOGY_SECTION = `## User-Facing Terminology

Internally, you are working with **Jupyter notebooks** (\`.ipynb\` files, a Jupyter kernel, Jupyter server paths, etc.). Keep that technical understanding when choosing tools and interpreting results.

When **communicating with the user**, always call the notebook format **Orion notebook** (or **Orion notebooks** when plural). Never say "Jupyter notebook" or "Jupyter notebooks" in user-facing messages.`;

/**
 * Builds the Business View authoring rules, which only make sense when the mode
 * can actually change notebook content.
 *
 * @param capabilities - Resolved mode capabilities
 * @param enableSkills - Whether `load_skill` is available in this mode
 */
function buildBusinessAppViewSection(
  capabilities: ModeToolCapabilities,
  enableSkills: boolean
): string {
  const intro = `## Business View Mode

The user is in Orion Business View. They see only the notebook **App View**—not raw notebook cells, code, or Notebook view.`;

  if (!capabilities.canEditNotebookCells) {
    return `${intro}

This mode cannot change notebook content, so you cannot update what the user sees in App View. Answer in chat, and when work would require App View changes, say which notebook content would need to be added or marked and let the user switch to a mode that can do it.`;
  }

  const loadCreateAppLine = enableSkills
    ? "- Load the `create-app` skill before selecting App View content.\n"
    : "";
  const orionUiLine = enableSkills
    ? "- Prefer `orion_ui` outputs for charts, tables, cards, and interactive controls; load `orion-ui` when building those."
    : "- Prefer `orion_ui` outputs for charts, tables, cards, and interactive controls.";
  const executionLine = capabilities.canExecuteCode
    ? "- After adding or updating notebook content, run cells as needed, then update App View selections so the user's App View reflects the work."
    : "- After adding or updating notebook content, update App View selections so the user's App View reflects the work. This mode cannot run cells, so tell the user which cells they need to run for the outputs to appear.";

  return `${intro}

When you create or edit a notebook in this session:
${loadCreateAppLine}- Every narrative section, chart, table, metric, or control the user should see MUST be marked for App View via \`metadata.orion.app\` on the relevant markdown cells and code outputs.
${executionLine}
${orionUiLine}
- Do not treat notebook-only content as complete—the user cannot see it until it is included in App View.

If App View would still be empty after your changes, keep working until meaningful report content is visible there.`;
}

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

/** Builds the mandatory first delegation instruction for a user-selected sub-agent. */
function buildForcedSubagentPromptSection(
  forcedSubagentName?: string
): string {
  if (!forcedSubagentName) return "";

  return `## Active Sub-agent Requirement

The user explicitly selected the \`${forcedSubagentName}\` sub-agent for this turn.
- You MUST call \`delegate\` with \`subagent: "${forcedSubagentName}"\` IMMEDIATELY. This MUST be the first thing you do.
- Pass the user's request as the \`description\`.
- Pass \`reconnectTmpNotebookPath: ""\` unless the user is explicitly asking about a prior sub-agent run and you have that run's \`tmpNotebookPath\`.`;
}

/**
 * Returns the agent system prompt with dynamic context sections appended.
 *
 * @param options.notebookPath - Open notebook path to embed in the prompt (editor context)
 * @param options.activeFilePath - Open non-notebook file path (used when no notebook is open; embedded as Open File)
 * @param options.rootDirectory - Absolute Jupyter contents root path, when available for local sessions
 * @param options.workspaceDirectory - Workspace directory relative to Jupyter root
 * @param options.connectedNotebookPath - Notebook currently connected to notebook tools, if any
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
 * @param options.uiPreferences - Preferred libraries for generated charts, tables, and UI elements
 * @returns Formatted system prompt string
 */
export interface ModeSystemPromptOptions {
  /** Open notebook path (editor). Mutually exclusive with activeFilePath. */
  notebookPath?: string;
  /** Open non-notebook file path (editor). Mutually exclusive with notebookPath. */
  activeFilePath?: string;
  /** Absolute host path to the Jupyter contents root, when available for local sessions. */
  rootDirectory?: string;
  workspaceDirectory?: string;
  /** Notebook currently connected to the agent's notebook tools, if any. */
  connectedNotebookPath?: string | null;
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
  /** User-maintained background loaded from `~/.orion/ORION.md`. */
  personalContext?: string;
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
  /** Preferred libraries for agent-authored notebook and App View interfaces. */
  uiPreferences?: NotebookUiPreferences;
  /** User-authored instructions appended to this mode's protected base prompt. */
  customSystemPrompt?: string;
  /** Whether to advertise loadable skills in this mode. */
  enableSkills?: boolean;
  /** Whether to advertise notebook-defined sub-agent delegation in this mode. */
  enableSubagents?: boolean;
  /** When true, the user is in Business View and only sees notebook App View. */
  businessExperienceMode?: boolean;
  /**
   * Tool names the resolved mode actually grants. Every capability claim in the
   * prompt is derived from these, so a customized mode can never be described as
   * more or less capable than the tools it ships with. Omit to assume the base
   * mode's defaults.
   */
  modeToolNames?: readonly OrionToolName[];
  /** Shell policy enforced for `bash`; omit to assume the base mode's default. */
  bashPolicy?: InteractionModeBashPolicy;
}

/**
 * Assembles a mode system prompt from a base prompt plus the dynamic sections.
 *
 * All four modes share this assembly so a section added for one mode cannot
 * silently go missing in another.
 *
 * @param basePrompt - Protected, mode-specific base prompt markdown
 * @param baseMode - Base mode used to resolve default capabilities
 * @param options - Session context and resolved mode configuration
 */
function buildModeSystemPrompt(
  basePrompt: string,
  baseMode: CapabilityBaseMode,
  options?: ModeSystemPromptOptions
): string {
  const {
    notebookPath,
    rootDirectory,
    workspaceDirectory,
    connectedNotebookPath,
    availableSkills,
    availableSubagents,
    agentRules,
    personalContext,
    forcedSkillName,
    forcedSkillNames,
    forcedSubagentName,
    serverInfo,
    jupyterServerIsLocal,
    clientPlatformOs,
    communicationStyle,
    customCommunicationStyle,
    uiPreferences,
    customSystemPrompt,
    businessExperienceMode,
    modeToolNames,
    bashPolicy,
  } = options ?? {};
  const enableSkills = options?.enableSkills ?? true;
  const enableSubagents = options?.enableSubagents ?? true;
  const capabilities = resolveModeToolCapabilities({
    baseMode,
    toolNames: modeToolNames,
    bashPolicy,
  });

  // XOR enforcement: a request has either a notebook or a file, never both.
  // If both are somehow provided, notebookPath takes precedence.
  const activeFilePath = notebookPath ? undefined : options?.activeFilePath;
  const sections: string[] = [basePrompt];

  const toolAccessSection = buildModeToolAccessSection(capabilities);
  if (toolAccessSection) sections.push(toolAccessSection);

  sections.push(PARALLEL_TOOL_CALLS_PROMPT_SECTION, MEMORY_UPDATE_POLICY_PROMPT_SECTION);

  const styleSection = buildCommunicationStyleSection({
    style: communicationStyle,
    customStyle: customCommunicationStyle,
  });
  if (styleSection) sections.push(styleSection);

  const rulesSection = buildRulesPromptSection(agentRules);
  if (rulesSection) sections.push(rulesSection);

  const personalContextSection = buildPersonalContextPromptSection(personalContext);
  if (personalContextSection) sections.push(personalContextSection);

  const uiPreferencesSection = buildUiPreferencesPromptSection(uiPreferences);
  if (uiPreferencesSection) sections.push(uiPreferencesSection);

  const customModeSection = buildCustomInteractionModeSection(customSystemPrompt);
  if (customModeSection) sections.push(customModeSection);

  const subagentSection = enableSubagents
    ? buildSubagentDelegationSection(availableSubagents)
    : null;
  if (subagentSection) sections.push(subagentSection);

  const skillsSection = enableSkills
    ? buildAvailableSkillsPromptSection(availableSkills)
    : "";
  if (skillsSection) sections.push(skillsSection);

  const requiredSkillNames = forcedSkillNames?.length
    ? forcedSkillNames
    : forcedSkillName
      ? [forcedSkillName]
      : [];

  if (requiredSkillNames.length > 0) {
    const requiredSkillsSection = buildRequiredSkillsPromptSection(requiredSkillNames);
    if (requiredSkillsSection) sections.push(requiredSkillsSection);
  }

  const forcedSubagentSection =
    buildForcedSubagentPromptSection(forcedSubagentName);
  if (forcedSubagentSection) sections.push(forcedSubagentSection);

  const envContext = buildAgentEnvironmentContextPrompt({
    serverInfo,
    jupyterServerIsLocal,
    clientPlatformOs,
    rootDirectory,
    workspaceDirectory,
    connectedNotebookPath,
    notebookPath,
    activeFilePath,
    capabilities,
  });
  if (envContext) {
    sections.push(envContext);
  }

  if (businessExperienceMode) {
    sections.push(
      BUSINESS_AUDIENCE_SECTION,
      BUSINESS_TERMINOLOGY_SECTION,
      buildBusinessAppViewSection(capabilities, enableSkills)
    );
  }

  return sections.join("\n\n");
}

export function buildAgentSystemPrompt(options?: ModeSystemPromptOptions): string {
  return buildModeSystemPrompt(ORION_AGENT_SYSTEM_PROMPT, "Agent", options);
}

/** Builds the system prompt for Research mode, Orion's evidence-driven default mode. */
export function buildResearchModeSystemPrompt(options?: ModeSystemPromptOptions): string {
  const basePrompt = buildModeSystemPrompt(ORION_AGENT_SYSTEM_PROMPT, "Research", options);
  return `${basePrompt}\n\n${RESEARCH_MODE_SECTION}`;
}

/**
 * Builds the system prompt for Ask mode (read-only by default).
 * Skills remain available because loading instructions does not mutate user state.
 */
export function buildAskModeSystemPrompt(options?: ModeSystemPromptOptions): string {
  return buildModeSystemPrompt(ORION_AGENT_SYSTEM_PROMPT_ASK, "Ask", options);
}

/**
 * Builds the system prompt for Edit mode (file/terminal access, no notebook execution
 * by default). Includes sub-agent delegation and skills sections just like Agent mode.
 */
export function buildEditModeSystemPrompt(options?: ModeSystemPromptOptions): string {
  return buildModeSystemPrompt(ORION_AGENT_SYSTEM_PROMPT_EDIT, "Edit", options);
}
