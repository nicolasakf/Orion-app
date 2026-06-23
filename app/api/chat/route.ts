import { type ModelMessage } from "@ai-sdk/provider-utils";
import { convertToModelMessages, generateText, streamText, type UIMessage } from "ai";
import compactionSystemPrompt from "@/lib/agent/prompts/compaction-system-prompt.md";
import { z } from "zod";
import {
  getModelGateway,
  GatewayConfigError,
} from "@/lib/agent/model-gateway";
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
  getToolsForInteractionMode,
  resolveInteractionModeConfig,
} from "@/lib/agent/interaction-modes";
import {
  calculateCostUsd,
  extractTokenBreakdown,
  type ModelPricing,
} from "@/lib/agent/cost-calculator";
import {
  insertModelUsage,
  resolveOrCreateChatSession,
  resolveOrCreateModelRequest,
  updateChatSessionStatus,
} from "@/lib/chat/chat-sqlite-storage.server";

import {
  buildAgentSystemPrompt,
  buildAskModeSystemPrompt,
  buildEditModeSystemPrompt,
  buildAgentEnvironmentContextPrompt,
  buildSubagentSystemPrompt,
} from "@/lib/agent/agent-system-prompt";
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
  DeepEdaStateSnapshotSchema,
  getDeepEdaPhase,
  summarizeDeepEdaState,
} from "@/lib/agent/deep-eda";
import { resolveImplicitForcedSkillNames } from "@/lib/agent/implicit-skills";

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
    long_context_threshold: null,
    long_context_input_price_per_1m: null,
    long_context_output_price_per_1m: null,
  };
}

