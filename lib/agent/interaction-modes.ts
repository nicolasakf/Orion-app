import {
  ASK_MODE_TOOLS,
  EDIT_MODE_TOOLS,
  ORION_TOOL_NAMES,
  isOrionToolName,
  orionTools,
  type OrionToolName,
} from "@/lib/agent/tool-schemas";

export const BUILTIN_INTERACTION_MODE_IDS = ["Agent", "Research", "Edit", "Ask"] as const;
export type BuiltInInteractionModeId = (typeof BUILTIN_INTERACTION_MODE_IDS)[number];
export type InteractionModeBase = BuiltInInteractionModeId;
export type InteractionModeBashPolicy = "read_only" | "full";

export interface InteractionModeConfig {
  id: string;
  label: string;
  description: string;
  baseMode: InteractionModeBase;
  toolNames: OrionToolName[];
  customSystemPrompt: string;
  builtIn: boolean;
  bashPolicy: InteractionModeBashPolicy;
  /** When true, the mode is configurable in settings but omitted from the chat selector. */
  hiddenInSelector: boolean;
  /** Marks experimental built-in modes shown in settings (for example Research). */
  beta: boolean;
}

export type SerializedInteractionModeConfig = Omit<InteractionModeConfig, "toolNames"> & {
  toolNames: string[];
};

const BUILTIN_MODE_METADATA: Record<
  BuiltInInteractionModeId,
  Pick<
    InteractionModeConfig,
    "id" | "label" | "description" | "baseMode" | "builtIn" | "hiddenInSelector" | "beta"
  >
> = {
  Research: {
    id: "Research",
    label: "Research",
    description:
      "Use for open-ended analysis where Orion should inspect evidence, compare possibilities, and decide what to investigate next. Beta — still in active testing.",
    baseMode: "Research",
    builtIn: true,
    hiddenInSelector: true,
    beta: true,
  },
  Agent: {
    id: "Agent",
    label: "Agent",
    description:
      "Use for most tasks where you want Orion to get things done, including coding, notebook work, debugging, and multi-step changes.",
    baseMode: "Agent",
    builtIn: true,
    hiddenInSelector: false,
    beta: false,
  },
  Ask: {
    id: "Ask",
    label: "Ask",
    description:
      "Use when you want an explanation, review, or answer without changing any files.",
    baseMode: "Ask",
    builtIn: true,
    hiddenInSelector: false,
    beta: false,
  },
  Edit: {
    id: "Edit",
    label: "Edit",
    description:
      "Use for targeted file edits or terminal work when you do not want Orion to run notebook code.",
    baseMode: "Edit",
    builtIn: true,
    hiddenInSelector: false,
    beta: false,
  },
};

/** Default mode configurations matching Orion's historical built-in modes. */
export const DEFAULT_INTERACTION_MODE_CONFIGS: InteractionModeConfig[] = [
  {
    ...BUILTIN_MODE_METADATA.Agent,
    toolNames: [...ORION_TOOL_NAMES],
    customSystemPrompt: "",
    bashPolicy: "full",
  },
  {
    ...BUILTIN_MODE_METADATA.Research,
    toolNames: [...ORION_TOOL_NAMES],
    customSystemPrompt: "",
    bashPolicy: "full",
  },
  {
    ...BUILTIN_MODE_METADATA.Edit,
    toolNames: Object.keys(EDIT_MODE_TOOLS) as OrionToolName[],
    customSystemPrompt: "",
    bashPolicy: "full",
  },
  {
    ...BUILTIN_MODE_METADATA.Ask,
    toolNames: Object.keys(ASK_MODE_TOOLS) as OrionToolName[],
    customSystemPrompt: "",
    bashPolicy: "read_only",
  },
];

const DEFAULT_MODE_BY_ID = new Map(
  DEFAULT_INTERACTION_MODE_CONFIGS.map((mode) => [mode.id, mode])
);

