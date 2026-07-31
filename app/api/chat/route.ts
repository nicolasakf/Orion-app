import { type ModelMessage } from "@ai-sdk/provider-utils";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import compactionSystemPrompt from "@/lib/agent/prompts/compaction-system-prompt.md";
import { z } from "zod";
import { generateBufferedText } from "@/lib/agent/buffered-text-generation.server";
import {
  getModelGateway,
  GatewayConfigError,
} from "@/lib/agent/model-gateway";
import { sanitizeTitleGenerationProviderOptions } from "@/lib/agent/non-streaming-provider-options";
import type { CredentialMode, ProviderId } from "@/lib/agent/model-gateway-types";
import { resolveProviderCredentialForModel } from "@/lib/credentials/provider-credential-store.server";
import { getModelCatalogEntry, isKnownProvider } from "@/lib/agent/model-catalog";
import { getMergedModelCatalogEntry } from "@/lib/agent/model-catalog.server";
import { isProviderSupported, getProviderAdapter } from "@/lib/agent/providers/registry";
import {
  decodeLocalModelCatalogId,
  getStaticLocalModelId,
  isLocalProvider,
} from "@/lib/agent/local-provider-models";
import { orionTools } from "@/lib/agent/tool-schemas";
import {
  getDefaultInteractionModeConfig,
  resolveInteractionModeConfig,
} from "@/lib/agent/interaction-modes";
import {
  calculateCostUsd,
  extractTokenBreakdown,
  type ModelPricing,
} from "@/lib/agent/cost-calculator";
import {
  getContextCalibration,
  insertModelUsage,
  resolveOrCreateChatSession,
  resolveOrCreateModelRequest,
  updateChatSessionStatus,
  updateContextCalibration,
} from "@/lib/chat/chat-sqlite-storage.server";
import {
  CONTEXT_ESTIMATOR_VERSION,
  measurePreparedPrompt,
} from "@/lib/agent/context-measurement.server";
import { ContextPreflightSettingsSchema } from "@/lib/agent/context-preflight";
import { getRuntimeModelProfile } from "@/lib/agent/model-runtime-profile.server";
import { calculateContextBudget } from "@/lib/agent/token-budget";
import {
  getVercelGenerationId,
  scheduleVercelGenerationReconciliation,
} from "@/lib/agent/vercel-generation.server";

import { prepareChatInvocation } from "@/lib/agent/prepare-chat-invocation.server";
import { AgentCommunicationStyleSchema, type AgentCommunicationStyle } from "@/lib/settings/schema";
import type { AgentRule } from "@/lib/agent/rules";
import { parseAgentRulesPayload } from "@/lib/agent/rules/request-schema";
import type { SubagentPromptPayload } from "@/lib/agent/subagents";
import type { JupyterServerInfo } from "@/lib/kernel/kernel-service";
import type { PlatformOS } from "@/lib/utils";
import {
  logChatRequest,
  logChatFinish,
  logChatError,
  logSessionStart,
  logLLMCall,
  logContextInject,
  subagentDevLogFileStem,
} from "@/lib/logging/dev-logger";
import {
  ChatMessageMetadataSchema,
  formatReferencesForMessage,
  type ResolvedChatReference,
} from "@/lib/chat/chat-references";
import { normalizeInlineDataUrlFileParts } from "@/lib/agent/model-message-files";
import {
  ResearchNudgeSchema,
  ResearchSessionSnapshotSchema,
} from "@/lib/agent/research-session";
import { resolveImplicitForcedSkillNames } from "@/lib/agent/implicit-skills";
import {
  buildChatApiErrorPayload,
  serializeChatApiErrorPayload,
} from "@/lib/chat/chat-api-errors";

/** Standard request duration limit in seconds */
export const maxDuration = 300;

function parseClientPlatformOs(raw: unknown): PlatformOS | undefined {
  if (raw === "macos" || raw === "windows" || raw === "linux" || raw === "unknown") {
    return raw;
  }
  return undefined;
}

/** Allows static catalog models plus per-endpoint local runtime model IDs. */
async function isAvailableModelSelection(
  providerId: ProviderId,
  modelId: string,
  credential: CredentialMode | undefined
): Promise<boolean> {
  if (await getMergedModelCatalogEntry(providerId, modelId)) return true;

  if (credential?.type !== "local_endpoint") {
    return false;
  }

  if (isLocalProvider(providerId)) {
    const decoded = decodeLocalModelCatalogId(modelId);
    return decoded?.provider === providerId && decoded.providerModelId === credential.modelId;
  }

  return (
    credential.modelId === modelId ||
    credential.models?.some((model) => model.enabled !== false && model.modelId === modelId) === true
  );
}

