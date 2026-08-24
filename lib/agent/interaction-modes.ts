import { parseHexColorValue } from "@/lib/color/hex";
import {
  ASK_MODE_TOOLS,
  EDIT_MODE_TOOLS,
  ORION_TOOL_NAMES,
  isOrionToolName,
  orionTools,
  type OrionToolName,
} from "@/lib/agent/tool-schemas";

export const INTERACTION_MODE_BASES = [
  "Agent",
  "Explore",
  "Edit",
  "Ask",
] as const;
export const BUILTIN_INTERACTION_MODE_IDS = [
  "Agent",
  "Goal",
  "Explore",
  "Edit",
  "Ask",
] as const;
export type BuiltInInteractionModeId =
  (typeof BUILTIN_INTERACTION_MODE_IDS)[number];
export type InteractionModeBase = (typeof INTERACTION_MODE_BASES)[number];
export type InteractionModeBashPolicy = "read_only" | "full";
export type InteractionModeOrchestration = "normal" | "goal";

export interface InteractionModeConfig {
  id: string;
  label: string;
  description: string;
  baseMode: InteractionModeBase;
  /** Selects a lifecycle layered over the base prompt and tools. */
  orchestration: InteractionModeOrchestration;
  toolNames: OrionToolName[];
  customSystemPrompt: string;
  builtIn: boolean;
  bashPolicy: InteractionModeBashPolicy;
  /** When true, the mode is configurable in settings but omitted from the chat selector. */
  hiddenInSelector: boolean;
  /** Marks experimental built-in modes shown in settings (for example Explore). */
  beta: boolean;
  /** Hex tint for the chat mode selector; null uses default muted styling. */
  selectorColor: string | null;
}

/** Default selector colors for built-in interaction modes. */
export const DEFAULT_INTERACTION_MODE_SELECTOR_COLORS: Record<
  BuiltInInteractionModeId,
  string | null
> = {
  Agent: null,
  Goal: "#22C55E",
  Explore: "#3B82F6",
  Edit: "#EF4444",
  Ask: "#EAB308",
};

/** Returns the default selector color for a base mode or goal orchestration. */
export function getDefaultInteractionModeSelectorColor(options: {
  baseMode: InteractionModeBase;
  orchestration: InteractionModeOrchestration;
}): string | null {
  if (options.orchestration === "goal") {
    return DEFAULT_INTERACTION_MODE_SELECTOR_COLORS.Goal;
  }
  const baseModeColors: Record<InteractionModeBase, string | null> = {
    Agent: DEFAULT_INTERACTION_MODE_SELECTOR_COLORS.Agent,
    Explore: DEFAULT_INTERACTION_MODE_SELECTOR_COLORS.Explore,
    Edit: DEFAULT_INTERACTION_MODE_SELECTOR_COLORS.Edit,
    Ask: DEFAULT_INTERACTION_MODE_SELECTOR_COLORS.Ask,
  };
  return baseModeColors[options.baseMode];
}

const LEGACY_INTERACTION_MODE_IDS: Record<string, BuiltInInteractionModeId> = {
  Research: "Explore",
};

/** Maps retired built-in mode ids to their replacements. */
export function normalizeInteractionModeId(modeId: string): string {
  return LEGACY_INTERACTION_MODE_IDS[modeId] ?? modeId;
}

export type SerializedInteractionModeConfig = Omit<
  InteractionModeConfig,
  "toolNames"
> & {
  toolNames: string[];
};

const BUILTIN_MODE_METADATA: Record<
  BuiltInInteractionModeId,
  Pick<
    InteractionModeConfig,
    | "id"
    | "label"
    | "description"
    | "baseMode"
    | "orchestration"
    | "builtIn"
    | "hiddenInSelector"
    | "beta"
  >