/**
 * Ask-mode tools shipped before read-only kernel discovery and skill loading
 * were added. Exact matches can be upgraded without overwriting customized modes.
 */
const LEGACY_ASK_MODE_DEFAULT_TOOL_NAMES: readonly OrionToolName[] = [
  "read_file",
  "read_notebook",
  "read_cell",
  "read_cell_output",
  "bash",
  "await_command",
  "web_fetch",
  "web_search",
];

/** Returns a fresh default config for a built-in mode. */
export function getDefaultInteractionModeConfig(
  id: BuiltInInteractionModeId = "Agent"
): InteractionModeConfig {
  return structuredClone(DEFAULT_MODE_BY_ID.get(id) ?? DEFAULT_INTERACTION_MODE_CONFIGS[0]);
}

/** True when a mode id is one of Orion's protected built-in modes. */
export function isBuiltInInteractionModeId(id: string): id is BuiltInInteractionModeId {
  return BUILTIN_INTERACTION_MODE_IDS.includes(id as BuiltInInteractionModeId);
}

/** Returns only valid Orion tool names, preserving user order and removing duplicates. */
export function normalizeToolNames(toolNames: unknown): OrionToolName[] {
  if (!Array.isArray(toolNames)) return [];
  const seen = new Set<OrionToolName>();
  const normalized: OrionToolName[] = [];
  for (const value of toolNames) {
    if (!isOrionToolName(value) || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
}

function parseBaseMode(value: unknown, fallback: InteractionModeBase): InteractionModeBase {
  return isBuiltInInteractionModeId(String(value)) ? (value as InteractionModeBase) : fallback;
}

function parseBashPolicy(
  value: unknown,
  fallback: InteractionModeBashPolicy
): InteractionModeBashPolicy {
  return value === "read_only" || value === "full" ? value : fallback;
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Upgrades an unchanged legacy Ask tool set while preserving user customizations. */
function normalizeBuiltInToolNames(
  id: BuiltInInteractionModeId,
  rawToolNames: unknown,
  defaults: OrionToolName[]
): OrionToolName[] {
  const normalized = normalizeToolNames(rawToolNames);
  if (
    id === "Ask" &&
    normalized.length === LEGACY_ASK_MODE_DEFAULT_TOOL_NAMES.length &&
    normalized.every(
      (toolName, index) =>
        toolName === LEGACY_ASK_MODE_DEFAULT_TOOL_NAMES[index]
    )
  ) {
    return defaults;
  }

  // Render inspection is a safe companion to read_cell_output and must remain
  // available in every built-in mode after upgrading persisted tool lists.
  if (
    normalized.includes("read_cell_output") &&
    !normalized.includes("inspect_plotly_output")
  ) {
    const readOutputIndex = normalized.indexOf("read_cell_output");
    normalized.splice(readOutputIndex + 1, 0, "inspect_plotly_output");
  }

  // Terminal recovery is a safe companion to await_command: without it a mode
  // that can start commands has no way out of one stuck on an interactive prompt.
  if (
    normalized.includes("await_command") &&
    !normalized.includes("kill_command")
  ) {
    const awaitIndex = normalized.indexOf("await_command");
    normalized.splice(awaitIndex + 1, 0, "kill_command");
  }
  return normalized;
}

function normalizeCustomMode(
  raw: Record<string, unknown>,
  usedIds: Set<string>
): InteractionModeConfig | null {
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  if (!id || !label || isBuiltInInteractionModeId(id) || usedIds.has(id)) return null;

  const baseMode = parseBaseMode(raw.baseMode, "Agent");
  const fallback = getDefaultInteractionModeConfig(baseMode);
  usedIds.add(id);
  return {
    id,
    label,
    description: typeof raw.description === "string" ? raw.description : "",
    baseMode,
    toolNames: normalizeToolNames(raw.toolNames),
    customSystemPrompt:
      typeof raw.customSystemPrompt === "string" ? raw.customSystemPrompt : "",
    builtIn: false,
    bashPolicy: parseBashPolicy(raw.bashPolicy, fallback.bashPolicy),
    hiddenInSelector: parseBoolean(raw.hiddenInSelector, false),
    beta: parseBoolean(raw.beta, false),
  };
}

/** Repairs persisted mode settings and guarantees all built-ins are present. */
export function normalizeInteractionModeConfigs(
  rawModes: unknown
): InteractionModeConfig[] {
  const rawList = Array.isArray(rawModes) ? rawModes : [];
  const result: InteractionModeConfig[] = [];
  const usedIds = new Set<string>();

  for (const builtinId of BUILTIN_INTERACTION_MODE_IDS) {
    const defaults = getDefaultInteractionModeConfig(builtinId);
    const raw = rawList.find((candidate) => {
      return (
        typeof candidate === "object" &&
        candidate !== null &&
        (candidate as Record<string, unknown>).id === builtinId
      );
    }) as Record<string, unknown> | undefined;

    result.push({
      ...defaults,
      toolNames: raw
        ? normalizeBuiltInToolNames(builtinId, raw.toolNames, defaults.toolNames)
        : defaults.toolNames,
      customSystemPrompt:
        raw && typeof raw.customSystemPrompt === "string"
          ? raw.customSystemPrompt
          : defaults.customSystemPrompt,
      bashPolicy: raw ? parseBashPolicy(raw.bashPolicy, defaults.bashPolicy) : defaults.bashPolicy,
      hiddenInSelector: raw
        ? parseBoolean(raw.hiddenInSelector, defaults.hiddenInSelector)
        : defaults.hiddenInSelector,
      beta: defaults.beta,
    });
    usedIds.add(builtinId);
  }

  for (const candidate of rawList) {
    if (typeof candidate !== "object" || candidate === null) continue;
    const normalized = normalizeCustomMode(candidate as Record<string, unknown>, usedIds);
    if (normalized) result.push(normalized);
  }

  return result;
}

/** Returns modes that should appear in the chat interaction mode selector. */
export function getSelectorInteractionModes(
  modes: InteractionModeConfig[]
): InteractionModeConfig[] {
  return modes.filter((mode) => !mode.hiddenInSelector);
}

/**
 * Keeps the requested mode when it is selector-visible; otherwise falls back to
 * the first visible mode (or Agent when none are visible).
 */
export function resolveSelectorInteractionModeId(
  modeId: string,
  modes: InteractionModeConfig[]
): string {
  const selectorModes = getSelectorInteractionModes(modes);
  if (selectorModes.some((mode) => mode.id === modeId)) return modeId;
  return selectorModes[0]?.id ?? "Agent";
}

/** Resolve a requested mode id/config into a safe mode configuration. */
export function resolveInteractionModeConfig(options: {
  modeId?: string;
  modes?: unknown;
  requestConfig?: unknown;
}): InteractionModeConfig {
  const normalizedModes = normalizeInteractionModeConfigs(options.modes);
  const requestConfig =
    typeof options.requestConfig === "object" && options.requestConfig !== null
      ? normalizeInteractionModeConfigs([options.requestConfig]).find(
          (mode) =>
            mode.id ===
            ((options.requestConfig as Record<string, unknown>).id as string | undefined)
        )
      : null;

  if (requestConfig && (!options.modeId || requestConfig.id === options.modeId)) {
    return requestConfig;
  }

  return (
    normalizedModes.find((mode) => mode.id === options.modeId) ??
    getDefaultInteractionModeConfig("Agent")
  );
}

/** Build the AI SDK tool object for a resolved mode. */
export function getToolsForInteractionMode(mode: InteractionModeConfig): Partial<typeof orionTools> {
  const toolNames = Array.from(new Set(mode.toolNames));
  return Object.fromEntries(
    toolNames
      .filter(isOrionToolName)
      .map((toolName) => [toolName, orionTools[toolName]])
  ) as Partial<typeof orionTools>;
}