/** Uses the static local provider row for pricing when a runtime model is dynamic. */
async function getPricingCatalogModel(providerId: ProviderId, modelId: string): Promise<ModelPricing> {
  const catalogModel =
    (await getMergedModelCatalogEntry(providerId, modelId)) ??
    (isLocalProvider(providerId)
      ? getModelCatalogEntry(getStaticLocalModelId(providerId))
      : undefined);

  return catalogModel ?? {
    provider_id: providerId,
    input_price_per_1m: null,
    output_price_per_1m: null,
    cached_price_per_1m: null,
    cache_write_price_per_1m: null,
    long_context_threshold: null,
    long_context_input_price_per_1m: null,
    long_context_output_price_per_1m: null,
    long_context_cached_price_per_1m: null,
    long_context_cache_write_price_per_1m: null,
  };
}

/** True when this provider/model combination can safely force a specific tool. */
async function supportsForcedToolChoice(options: {
  providerId: ProviderId;
  modelId: string;
  credential: CredentialMode;
}): Promise<boolean> {
  const adapter = getProviderAdapter(options.providerId, options.credential);
  if (adapter?.capabilities.forcedToolChoice !== true) return false;

  const catalogEntry = await getMergedModelCatalogEntry(options.providerId, options.modelId);
  if (catalogEntry?.supports_forced_tool_choice === false) return false;
  return true;
}

