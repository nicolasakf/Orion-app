import {
  ASK_MODE_TOOLS,
  EDIT_MODE_TOOLS,
  ORION_TOOL_NAMES,
  isOrionToolName,
  orionTools,
  type OrionToolName,
} from "@/lib/agent/tool-schemas";

export const BUILTIN_INTERACTION_MODE_IDS = ["Agent", "Ask", "Edit"] as const;
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
}

export type SerializedInteractionModeConfig = Omit<InteractionModeConfig, "toolNames"> & {
  toolNames: string[];
};

const BUILTIN_MODE_METADATA: Record<
  BuiltInInteractionModeId,
  Pick<InteractionModeConfig, "id" | "label" | "description" | "baseMode" | "builtIn">
> = {
  Agent: {
    id: "Agent",
    label: "Agent",
    description:
      "Full autonomy. Executes code, edits files, runs terminal commands, and spawns sub-agents.",
    baseMode: "Agent",
    builtIn: true,
  },
  Ask: {
    id: "Ask",
    label: "Ask",
    description:
      "Read-only access. Reads files and notebooks, and runs read-only terminal commands. Cannot modify anything.",
    baseMode: "Ask",
    builtIn: true,
  },
  Edit: {
    id: "Edit",
    label: "Edit",
    description:
      "File and terminal access. Edits files and runs terminal commands freely, but cannot execute notebook cells.",
    baseMode: "Edit",
    builtIn: true,
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
    ...BUILTIN_MODE_METADATA.Ask,
    toolNames: Object.keys(ASK_MODE_TOOLS) as OrionToolName[],
    customSystemPrompt: "",
    bashPolicy: "read_only",
  },
  {
    ...BUILTIN_MODE_METADATA.Edit,
    toolNames: Object.keys(EDIT_MODE_TOOLS) as OrionToolName[],
    customSystemPrompt: "",
    bashPolicy: "full",
  },
];

const DEFAULT_MODE_BY_ID = new Map(
  DEFAULT_INTERACTION_MODE_CONFIGS.map((mode) => [mode.id, mode])
);

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
      toolNames: raw ? normalizeToolNames(raw.toolNames) : defaults.toolNames,
      customSystemPrompt:
        raw && typeof raw.customSystemPrompt === "string"
          ? raw.customSystemPrompt
          : defaults.customSystemPrompt,
      bashPolicy: raw ? parseBashPolicy(raw.bashPolicy, defaults.bashPolicy) : defaults.bashPolicy,
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
  return Object.fromEntries(
    mode.toolNames
      .filter(isOrionToolName)
      .map((toolName) => [toolName, orionTools[toolName]])
  ) as Partial<typeof orionTools>;
}