export async function POST(req: Request) {
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
    /** True while the user-approved exhaustive EDA controller is active. */
    deepEdaActive?: boolean;
    /** Current investigation ledger for the active exhaustive EDA run. */
    deepEdaState?: unknown;
    /** Agent-generated raster outputs that must be inspected before any other action. */
    pendingVisualInspectionIds?: string[];
    /** Inspected raster outputs that require a corrected replacement before finishing. */
    visualRevisionRequiredIds?: string[];
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
    agentMode,
    interactionMode: rawInteractionMode,
    interactionModeConfig: rawInteractionModeConfig,
    chatId,
    notebookPath,
    activeFilePath,
    workspaceDirectory,
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
    deepEdaActive: deepEdaActiveRaw,
    deepEdaState: deepEdaStateRaw,
    pendingVisualInspectionIds: pendingVisualInspectionIdsRaw,
    visualRevisionRequiredIds: visualRevisionRequiredIdsRaw,
  } = body;

  const deepEdaActive = deepEdaActiveRaw === true;
  const parsedDeepEdaState = DeepEdaStateSnapshotSchema.safeParse(deepEdaStateRaw);
  const deepEdaState = parsedDeepEdaState.success ? parsedDeepEdaState.data : undefined;
  const pendingVisualInspectionIds = Array.isArray(pendingVisualInspectionIdsRaw)
    ? pendingVisualInspectionIdsRaw.filter(
        (value): value is string => typeof value === "string" && value.length > 0
      )
    : [];
  const visualRevisionRequiredIds = Array.isArray(visualRevisionRequiredIdsRaw)
    ? visualRevisionRequiredIdsRaw.filter(
        (value): value is string => typeof value === "string" && value.length > 0
      )
    : [];

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
  const allowsForcedToolSelection = agentMode || rawInteractionMode === "Edit";

  if (explicitForcedSkillNames.length > 0 && !allowsForcedToolSelection) {
    return new Response(
      JSON.stringify({
        title: "Invalid Request",
        message: "Skill enforcement requires Agent or Edit mode.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (forcedSubagentName && !allowsForcedToolSelection) {
    return new Response(
      JSON.stringify({
        title: "Invalid Request",
        message: "Sub-agent enforcement requires Agent or Edit mode.",
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

  if (!skipSubagentSessionBanner) {
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
    });

    return costUsd;
  };

  // Returns a plain JSON response using the caller's selected model and credential.
  if (origin === "compaction") {
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
      const gateway = getModelGateway();
      const { model } = gateway.processRequest({
        messages: [],
        modelId,
        providerId,
        agentSystemPrompt: undefined,
        requestId,
        modelSettings: undefined,
        credentials: resolvedCredential,
      });

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

      const result = await generateText({
        model,
        messages: compactionMessages,
        system: compactionSystemPrompt as string,
        maxOutputTokens: 1000,
      });

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

  if (origin === "title_generation") {
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

      const result = await generateText({
        model,
        messages: processedMessages,
        providerOptions,
        maxOutputTokens: 48,
      });

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

  // Derive effective mode early so it's available for logging and the request handler.
  // Sub-agent requests always behave as full Agent mode regardless of what the UI sent.
  const effectiveInteractionModeConfig =
    origin === "subagent"
      ? getDefaultInteractionModeConfig("Agent")
      : resolveInteractionModeConfig({
          modeId: rawInteractionMode,
          requestConfig: rawInteractionModeConfig,
        });
  const effectiveMode = effectiveInteractionModeConfig.baseMode;
  const enableSkills = effectiveInteractionModeConfig.toolNames.includes("load_skill");
  const enableSubagents = effectiveInteractionModeConfig.toolNames.includes("delegate");
  const missingForcedSkillNames =
    enableSkills
      ? forcedSkillNames.filter((skillName) => !hasLoadedSkillInHistory(skillName))
      : [];

  const chatSession = await resolveOrCreateChatSession(chatId);
  const modelRequest = await resolveOrCreateModelRequest({
    id: requestOrigin === "user" ? clientModelRequestId : undefined,
    origin: requestOrigin,
    chatSessionId: chatSession?.sessionId,
  });

  // Log the full incoming request (messages + context metadata)
  logChatRequest({
    fileId,
    requestId,
    userId: "local",
    model: modelId,
    provider: providerId,
    agentMode: effectiveMode === "Agent",
    messageCount: messages.length,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    modelSettings: modelSettings ?? null,
    contextMeta: effectiveMode !== "Ask"
      ? { notebookPath: notebookPath ?? null, activeFilePath: activeFilePath ?? null, workspaceDirectory: workspaceDirectory ?? null }
      : null,
  });

  try {
    const gateway = getModelGateway();

    // Build the system prompt for this request.
    //
    // - Agent / sub-agent: full agent prompt
    // - Ask: read-only tool prompt (no skills, no delegation)
    // - Edit: file/terminal prompt with skills and delegation but no cell execution
    //
    // Sub-agent steps pass `subagentPrompt` (with `origin: "subagent"`) to
    // request a notebook-defined sub-agent system prompt instead of the main
    // parent prompt.
    let agentSystemPrompt: string | undefined;
    if (effectiveMode === "Agent") {
      if (origin === "subagent" && subagentPrompt) {
        const envContext = buildAgentEnvironmentContextPrompt({
          serverInfo,
          jupyterServerIsLocal,
          clientPlatformOs,
          workspaceDirectory,
          notebookPath,
          activeFilePath,
        });
        agentSystemPrompt = buildSubagentSystemPrompt({
          subagent: subagentPrompt,
          envContext,
          agentRules,
          forcedSkillNames: missingForcedSkillNames,
        });
      } else {
        agentSystemPrompt = buildAgentSystemPrompt({
          notebookPath,
          activeFilePath,
          workspaceDirectory,
          availableSkills,
          availableSubagents,
          agentRules,
          forcedSkillNames: missingForcedSkillNames,
          forcedSubagentName,
          serverInfo,
          jupyterServerIsLocal,
          clientPlatformOs,
          communicationStyle: agentCommunicationStyle,
          customCommunicationStyle: agentCustomCommunicationStyle,
          customSystemPrompt: effectiveInteractionModeConfig.customSystemPrompt,
          enableSkills,
          enableSubagents,
        });
      }
    } else if (effectiveMode === "Ask") {
      agentSystemPrompt = buildAskModeSystemPrompt({
        notebookPath,
        activeFilePath,
        workspaceDirectory,
        agentRules,
        serverInfo,
        jupyterServerIsLocal,
        clientPlatformOs,
        communicationStyle: agentCommunicationStyle,
        customCommunicationStyle: agentCustomCommunicationStyle,
        customSystemPrompt: effectiveInteractionModeConfig.customSystemPrompt,
      });
    } else if (effectiveMode === "Edit") {
      agentSystemPrompt = buildEditModeSystemPrompt({
        notebookPath,
        activeFilePath,
        workspaceDirectory,
        availableSkills,
        availableSubagents,
        agentRules,
        forcedSkillNames: missingForcedSkillNames,
        forcedSubagentName,
        serverInfo,
        jupyterServerIsLocal,
        clientPlatformOs,
        communicationStyle: agentCommunicationStyle,
        customCommunicationStyle: agentCustomCommunicationStyle,
        customSystemPrompt: effectiveInteractionModeConfig.customSystemPrompt,
        enableSkills,
        enableSubagents,
      });
    }
    if (deepEdaActive && effectiveMode === "Agent" && agentSystemPrompt) {
      const deepEdaPhase = getDeepEdaPhase({
        active: true,
        state: deepEdaState,
        pendingVisualIds: pendingVisualInspectionIds,
        revisionRequiredIds: visualRevisionRequiredIds,
      });
      const activationInstruction = missingForcedSkillNames.includes("deep-eda")
        ? "Activation is already complete. Load the required deep-EDA skill in this step; after it returns, do not load it again and do not call `begin_deep_eda`."
        : "Activation and skill loading are already complete. Do not call `begin_deep_eda` and do not reload the deep-EDA skill.";
      agentSystemPrompt += `\n\n## Active Deep EDA Controller\n\nPhase: \`${deepEdaPhase}\`. ${activationInstruction} Take the next concrete analytical action after any required skill load. Orion will continue the run after prose-only turns, but prose cannot complete it. Finish only when \`complete_deep_eda\` is accepted.\n\n${summarizeDeepEdaState(deepEdaState)}`;
    }
    // Process request through the gateway (injects agent system prompt into messages)
    const { model, messages: processedMessages, providerOptions } = gateway.processRequest({
      messages,
      modelId,
      providerId,
      agentSystemPrompt,
      requestId,
      modelSettings,
      credentials: resolvedCredential,
    });

    // Log the context injection details and final LLM call
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

    const missingForcedSkillName = missingForcedSkillNames[0];
    const shouldForceLoadSkill = !!missingForcedSkillName;
    const shouldForceDelegate =
      !!(enableSubagents && forcedSubagentName && !hasDelegatedSubagentInHistory(forcedSubagentName));
    const deepEdaPhase = getDeepEdaPhase({
      active: deepEdaActive,
      state: deepEdaState,
      pendingVisualIds: pendingVisualInspectionIds,
      revisionRequiredIds: visualRevisionRequiredIds,
    });
    const toolsForMode = Object.fromEntries(
      Object.entries(getToolsForInteractionMode(effectiveInteractionModeConfig)).filter(([toolName]) => {
        if (effectiveMode !== "Agent") return true;
        if (toolName === "load_skill" && deepEdaActive && !shouldForceLoadSkill) return false;
        if (toolName === "begin_deep_eda") return !deepEdaActive;
        if (toolName === "record_visual_inspection") {
          return pendingVisualInspectionIds.length > 0;
        }
        if (toolName === "update_deep_eda_state") return deepEdaActive;
        if (toolName === "complete_deep_eda") return deepEdaPhase === "synthesizing";
        return true;
      })
    ) as ReturnType<typeof getToolsForInteractionMode>;
    const forcedToolChoice = shouldForceDelegate
      ? { type: "tool" as const, toolName: "delegate" as const }
      : shouldForceLoadSkill
        ? { type: "tool" as const, toolName: "load_skill" as const }
        : pendingVisualInspectionIds.length > 0 && effectiveMode === "Agent"
          ? { type: "tool" as const, toolName: "record_visual_inspection" as const }
          : visualRevisionRequiredIds.length > 0 && !deepEdaActive && effectiveMode === "Agent"
            ? "required" as const
            : "auto";

    logLLMCall({
      fileId,
      requestId,
      model: modelId,
      provider: providerId,
      agentMode: effectiveMode === "Agent",
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
            resolvedModelRequestId: modelRequest.requestId,
            modelPricing: catalogModel,
            usage,
            providerMetadata,
          });
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
    });
  } catch (error: unknown) {
    if (chatSession) {
      await updateChatSessionStatus(chatSession.sessionId, "error").catch(
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
      phase: error instanceof GatewayConfigError ? "gateway" : "unknown",
    });
    console.error(error);
    let statusCode = 500;
    let title = "API Error";
    let message =
      "An unexpected error occurred. Please check the server logs for more details.";

    if (error instanceof GatewayConfigError) {
      statusCode = 400;
      title = "Configuration Error";
      message = error.message;
    } else if (
      error !== null &&
      typeof error === "object" &&
      ("name" in error || "constructor" in error)
    ) {
      const err = error as { name?: string; constructor?: { name?: string }; status?: number; message?: string };
      if (err.name === "AIError" || err.constructor?.name?.includes("APIError")) {
        statusCode = err.status ?? 400;
        title = err.name ?? "API Error";
        message = err.message ?? message;

        if (statusCode === 401) {
          title = "Authentication Error";
          message = `The ${providerId} credential is invalid or expired. Update it in Settings -> Providers.`;
        } else if (statusCode === 429) {
          title = "Rate Limit Exceeded";
          message = `The ${providerId} provider rate limit was exceeded.`;
        }
      }
    }

    return new Response(JSON.stringify({ title, message }), {
      status: statusCode,
      headers: { "Content-Type": "application/json" },
    });
  }
}