> = {
  Explore: {
    id: "Explore",
    label: "Explore",
    description:
      "Use for open-ended analysis where Orion should inspect evidence, compare possibilities, and decide what to investigate next.",
    baseMode: "Explore",
    orchestration: "normal",
    builtIn: true,
    hiddenInSelector: false,
    beta: false,
  },
  Agent: {
    id: "Agent",
    label: "Agent",
    description:
      "Use for most tasks where you want Orion to get things done, including coding, notebook work, debugging, and multi-step changes.",
    baseMode: "Agent",
    orchestration: "normal",
    builtIn: true,
    hiddenInSelector: false,
    beta: false,
  },
  Goal: {
    id: "Goal",
    label: "Goal",
    description:
      "Use when Agent should work toward measurable completion criteria and an independent supervisor should verify the result.",
    baseMode: "Agent",
    orchestration: "goal",
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
    orchestration: "normal",
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
    orchestration: "normal",
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
    selectorColor: DEFAULT_INTERACTION_MODE_SELECTOR_COLORS.Agent,
  },
  {
    ...BUILTIN_MODE_METADATA.Goal,
    toolNames: [...ORION_TOOL_NAMES],
    customSystemPrompt: "",
    bashPolicy: "full",
    selectorColor: DEFAULT_INTERACTION_MODE_SELECTOR_COLORS.Goal,
  },
  {
    ...BUILTIN_MODE_METADATA.Explore,
    toolNames: [...ORION_TOOL_NAMES],
    customSystemPrompt: "",
    bashPolicy: "full",
    selectorColor: DEFAULT_INTERACTION_MODE_SELECTOR_COLORS.Explore,
  },
  {
    ...BUILTIN_MODE_METADATA.Edit,
    toolNames: Object.keys(EDIT_MODE_TOOLS) as OrionToolName[],
    customSystemPrompt: "",
    bashPolicy: "full",
    selectorColor: DEFAULT_INTERACTION_MODE_SELECTOR_COLORS.Edit,
  },
  {
    ...BUILTIN_MODE_METADATA.Ask,
    toolNames: Object.keys(ASK_MODE_TOOLS) as OrionToolName[],
    customSystemPrompt: "",
    bashPolicy: "read_only",
    selectorColor: DEFAULT_INTERACTION_MODE_SELECTOR_COLORS.Ask,
  },
];

const DEFAULT_MODE_BY_ID = new Map(
  DEFAULT_INTERACTION_MODE_CONFIGS.map((mode) => [mode.id, mode]),
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
  id: BuiltInInteractionModeId = "Agent",
): InteractionModeConfig {
  return structuredClone(
    DEFAULT_MODE_BY_ID.get(id) ?? DEFAULT_INTERACTION_MODE_CONFIGS[0],
  );
}

