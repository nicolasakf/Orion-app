import { type ModelMessage } from "@ai-sdk/provider-utils";
import { convertToModelMessages, generateText, streamText, type UIMessage } from "ai";
import compactionSystemPrompt from "@/lib/agent/prompts/compaction-system-prompt.md";
import { z } from "zod";
import {
  getModelGateway,
  GatewayConfigError,
} from "@/lib/agent/model-gateway";
import type { CredentialMode, SupportedProvider } from "@/lib/agent/model-gateway-types";
import { getModelCatalogEntry, isKnownProvider } from "@/lib/agent/model-catalog";
import { orionTools, ASK_MODE_TOOLS, EDIT_MODE_TOOLS } from "@/lib/agent/tool-schemas";

// ── Zod schema for user-provided credentials (BYOK or ChatGPT OAuth) ──────────
// Must mirror ProviderCredentialSchema in lib/settings/schema.ts.
const UserCredentialSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("api_key"), apiKey: z.string().min(1) }),
  z.object({
    type: z.literal("chatgpt_oauth"),
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
    expiresAt: z.number(),
    accountId: z.string().optional(),
  }),
  z.object({
    type: z.literal("local_endpoint"),
    baseUrl: z.string().min(1),
    modelId: z.string().min(1),
    label: z.string().optional(),
    apiKey: z.string().optional(),
  }),
]);
import {
  buildAgentSystemPrompt,
  buildAskModeSystemPrompt,
  buildEditModeSystemPrompt,
  buildAgentEnvironmentContextPrompt,
  buildSubagentSystemPrompt,
} from "@/lib/agent/agent-system-prompt";
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

/** Standard request duration limit in seconds */
export const maxDuration = 300;