async function handleChatRequest(
  req: Request,
  options: { preflight?: boolean } = {}
) {
  const requestId = crypto.randomUUID();
  const requestStartMs = Date.now();

  let body: {
    messages: unknown[];
    model: string;
    provider: string;
    agentMode?: boolean;
    /** Interaction mode from the chat UI — used to select tools and system prompt. */
    interactionMode?: string;
    /** Full selected interaction mode config from user settings. */
    interactionModeConfig?: unknown;
    chatId?: string;
    /** Active notebook path. Mutually exclusive with activeFilePath — only one may be set. */
    notebookPath?: string;
    /** Active non-notebook file path. Mutually exclusive with notebookPath — only one may be set. */
    activeFilePath?: string;
    /** Workspace directory relative to Jupyter root (injected into agent system prompt) */
    workspaceDirectory?: string;
    /** Absolute Jupyter root directory for local managed sessions. */
    rootDirectory?: string;
    /** Client-generated UUID shared across all LLM calls for the same user message turn. */
    modelRequestId?: string;
    /** "user" (default) or "title_generation" */
    origin?: string;
    /** Provider-specific model settings from the client popover */
    modelSettings?: Record<string, unknown>;
    /** Skills available in this session — injected into the agent system prompt */
    availableSkills?: Array<{ name: string; description: string; disableModelInvocation?: boolean }>;
    /** Notebook-defined subagents available in this session — injected into the agent system prompt */
    availableSubagents?: Array<{
      name: string;
      label?: string;
      description: string;
      options?: { model?: string; disableModelInvocation?: boolean };
    }>;
    /** AGENTS.md / CLAUDE.md rule files loaded for this workspace. */
    agentRules?: unknown;
    /** Skill selected via legacy slash command and enforced for this request turn */
    forcedSkillName?: string;
    /** Skills selected via slash command and enforced for this request turn */
    forcedSkillNames?: string[];
    /** Subagent selected via slash command and enforced for this request turn */
    forcedSubagentName?: string;
    /** Basic environment info from the connected Jupyter server */
    serverInfo?: JupyterServerInfo | null;
    /** Client: Jupyter server URL is loopback (localhost / 127.* / ::1) */
    jupyterServerIsLocal?: boolean;
    /** Browser-reported OS family from the Orion client */
    clientPlatformOs?: PlatformOS;
    /**
     * Legacy subagent prompt variant. Kept only for backward-compatible request
     * parsing; notebook-defined subagents use `subagentPrompt`.
     */
    agentPromptVariant?: string;
    /** Notebook-defined subagent prompt payload. Only accepted when origin === "subagent". */
    subagentPrompt?: SubagentPromptPayload;
    /** 1-based run index for this subagent type within the parent chat (dev log filename). */
    subagentDevLogInstance?: number;
    /** 0-based step within a subagent run; used to avoid repeating session banners in one log file. */
    subagentStepIndex?: number;
    /** For origin === "compaction": text of a prior compaction summary to extend. */
    previousSummaryText?: string;
    /** Communication style preset for the agent's response narration. */
    agentCommunicationStyle?: unknown;
    /** Custom communication instructions; overrides preset when non-empty. */
    agentCustomCommunicationStyle?: unknown;
    /** Lightweight notebook-native Research mode session state. */
    researchSession?: unknown;
    /** Soft steering instruction selected by the client loop. */
    researchNudge?: unknown;
    /** Client retry count for automatic continuations. */
    automaticContinuationAttempt?: unknown;
    /** Client-provided category for an automatic continuation. */
    automaticContinuationReason?: unknown;
    /** When true, the user is in Business View and only sees notebook App View. */
    businessExperienceMode?: boolean;
    /** Effective context settings used by preflight and runtime compaction. */
    contextSettings?: unknown;
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    if (req.signal.aborted) {
      return new Response(null, { status: 499 });
    }
    return new Response(
      JSON.stringify({
        title: "Invalid Request",
        message: "Request body was malformed or incomplete.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const {
    messages: rawMessages,
    model: modelId,
    provider: providerId,
    interactionMode: rawInteractionMode,
    interactionModeConfig: rawInteractionModeConfig,
    chatId,
    notebookPath,
    activeFilePath,
    workspaceDirectory,
    rootDirectory,
    modelRequestId: clientModelRequestId,
    origin,
    modelSettings,
    availableSkills,
    availableSubagents,
    agentRules: rawAgentRules,
    forcedSkillName: forcedSkillNameRaw,
    forcedSkillNames: forcedSkillNamesRaw,
    forcedSubagentName: forcedSubagentNameRaw,
    agentPromptVariant,
    subagentPrompt,
    serverInfo,
    jupyterServerIsLocal: jupyterServerIsLocalRaw,
    clientPlatformOs: clientPlatformOsRaw,
    subagentDevLogInstance: subagentDevLogInstanceRaw,
    subagentStepIndex: subagentStepIndexRaw,
    previousSummaryText,
    agentCommunicationStyle: rawAgentCommunicationStyle,
    agentCustomCommunicationStyle: rawAgentCustomCommunicationStyle,
    researchSession: researchSessionRaw,
    researchNudge: researchNudgeRaw,
    automaticContinuationAttempt: automaticContinuationAttemptRaw,
    automaticContinuationReason: automaticContinuationReasonRaw,
    businessExperienceMode: businessExperienceModeRaw,
    contextSettings: rawContextSettings,
  } = body;

  const parsedContextSettings = ContextPreflightSettingsSchema.safeParse(rawContextSettings ?? {});
  if (!parsedContextSettings.success) {
    return Response.json(
      { title: "Invalid Request", message: "Context settings are invalid." },
      { status: 400 }
    );
  }
  const contextSettings = parsedContextSettings.data;

  const parsedResearchSession = ResearchSessionSnapshotSchema.safeParse(researchSessionRaw);
  const researchSession =
    parsedResearchSession.success && parsedResearchSession.data.active
      ? parsedResearchSession.data
      : undefined;
  const parsedResearchNudge = ResearchNudgeSchema.safeParse(researchNudgeRaw);
  const researchNudge = parsedResearchNudge.success ? parsedResearchNudge.data : undefined;
  const automaticContinuationAttempt =
    typeof automaticContinuationAttemptRaw === "number" &&
    Number.isInteger(automaticContinuationAttemptRaw) &&
    automaticContinuationAttemptRaw > 0
      ? Math.min(automaticContinuationAttemptRaw, 20)
      : 0;
  const automaticContinuationReason =
    typeof automaticContinuationReasonRaw === "string"
      ? automaticContinuationReasonRaw.slice(0, 80)
      : "";
  const businessExperienceMode = businessExperienceModeRaw === true;

  const agentCommunicationStyle: AgentCommunicationStyle =
    AgentCommunicationStyleSchema.parse(rawAgentCommunicationStyle);
  const agentCustomCommunicationStyle =
    typeof rawAgentCustomCommunicationStyle === "string"
      ? rawAgentCustomCommunicationStyle.trim()
      : "";

  const resolvedCredential = await resolveProviderCredentialForModel(providerId, modelId);

  const jupyterServerIsLocal =
    typeof jupyterServerIsLocalRaw === "boolean" ? jupyterServerIsLocalRaw : undefined;
  const clientPlatformOs = parseClientPlatformOs(clientPlatformOsRaw);
  let agentRules: AgentRule[] = [];
  if (rawAgentRules !== undefined) {
    const parsedRules = parseAgentRulesPayload(rawAgentRules);
    if (parsedRules === null) {
      return new Response(
        JSON.stringify({
          title: "Invalid Request",
          message: "agentRules must be an array of valid AGENTS.md/CLAUDE.md rule payloads.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    agentRules = parsedRules;
  }

  const subagentDevLogInstance =
    typeof subagentDevLogInstanceRaw === "number" &&
      Number.isInteger(subagentDevLogInstanceRaw) &&
      subagentDevLogInstanceRaw >= 1
      ? subagentDevLogInstanceRaw
      : undefined;

  const subagentStepIndex =
    typeof subagentStepIndexRaw === "number" &&
      Number.isInteger(subagentStepIndexRaw) &&
      subagentStepIndexRaw >= 0
      ? subagentStepIndexRaw
      : undefined;

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;

  if (forcedSkillNameRaw !== undefined && typeof forcedSkillNameRaw !== "string") {
    return new Response(
      JSON.stringify({
        title: "Invalid Request",
        message: "forcedSkillName must be a string when provided.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (
    forcedSkillNamesRaw !== undefined &&
    (!Array.isArray(forcedSkillNamesRaw) ||
      forcedSkillNamesRaw.some((name) => typeof name !== "string"))
  ) {
    return new Response(
      JSON.stringify({
        title: "Invalid Request",
        message: "forcedSkillNames must be an array of strings when provided.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (forcedSubagentNameRaw !== undefined && typeof forcedSubagentNameRaw !== "string") {
    return new Response(
      JSON.stringify({
        title: "Invalid Request",
        message: "forcedSubagentName must be a string when provided.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const forcedSkillName =
    typeof forcedSkillNameRaw === "string" && forcedSkillNameRaw.trim().length > 0
      ? forcedSkillNameRaw.trim()
      : undefined;
  const explicitForcedSkillNames = Array.from(
    new Set([
      ...(forcedSkillName ? [forcedSkillName] : []),
      ...((Array.isArray(forcedSkillNamesRaw) ? forcedSkillNamesRaw : [])
        .map((name) => name.trim())
        .filter((name) => name.length > 0)),
    ])
  );
  const implicitForcedSkillNames = resolveImplicitForcedSkillNames({
    notebookPath,
    activeFilePath,
    origin,
  });
  const forcedSkillNames = Array.from(
    new Set([...explicitForcedSkillNames, ...implicitForcedSkillNames])
  );
  const forcedSubagentName =
    typeof forcedSubagentNameRaw === "string" && forcedSubagentNameRaw.trim().length > 0
      ? forcedSubagentNameRaw.trim()
      : undefined;
  // Resolve the actual mode capabilities before validating explicit tool selection.
  // Ask and custom modes may expose skills without exposing sub-agent delegation.
  const effectiveInteractionModeConfig =
    origin === "subagent"
      ? getDefaultInteractionModeConfig("Agent")
      : resolveInteractionModeConfig({
          modeId: rawInteractionMode,
          requestConfig: rawInteractionModeConfig,
        });
  const allowsForcedSkillSelection =
    effectiveInteractionModeConfig.toolNames.includes("load_skill");
  const allowsForcedSubagentSelection =
    effectiveInteractionModeConfig.toolNames.includes("delegate");

  if (explicitForcedSkillNames.length > 0 && !allowsForcedSkillSelection) {
    return new Response(
      JSON.stringify({
        title: "Invalid Request",
        message: "Skill enforcement requires a mode with skill loading enabled.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (forcedSubagentName && !allowsForcedSubagentSelection) {
    return new Response(
      JSON.stringify({
        title: "Invalid Request",
        message: "Sub-agent enforcement requires a mode with delegation enabled.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (explicitForcedSkillNames.length > 0) {
    const advertised = new Set((availableSkills ?? []).map((skill) => skill.name));
    const missingSkillName = explicitForcedSkillNames.find((skillName) => !advertised.has(skillName));
    if (missingSkillName) {
      return new Response(
        JSON.stringify({
          title: "Invalid Skill",
          message: `Skill "${missingSkillName}" is not available in this session.`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  if (forcedSubagentName) {
    const advertised = new Set((availableSubagents ?? []).map((subagent) => subagent.name));
    if (!advertised.has(forcedSubagentName)) {
      return new Response(
        JSON.stringify({
          title: "Invalid Sub-agent",
          message: `Sub-agent "${forcedSubagentName}" is not available in this session.`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  if (!Array.isArray(rawMessages) || rawMessages.some((m) => !isRecord(m))) {
    return new Response(
      JSON.stringify({
        title: "Invalid Request",
        message: "Messages must be an array of objects.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const rawMessageList = rawMessages as Array<Record<string, unknown>>;
  const referencesByMessageIndex = new Map<number, ResolvedChatReference[]>();
  for (const [index, rawMessage] of rawMessageList.entries()) {
    if (
      rawMessage.metadata === undefined ||
      typeof rawMessage.metadata !== "object" ||
      rawMessage.metadata === null ||
      !Object.prototype.hasOwnProperty.call(rawMessage.metadata, "references")
    ) {
      continue;
    }
    const parsedMetadata = ChatMessageMetadataSchema.safeParse(rawMessage.metadata);
    if (!parsedMetadata.success) {
      return new Response(
        JSON.stringify({
          title: "Invalid References",
          message: "Message reference metadata was malformed.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const references = parsedMetadata.data.references ?? [];
    if (rawMessage.role === "user" && references.length > 0) {
      referencesByMessageIndex.set(index, references);
    }
  }

  const rawMessagesForModel = rawMessageList.map((rawMessage, index) => {
    const references = referencesByMessageIndex.get(index);
    if (!references?.length) return rawMessage;

    const referencedContext = formatReferencesForMessage(references);
    if (!referencedContext) return rawMessage;

    if (Array.isArray(rawMessage.parts)) {
      return {
        ...rawMessage,
        parts: [
          ...rawMessage.parts,
          { type: "text", text: `\n\n${referencedContext}` },
        ],
      };
    }

    if (typeof rawMessage.content === "string") {
      return {
        ...rawMessage,
        content: `${rawMessage.content}\n\n${referencedContext}`,
      };
    }

    if (Array.isArray(rawMessage.content)) {
      return {
        ...rawMessage,
        content: [
          ...rawMessage.content,
          { type: "text", text: referencedContext },
        ],
      };
    }

    return rawMessage;
  });

  const allUiStyle = rawMessagesForModel.every((msg) => Array.isArray(msg.parts));
  const allModelStyle = rawMessagesForModel.every((msg) =>
    Object.prototype.hasOwnProperty.call(msg, "content")
  );

  let messages: ModelMessage[] = [];

  if (allUiStyle) {
    try {
      messages = await convertToModelMessages(
        rawMessagesForModel as Array<Omit<UIMessage, "id">>,
        { ignoreIncompleteToolCalls: true }
      );
    } catch {
      return new Response(
        JSON.stringify({
          title: "Invalid Request",
          message: "Messages could not be converted to model format.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
  } else if (allModelStyle) {
    messages = rawMessagesForModel as ModelMessage[];
  } else {
    return new Response(
      JSON.stringify({
        title: "Invalid Request",
        message: "Messages must consistently use either content or parts format.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  messages = normalizeInlineDataUrlFileParts(messages);

  /**
   * Whether prior messages already include a load_skill invocation for this skill.
   * If not, we force the first model step to call `load_skill`.
   */
  const hasLoadedSkillInHistory = (skillName: string): boolean => {
    const containsToolCall = (value: unknown): boolean => {
      if (Array.isArray(value)) return value.some(containsToolCall);
      if (!isRecord(value)) return false;

      const toolName = value.toolName;
      if (toolName === "load_skill") {
        const input = value.input;
        if (isRecord(input)) {
          return input.name === skillName;
        }
        return false;
      }

      return Object.values(value).some(containsToolCall);
    };

    return messages.some((message) => containsToolCall(message.content));
  };

  /** Whether prior messages already include a delegate invocation for this subagent. */
  const hasDelegatedSubagentInHistory = (subagentName: string): boolean => {
    const containsToolCall = (value: unknown): boolean => {
      if (Array.isArray(value)) return value.some(containsToolCall);
      if (!isRecord(value)) return false;

      const toolName = value.toolName;
      if (toolName === "delegate") {
        const input = value.input;
        if (isRecord(input)) {
          return input.subagent === subagentName;
        }
        return false;
      }

      return Object.values(value).some(containsToolCall);
    };

    return messages.some((message) => containsToolCall(message.content));
  };

  const fileId =
    origin === "subagent" && chatId && subagentDevLogInstance != null
      ? subagentDevLogFileStem({
        agentPromptVariant,
        subagentName: subagentPrompt?.name,
        instance: subagentDevLogInstance,
        parentChatId: chatId,
      })
      : chatId ?? `session-${requestId}`;

  const skipSubagentSessionBanner =
    origin === "subagent" &&
    subagentStepIndex != null &&
    subagentStepIndex > 0;

  if (!options.preflight && !skipSubagentSessionBanner) {
    logSessionStart(fileId);
  }

  const requestOrigin = origin ?? "user";
  const isByok =
    resolvedCredential?.type === "byok" ||
    resolvedCredential?.type === "chatgpt_oauth";

  const safeToken = (n: number | undefined | null): number | null =>
    n == null || !Number.isFinite(n) ? null : n;

  /** Stores one completed model call in the local usage tables. */
  const logLocalModelUsage = async (options: {
    resolvedModelRequestId: string | null;
    modelPricing: ModelPricing;
    usage: Parameters<typeof extractTokenBreakdown>[0];
    providerMetadata: Parameters<typeof extractTokenBreakdown>[1];
    estimatedInputTokens?: number | null;
    interactionMode?: string | null;
    estimatorVersion?: number | null;
  }): Promise<number | null> => {
    const tokensIn = safeToken(options.usage.inputTokens);
    const tokensOut = safeToken(options.usage.outputTokens);
    const tokenBreakdown =
      getProviderAdapter(providerId, resolvedCredential)?.normalizeUsage({
        usage: options.usage,
        providerMetadata: options.providerMetadata,
      }) ??
      extractTokenBreakdown(
        options.usage,
        options.providerMetadata,
        providerId
      );
    const costUsd = calculateCostUsd(options.modelPricing, tokenBreakdown);
    const gatewayGenerationId =
      providerId === "vercel"
        ? getVercelGenerationId(options.providerMetadata)
        : null;
    const costStatus = gatewayGenerationId
      ? "pending"
      : costUsd == null
        ? "unavailable"
        : "estimated";

    await insertModelUsage({
      requestId: options.resolvedModelRequestId,
      modelId,
      providerId,
      tokensIn,
      tokensOut,
      costUsd,
      cacheReadTokens: tokenBreakdown.cacheReadTokens,
      cacheCreationTokens: tokenBreakdown.cacheCreationTokens,
      reasoningTokens: tokenBreakdown.reasoningTokens,
      isByok,
      estimatedInputTokens: options.estimatedInputTokens,
      estimatedCostUsd: costUsd,
      costStatus,
      costSource: gatewayGenerationId
        ? "vercel_generation_pending"
        : "catalog_snapshot",
      gatewayGenerationId,
      credentialMode: resolvedCredential?.type ?? null,
      pricingSnapshot: options.modelPricing,
      interactionMode: options.interactionMode,
      estimatorVersion: options.estimatorVersion,
    });

    if (
      gatewayGenerationId &&
      providerId === "vercel" &&
      resolvedCredential?.type === "byok"
    ) {
      scheduleVercelGenerationReconciliation(
        gatewayGenerationId,
        resolvedCredential.apiKey
      );
    }

    return costUsd;
  };

  // Returns a plain JSON response using the caller's selected model and credential.
  if (!options.preflight && origin === "compaction") {
    if (!resolvedCredential) {
      return new Response(
        JSON.stringify({
          title: "Missing Credential",
          message: "Add a provider credential in Settings -> Providers before using chat compaction.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!isKnownProvider(providerId) && !isProviderSupported(providerId, resolvedCredential)) {
      return new Response(
        JSON.stringify({ title: "Invalid Provider", message: "The selected provider is not supported." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!(await isAvailableModelSelection(providerId, modelId, resolvedCredential))) {
      return new Response(
        JSON.stringify({ title: "Invalid Model", message: "The selected model is not available." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const catalogModel = await getPricingCatalogModel(providerId, modelId);

    const chatSession = await resolveOrCreateChatSession(chatId);
    const modelRequest = await resolveOrCreateModelRequest({
      origin: "compaction",
      chatSessionId: chatSession?.sessionId,
    });

    try {
      // Build model messages from the body's messages array
      let compactionMessages: ModelMessage[] = [];
      if (rawMessagesForModel.length > 0) {
        const rawList = rawMessagesForModel;
        const allUiStyle = rawList.every((m) => Array.isArray(m.parts));
        if (allUiStyle) {
          try {
            compactionMessages = await convertToModelMessages(
              rawList as Array<Omit<UIMessage, "id">>,
              { ignoreIncompleteToolCalls: true }
            );
          } catch {
            // fall through with empty messages
          }
        } else {
          compactionMessages = rawList as ModelMessage[];
        }
        compactionMessages = normalizeInlineDataUrlFileParts(compactionMessages);
      }

      // Prepend previous summary context if provided
      if (typeof previousSummaryText === "string" && previousSummaryText.trim()) {
        compactionMessages = [
          {
            role: "user",
            content: [{ type: "text", text: `Previous summary:\n${previousSummaryText}` }],
          } as ModelMessage,
          ...compactionMessages,
        ];
      }

      const gateway = getModelGateway();
      const {
        model,
        messages: processedCompactionMessages,
        providerOptions,
      } = gateway.processRequest({
        messages: compactionMessages,
        modelId,
        providerId,
        agentSystemPrompt: undefined,
        requestId,
        modelSettings: undefined,
        credentials: resolvedCredential,
      });

      const result = await generateBufferedText(
        {
          model,
          messages: processedCompactionMessages,
          system: compactionSystemPrompt as string,
          providerOptions: sanitizeTitleGenerationProviderOptions(providerOptions),
          maxOutputTokens: 1000,
        },
        resolvedCredential.type,
      );

      await logLocalModelUsage({
        resolvedModelRequestId: modelRequest.requestId,
        modelPricing: catalogModel,
        usage: result.usage,
        providerMetadata: result.providerMetadata,
      }).catch((error) => {
        console.error("Failed to log compaction usage:", error);
      });
      if (chatSession) {
        await updateChatSessionStatus(chatSession.sessionId, "completed").catch(
          (error) => {
            console.error("Failed to update compaction chat session:", error);
          }
        );
      }

      const summary = result.text.trim();
      const tokensUsed = result.usage?.inputTokens ?? 0;

      return new Response(
        JSON.stringify({ summary, tokensUsed }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } catch (error) {
      if (chatSession) {
        await updateChatSessionStatus(chatSession.sessionId, "error").catch(
          (sessionError) => {
            console.error("Failed to update compaction chat session:", sessionError);
          }
        );
      }
      console.error("Compaction error:", error);
      return new Response(
        JSON.stringify({ title: "Compaction Failed", message: "Failed to generate conversation summary." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  if (!resolvedCredential) {
    return new Response(
      JSON.stringify({
        title: "Missing Credential",
        message: "Add a provider credential in Settings -> Providers before starting a chat.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!isKnownProvider(providerId) && !isProviderSupported(providerId, resolvedCredential)) {
    return new Response(
      JSON.stringify({ title: "Invalid Provider", message: "The selected provider is not supported." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!(await isAvailableModelSelection(providerId, modelId, resolvedCredential))) {
    return new Response(
      JSON.stringify({
        title: "Invalid Model",
        message: "The selected model is not available.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  const catalogModel = await getPricingCatalogModel(providerId, modelId);
  const canForceToolChoice = await supportsForcedToolChoice({
    providerId,
    modelId,
    credential: resolvedCredential,
  });

  if (!options.preflight && origin === "title_generation") {
    const chatSession = await resolveOrCreateChatSession(chatId);
    const modelRequest = await resolveOrCreateModelRequest({
      origin: "title_generation",
      chatSessionId: chatSession?.sessionId,
    });

    try {
      const gateway = getModelGateway();
      const { model, messages: processedMessages, providerOptions } =
        gateway.processRequest({
          messages,
          modelId,
          providerId,
          agentSystemPrompt: undefined,
          requestId,
          modelSettings: undefined,
          credentials: resolvedCredential,
        });

      const result = await generateBufferedText(
        {
          model,
          messages: processedMessages,
          providerOptions: sanitizeTitleGenerationProviderOptions(providerOptions),
          maxOutputTokens: 48,
        },
        resolvedCredential.type,
      );

      await logLocalModelUsage({
        resolvedModelRequestId: modelRequest.requestId,
        modelPricing: catalogModel,
        usage: result.usage,
        providerMetadata: result.providerMetadata,
      }).catch((error) => {
        console.error("Failed to log title generation usage:", error);
      });

      if (chatSession) {
        await updateChatSessionStatus(chatSession.sessionId, "completed").catch(
          (error) => {
            console.error("Failed to update title generation chat session:", error);
          }
        );
      }

      return new Response(
        JSON.stringify({ title: result.text.trim() }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } catch (error) {
      if (chatSession) {
        await updateChatSessionStatus(chatSession.sessionId, "error").catch(
          (sessionError) => {
            console.error("Failed to update errored title generation chat session:", sessionError);
          }
        );
      }
      console.error("Title generation error:", error);
      return new Response(
        JSON.stringify({
          title: "Title Generation Failed",
          message: "Failed to generate a chat title.",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  const effectiveMode = effectiveInteractionModeConfig.baseMode;
  const enableSkills = effectiveInteractionModeConfig.toolNames.includes("load_skill");
  const missingForcedSkillNames =
    enableSkills
      ? forcedSkillNames.filter((skillName) => !hasLoadedSkillInHistory(skillName))
      : [];

  const chatSession = options.preflight ? null : await resolveOrCreateChatSession(chatId);
  const modelRequest = options.preflight
    ? null
    : await resolveOrCreateModelRequest({
        id: requestOrigin === "user" ? clientModelRequestId : undefined,
        origin: requestOrigin,
        chatSessionId: chatSession?.sessionId,
      });

  // Log the full incoming request (messages + context metadata)
  if (!options.preflight) logChatRequest({
    fileId,
    requestId,
    userId: "local",
    model: modelId,
    provider: providerId,
    agentMode: effectiveMode === "Research" || effectiveMode === "Agent",
    messageCount: messages.length,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    modelSettings: modelSettings ?? null,
    contextMeta: effectiveMode !== "Ask"
      ? {
        notebookPath: notebookPath ?? null,
        activeFilePath: activeFilePath ?? null,
        workspaceDirectory: workspaceDirectory ?? null,
        rootDirectory: rootDirectory ?? null,
      }
      : null,
  });

  try {
    const {
      model,
      messages: processedMessages,
      providerOptions,
      agentSystemPrompt,
      tools: toolsForMode,
      toolChoice: forcedToolChoice,
    } = prepareChatInvocation({
      messages,
      modelId,
      providerId,
      credential: resolvedCredential,
      requestId,
      modelSettings,
      interactionMode: effectiveInteractionModeConfig,
      origin,
      subagentPrompt,
      notebookPath,
      activeFilePath,
      rootDirectory,
      workspaceDirectory,
      availableSkills,
      availableSubagents,
      agentRules,
      missingForcedSkillNames,
      forcedSubagentName,
      serverInfo,
      jupyterServerIsLocal,
      clientPlatformOs,
      communicationStyle: agentCommunicationStyle,
      customCommunicationStyle: agentCustomCommunicationStyle,
      businessExperienceMode,
      researchSession,
      researchNudge,
      automaticContinuationAttempt,
      automaticContinuationReason,
      canForceToolChoice,
      hasDelegatedForcedSubagent:
        forcedSubagentName != null && hasDelegatedSubagentInHistory(forcedSubagentName),
    });

    // Preflight prepares the same context but must not create model-call dev logs.
    if (!options.preflight) {
      logContextInject({
        fileId,
        requestId,
        provider: providerId,
        model: modelId,
        supportsSystemMessages: processedMessages.some((m) => m.role === "system"),
        hasAgentPrompt: !!agentSystemPrompt,
        agentPromptLength: agentSystemPrompt?.length ?? 0,
        finalSystemContentLength:
          processedMessages
            .filter((m) => m.role === "system")
            .reduce((acc, m) => acc + (typeof m.content === "string" ? m.content.length : 0), 0),
        injectionStrategy: processedMessages.some((m) => m.role === "system")
          ? "system_message"
          : agentSystemPrompt
            ? "prepend_user"
            : "none",
      });
    }

    const runtimeProfile = await getRuntimeModelProfile(providerId, modelId);
    const budget = calculateContextBudget({
      contextWindow: runtimeProfile.contextWindow,
      maxOutputTokens: runtimeProfile.maxOutputTokens,
      autoCompactThreshold: contextSettings.compactionAutoThreshold,
    });
    const calibrationKey = {
      providerId,
      modelId,
      interactionMode: effectiveInteractionModeConfig.id,
      estimatorVersion: CONTEXT_ESTIMATOR_VERSION,
    };
    const calibration = await getContextCalibration(calibrationKey);
    const promptMeasurement = await measurePreparedPrompt({
      messages: processedMessages,
      tools: toolsForMode,
      calibration,
    });

    if (options.preflight) {
      const status =
        promptMeasurement.estimatedInputTokens >= budget.usableInputTokens
          ? "over"
          : promptMeasurement.estimatedInputTokens >= budget.thresholdTokens
            ? "compact"
            : "ok";
      return Response.json({
        version: 1,
        model: runtimeProfile,
        budget: {
          ...budget,
          autoCompactThreshold: contextSettings.compactionAutoThreshold,
        },
        measurement: {
          ...promptMeasurement,
          percentUsed:
            promptMeasurement.estimatedInputTokens / budget.usableInputTokens,
          status,
        },
      });
    }

    logLLMCall({
      fileId,
      requestId,
      model: modelId,
      provider: providerId,
      agentMode: effectiveMode === "Research" || effectiveMode === "Agent",
      processedMessageCount: processedMessages.length,
      processedMessages: processedMessages.map((m) => ({ role: m.role, content: m.content })),
      hasTools: true,
      maxSteps: 1,
    });

    const result = streamText({
      model,
      messages: processedMessages,
      providerOptions,
      // Pass the mode-appropriate tool subset.
      // Cast to orionTools type so toolChoice can reference enforced tools across modes;
      // forced tool choices are already false in Ask mode.
      tools: toolsForMode as typeof orionTools,
      toolChoice: forcedToolChoice,
      onFinish: async ({ usage, providerMetadata }) => {
        const durationMs = Date.now() - requestStartMs;

        const tokensIn = safeToken(usage.inputTokens);
        const tokensOut = safeToken(usage.outputTokens);
        let costUsd: number | null = null;
        try {
          costUsd = await logLocalModelUsage({
            resolvedModelRequestId: modelRequest?.requestId ?? null,
            modelPricing: catalogModel,
            usage,
            providerMetadata,
            estimatedInputTokens: promptMeasurement.estimatedInputTokens,
            interactionMode: effectiveInteractionModeConfig.id,
            estimatorVersion: CONTEXT_ESTIMATOR_VERSION,
          });
          if (tokensIn != null) {
            await updateContextCalibration(calibrationKey, {
              rawEstimatedTokens: promptMeasurement.rawInputTokens,
              actualInputTokens: tokensIn,
            });
          }
          if (chatSession) {
            await updateChatSessionStatus(chatSession.sessionId, "completed");
          }
        } catch (error) {
          console.error("Failed to log usage:", error);
        }

        logChatFinish({
          fileId,
          requestId,
          model: modelId,
          provider: providerId,
          promptTokens: tokensIn ?? 0,
          completionTokens: tokensOut ?? 0,
          totalTokens: (tokensIn ?? 0) + (tokensOut ?? 0),
          durationMs,
          costUsd,
        });
      },
      onError: (error) => {
        if (chatSession) {
          void updateChatSessionStatus(chatSession.sessionId, "error").catch(
            (sessionError) => {
              console.error("Failed to update errored chat session:", sessionError);
            }
          );
        }
        logChatError({
          fileId,
          requestId,
          model: modelId,
          provider: providerId,
          error,
          phase: "stream",
        });
        console.error("Error streaming text:", error);
      },
    });

    return result.toUIMessageStreamResponse({
      sendReasoning: true,
      onError: (error) =>
        serializeChatApiErrorPayload(buildChatApiErrorPayload(error, providerId)),
    });
  } catch (error: unknown) {
    if (chatSession) {
      await updateChatSessionStatus(chatSession.sessionId, "error").catch(
        (sessionError) => {
          console.error("Failed to update errored chat session:", sessionError);
        }
      );
    }
    if (!options.preflight) {
      logChatError({
        fileId,
        requestId,
        model: modelId,
        provider: providerId,
        error,
        phase: error instanceof GatewayConfigError ? "gateway" : "unknown",
      });
    }
    console.error(error);
    if (error instanceof GatewayConfigError) {
      return new Response(
        JSON.stringify({
          title: "Configuration Error",
          message: error.message,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const payload = buildChatApiErrorPayload(error, providerId);
    const statusCode =
      error !== null &&
      typeof error === "object" &&
      ("status" in error || "statusCode" in error)
        ? ((error as { status?: number; statusCode?: number }).statusCode ??
          (error as { status?: number }).status ??
          500)
        : 500;

    return new Response(JSON.stringify(payload), {
      status: statusCode,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/** Handles a normal model invocation. */
export async function POST(req: Request): Promise<Response> {
  return handleChatRequest(req, {
    preflight: req.headers.get("x-orion-context-preflight") === "1",
  });
}