/** True when a mode id is one of Orion's protected built-in modes. */
export function isBuiltInInteractionModeId(
  id: string,
): id is BuiltInInteractionModeId {
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

function parseBaseMode(
  value: unknown,
  fallback: InteractionModeBase,
): InteractionModeBase {
  const normalized =
    value === "Research" ? "Explore" : (value as InteractionModeBase);
  return INTERACTION_MODE_BASES.includes(normalized) ? normalized : fallback;
}

function parseBashPolicy(
  value: unknown,
  fallback: InteractionModeBashPolicy,
): InteractionModeBashPolicy {
  return value === "read_only" || value === "full" ? value : fallback;
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** True when two tool lists hold the same names, ignoring order. */
function isSameToolSet(
  toolNames: readonly OrionToolName[],
  other: readonly OrionToolName[],
): boolean {
  if (toolNames.length !== other.length) return false;
  const expected = new Set(other);
  return toolNames.every((toolName) => expected.has(toolName));
}

/** Upgrades an unchanged legacy Ask tool set while preserving user customizations. */
function normalizeBuiltInToolNames(
  id: BuiltInInteractionModeId,
  rawToolNames: unknown,
  defaults: OrionToolName[],
): OrionToolName[] {
  const normalized = normalizeToolNames(rawToolNames);
  if (
    id === "Ask" &&
    normalized.length === LEGACY_ASK_MODE_DEFAULT_TOOL_NAMES.length &&
    normalized.every(
      (toolName, index) =>
        toolName === LEGACY_ASK_MODE_DEFAULT_TOOL_NAMES[index],
    )
  ) {
    return defaults;
  }

  // Render inspection is a safe companion to read_cell_output and must remain
  // available in every built-in mode after upgrading persisted tool lists.
  if (
    normalized.includes("read_cell_output") &&
    !normalized.includes("inspect_output")
  ) {
    const readOutputIndex = normalized.indexOf("read_cell_output");
    normalized.splice(readOutputIndex + 1, 0, "inspect_output");
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

  // A tool list written before `ask_question` existed would leave the mode
  // unable to pause for a decision. Upgrade it only when it is otherwise the
  // exact previous default set, the same way the legacy Ask set is handled —
  // a list the user has actually edited stays as they left it.
  if (
    defaults.includes("ask_question") &&
    !normalized.includes("ask_question") &&
    isSameToolSet(
      normalized,
      defaults.filter((toolName) => toolName !== "ask_question"),
    )
  ) {
    return defaults;
  }
  return normalized;
}

function normalizeCustomMode(
  raw: Record<string, unknown>,
  usedIds: Set<string>,
): InteractionModeConfig | null {
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  if (!id || !label || isBuiltInInteractionModeId(id) || usedIds.has(id))
    return null;

  const baseMode = parseBaseMode(raw.baseMode, "Agent");
  const fallback = getDefaultInteractionModeConfig(baseMode);
  usedIds.add(id);
  return {
    id,
    label,
    description: typeof raw.description === "string" ? raw.description : "",
    baseMode,
    orchestration: "normal",
    toolNames: normalizeToolNames(raw.toolNames),
    customSystemPrompt:
      typeof raw.customSystemPrompt === "string" ? raw.customSystemPrompt : "",
    builtIn: false,
    bashPolicy: parseBashPolicy(raw.bashPolicy, fallback.bashPolicy),
    hiddenInSelector: parseBoolean(raw.hiddenInSelector, false),
    beta: parseBoolean(raw.beta, false),
    selectorColor: parseHexColorValue(
      raw.selectorColor,
      getDefaultInteractionModeSelectorColor({
        baseMode,
        orchestration: "normal",
      }),
    ),
  };
}

/** Repairs persisted mode settings and guarantees all built-ins are present. */
export function normalizeInteractionModeConfigs(
  rawModes: unknown,
): InteractionModeConfig[] {
  const rawList = Array.isArray(rawModes) ? rawModes : [];
  const result: InteractionModeConfig[] = [];
  const usedIds = new Set<string>();

  for (const builtinId of BUILTIN_INTERACTION_MODE_IDS) {
    const defaults = getDefaultInteractionModeConfig(builtinId);
    const raw = rawList.find((candidate) => {
      if (typeof candidate !== "object" || candidate === null) return false;
      const id = (candidate as Record<string, unknown>).id;
      if (typeof id !== "string") return false;
      return id === builtinId || normalizeInteractionModeId(id) === builtinId;
    }) as Record<string, unknown> | undefined;
    const capabilitiesAreConfigurable = defaults.orchestration === "normal";

    result.push({
      ...defaults,
      toolNames:
        raw && capabilitiesAreConfigurable
          ? normalizeBuiltInToolNames(
              builtinId,
              raw.toolNames,
              defaults.toolNames,
            )
          : defaults.toolNames,
      customSystemPrompt:
        raw &&
        capabilitiesAreConfigurable &&
        typeof raw.customSystemPrompt === "string"
          ? raw.customSystemPrompt
          : defaults.customSystemPrompt,
      bashPolicy:
        raw && capabilitiesAreConfigurable
          ? parseBashPolicy(raw.bashPolicy, defaults.bashPolicy)
          : defaults.bashPolicy,
      hiddenInSelector: raw
        ? parseBoolean(raw.hiddenInSelector, defaults.hiddenInSelector)
        : defaults.hiddenInSelector,
      beta: defaults.beta,
      orchestration: defaults.orchestration,
      selectorColor: raw
        ? parseHexColorValue(raw.selectorColor, defaults.selectorColor)
        : defaults.selectorColor,
    });
    usedIds.add(builtinId);
  }

  for (const candidate of rawList) {
    if (typeof candidate !== "object" || candidate === null) continue;
    const normalized = normalizeCustomMode(
      candidate as Record<string, unknown>,
      usedIds,
    );
    if (normalized) result.push(normalized);
  }

  return result;
}

/** Returns modes that should appear in the chat interaction mode selector. */
export function getSelectorInteractionModes(
  modes: InteractionModeConfig[],
): InteractionModeConfig[] {
  return modes.filter((mode) => !mode.hiddenInSelector);
}

/**
 * Keeps the requested mode when it is selector-visible; otherwise falls back to
 * the first visible mode (or Agent when none are visible).
 */
export function resolveSelectorInteractionModeId(
  modeId: string,
  modes: InteractionModeConfig[],
): string {
  const normalizedModeId = normalizeInteractionModeId(modeId);
  const selectorModes = getSelectorInteractionModes(modes);
  if (selectorModes.some((mode) => mode.id === normalizedModeId)) {
    return normalizedModeId;
  }
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
            ((options.requestConfig as Record<string, unknown>).id as
              string | undefined),
        )
      : null;

  if (
    requestConfig &&
    (!options.modeId || requestConfig.id === options.modeId)
  ) {
    return requestConfig;
  }

  const normalizedModeId = options.modeId
    ? normalizeInteractionModeId(options.modeId)
    : undefined;

  return (
    normalizedModes.find((mode) => mode.id === normalizedModeId) ??
    getDefaultInteractionModeConfig("Agent")
  );
}

/** Build the AI SDK tool object for a resolved mode. */
export function getToolsForInteractionMode(
  mode: InteractionModeConfig,
): Partial<typeof orionTools> {
  const toolNames = Array.from(new Set(mode.toolNames));
  return Object.fromEntries(
    toolNames
      .filter(isOrionToolName)
      .map((toolName) => [toolName, orionTools[toolName]]),
  ) as Partial<typeof orionTools>;
}