function parseClientPlatformOs(raw: unknown): PlatformOS | undefined {
  if (raw === "macos" || raw === "windows" || raw === "linux" || raw === "unknown") {
    return raw;
  }
  return undefined;
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
    chatId?: string;
    /** Active notebook path. Mutually exclusive with activeFilePath — only one may be set. */
    notebookPath?: string;
    /** Active non-notebook file path. Mutually exclusive with notebookPath — only one may be set. */
    activeFilePath?: string;
    /** Workspace directory relative to Jupyter root (injected into agent system prompt) */
    workspaceDirectory?: string;
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
    /** Skill selected via slash command and enforced for this request turn */
    forcedSkillName?: string;
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
    /** User-provided credential for BYOK or ChatGPT OAuth mode. */
    userCredential?: unknown;
    /** For origin === "compaction": text of a prior compaction summary to extend. */
    previousSummaryText?: string;
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
    chatId,
    notebookPath,
    activeFilePath,
    workspaceDirectory,
    origin,
    modelSettings,
    availableSkills,
    availableSubagents,
    forcedSkillName: forcedSkillNameRaw,
    forcedSubagentName: forcedSubagentNameRaw,
    agentPromptVariant,
    subagentPrompt,
    serverInfo,
    jupyterServerIsLocal: jupyterServerIsLocalRaw,
    clientPlatformOs: clientPlatformOsRaw,
    subagentDevLogInstance: subagentDevLogInstanceRaw,
    subagentStepIndex: subagentStepIndexRaw,
    userCredential: rawUserCredential,
    previousSummaryText,
  } = body;

  // Validate user credential if provided and convert to CredentialMode.
  let resolvedCredential: CredentialMode | undefined;
  if (rawUserCredential !== undefined) {
    const parsed = UserCredentialSchema.safeParse(rawUserCredential);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ title: "Invalid Credential", message: "The provided credential is malformed." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const cred = parsed.data;
    if (cred.type === "api_key") {
      resolvedCredential = { type: "byok", apiKey: cred.apiKey };
    } else if (cred.type === "chatgpt_oauth") {
      resolvedCredential = {
        type: "chatgpt_oauth",
        accessToken: cred.accessToken,
        accountId: cred.accountId,
      };
    } else {
      resolvedCredential = {
        type: "local_endpoint",
        baseUrl: cred.baseUrl,
        modelId: cred.modelId,
        apiKey: cred.apiKey,
      };
    }
  }

  const jupyterServerIsLocal =
    typeof jupyterServerIsLocalRaw === "boolean" ? jupyterServerIsLocalRaw : undefined;
  const clientPlatformOs = parseClientPlatformOs(clientPlatformOsRaw);

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
  const forcedSubagentName =
    typeof forcedSubagentNameRaw === "string" && forcedSubagentNameRaw.trim().length > 0
      ? forcedSubagentNameRaw.trim()
      : undefined;

  if (forcedSkillName && !agentMode) {
    return new Response(
      JSON.stringify({
        title: "Invalid Request",
        message: "Skill enforcement requires agent mode.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (forcedSubagentName && !agentMode) {
    return new Response(
      JSON.stringify({
        title: "Invalid Request",
        message: "Sub-agent enforcement requires agent mode.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (forcedSkillName) {
    const advertised = new Set((availableSkills ?? []).map((skill) => skill.name));
    if (!advertised.has(forcedSkillName)) {
      return new Response(
        JSON.stringify({
          title: "Invalid Skill",
          message: `Skill "${forcedSkillName}" is not available in this session.`,
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

    if (!isKnownProvider(providerId)) {
      return new Response(
        JSON.stringify({ title: "Invalid Provider", message: "The selected provider is not supported." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const catalogModel = getModelCatalogEntry(modelId);
    if (!catalogModel || catalogModel.provider_id !== providerId) {
      return new Response(
        JSON.stringify({ title: "Invalid Model", message: "The selected model is not available." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

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

      const summary = result.text.trim();
      const tokensUsed = result.usage?.inputTokens ?? 0;

      return new Response(
        JSON.stringify({ summary, tokensUsed }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } catch (error) {
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

  if (!isKnownProvider(providerId)) {
    return new Response(
      JSON.stringify({ title: "Invalid Provider", message: "The selected provider is not supported." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const catalogModel = getModelCatalogEntry(modelId);
  if (!catalogModel || catalogModel.provider_id !== providerId) {
    return new Response(
      JSON.stringify({
        title: "Invalid Model",
        message: "The selected model is not available.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Derive effective mode early so it's available for logging and the request handler.
  // Sub-agent requests always behave as full Agent mode regardless of what the UI sent.
  const effectiveMode: "Agent" | "Ask" | "Edit" =
    origin === "subagent"
      ? "Agent"
      : rawInteractionMode === "Ask" || rawInteractionMode === "Edit"
        ? rawInteractionMode
        : "Agent";

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
        });
      } else {
        agentSystemPrompt = buildAgentSystemPrompt({
          notebookPath,
          activeFilePath,
          workspaceDirectory,
          availableSkills,
          availableSubagents,
          forcedSkillName,
          forcedSubagentName,
          serverInfo,
          jupyterServerIsLocal,
          clientPlatformOs,
        });
      }
    } else if (effectiveMode === "Ask") {
      agentSystemPrompt = buildAskModeSystemPrompt({
        notebookPath,
        activeFilePath,
        workspaceDirectory,
        serverInfo,
        jupyterServerIsLocal,
        clientPlatformOs,
      });
    } else if (effectiveMode === "Edit") {
      agentSystemPrompt = buildEditModeSystemPrompt({
        notebookPath,
        activeFilePath,
        workspaceDirectory,
        availableSkills,
        availableSubagents,
        forcedSkillName,
        forcedSubagentName,
        serverInfo,
        jupyterServerIsLocal,
        clientPlatformOs,
      });
    }
    // Process request through the gateway (injects agent system prompt into messages)
    const { model, messages: processedMessages, providerOptions } = gateway.processRequest({
      messages,
      modelId,
      providerId: providerId as SupportedProvider,
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

    const toolsForMode =
      effectiveMode === "Ask"
        ? ASK_MODE_TOOLS
        : effectiveMode === "Edit"
          ? EDIT_MODE_TOOLS
          : orionTools;
    const shouldForceLoadSkill =
      !!(effectiveMode !== "Ask" && forcedSkillName && !hasLoadedSkillInHistory(forcedSkillName));
    const shouldForceDelegate =
      !!(effectiveMode !== "Ask" && forcedSubagentName && !hasDelegatedSubagentInHistory(forcedSubagentName));
    const forcedToolChoice = shouldForceDelegate
      ? { type: "tool" as const, toolName: "delegate" as const }
      : shouldForceLoadSkill
        ? { type: "tool" as const, toolName: "load_skill" as const }
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

        /** Converts NaN/undefined/null to null so the DB receives a clean integer or null */
        const safeToken = (n: number | undefined | null): number | null =>
          n == null || !Number.isFinite(n) ? null : n;

        const tokensIn = safeToken(usage.inputTokens);
        const tokensOut = safeToken(usage.outputTokens);

        void providerMetadata;

        logChatFinish({
          fileId,
          requestId,
          model: modelId,
          provider: providerId,
          promptTokens: tokensIn ?? 0,
          completionTokens: tokensOut ?? 0,
          totalTokens: (tokensIn ?? 0) + (tokensOut ?? 0),
          durationMs,
          costUsd: null,
        });
      },
      onError: (error) => {
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
