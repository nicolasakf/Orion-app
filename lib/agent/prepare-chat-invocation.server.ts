import "server-only";

import type { ModelMessage } from "@ai-sdk/provider-utils";

import {
  buildAgentEnvironmentContextPrompt,
  buildAgentSystemPrompt,
  buildAskModeSystemPrompt,
  buildEditModeSystemPrompt,
  buildResearchModeSystemPrompt,
  buildSubagentSystemPrompt,
} from "@/lib/agent/agent-system-prompt";
import type { InteractionModeConfig } from "@/lib/agent/interaction-modes";
import { getToolsForInteractionMode } from "@/lib/agent/interaction-modes";
import { resolveModeToolCapabilities } from "@/lib/agent/mode-capabilities";
import { filterDiscoverableSubagents } from "@/lib/agent/subagents/discovery";
import type { OrionToolName } from "@/lib/agent/tool-schemas";
import { getModelGateway, type GatewayResponse } from "@/lib/agent/model-gateway";
import type { CredentialMode, ProviderId } from "@/lib/agent/model-gateway-types";
import type { AgentRule } from "@/lib/agent/rules";
import {
  summarizeResearchSessionForPrompt,
  type ResearchNudge,
  type ResearchSessionSnapshot,
} from "@/lib/agent/research-session";
import type { SubagentPromptPayload } from "@/lib/agent/subagents";
import type { JupyterServerInfo } from "@/lib/kernel/kernel-service";
import type { AgentCommunicationStyle } from "@/lib/settings/schema";
import type { PlatformOS } from "@/lib/utils";

export interface PrepareChatInvocationInput {
  messages: ModelMessage[];
  modelId: string;
  providerId: ProviderId;
  credential: CredentialMode;
  requestId: string;
  modelSettings?: Record<string, unknown>;
  interactionMode: InteractionModeConfig;
  origin?: string;
  subagentPrompt?: SubagentPromptPayload;
  notebookPath?: string;
  activeFilePath?: string;
  connectedNotebookPath?: string | null;
  rootDirectory?: string;
  workspaceDirectory?: string;
  availableSkills?: Array<{ name: string; description: string; disableModelInvocation?: boolean }>;
  availableSubagents?: Array<{
    name: string;
    label?: string;
    description: string;
    options?: { model?: string; disableModelInvocation?: boolean };
  }>;
  agentRules: AgentRule[];
  personalContext?: string;
  missingForcedSkillNames: string[];
  forcedSubagentName?: string;
  serverInfo?: JupyterServerInfo | null;
  jupyterServerIsLocal?: boolean;
  clientPlatformOs?: PlatformOS;
  communicationStyle: AgentCommunicationStyle;
  customCommunicationStyle?: string;
  businessExperienceMode: boolean;
  researchSession?: ResearchSessionSnapshot;
  researchNudge?: ResearchNudge;
  automaticContinuationAttempt: number;
  automaticContinuationReason: string;
  canForceToolChoice: boolean;
  hasDelegatedForcedSubagent: boolean;
}

export interface PreparedChatInvocation extends GatewayResponse {
  agentSystemPrompt?: string;
  tools: ReturnType<typeof getToolsForInteractionMode>;
  toolChoice:
    | "auto"
    | { type: "tool"; toolName: "delegate" | "load_skill" };
}

/**
 * Pure request-preparation pipeline shared by normal sends and preflight.
 * It builds the real prompt and tools and performs provider message normalization,
 * but does not create usage records or contact the selected model.
 */
export function prepareChatInvocation(
  input: PrepareChatInvocationInput
): PreparedChatInvocation {
  const effectiveMode = input.interactionMode.baseMode;
  const enableSkills = input.interactionMode.toolNames.includes("load_skill");
  const enableSubagents = input.interactionMode.toolNames.includes("delegate");
  const sharedPromptOptions = {
    notebookPath: input.notebookPath,
    activeFilePath: input.activeFilePath,
    connectedNotebookPath: input.connectedNotebookPath,
    rootDirectory: input.rootDirectory,
    workspaceDirectory: input.workspaceDirectory,
    agentRules: input.agentRules,
    personalContext: input.personalContext,
    serverInfo: input.serverInfo,
    jupyterServerIsLocal: input.jupyterServerIsLocal,
    clientPlatformOs: input.clientPlatformOs,
    communicationStyle: input.communicationStyle,
    customCommunicationStyle: input.customCommunicationStyle,
    customSystemPrompt: input.interactionMode.customSystemPrompt,
    // Capability wording is derived from the mode's real configuration, which
    // users can customize per mode — including for the built-ins.
    modeToolNames: input.interactionMode.toolNames,
    bashPolicy: input.interactionMode.bashPolicy,
    businessExperienceMode: input.businessExperienceMode,
    availableSkills: input.availableSkills,
    availableSubagents: input.availableSubagents,
    forcedSkillNames: input.missingForcedSkillNames,
    forcedSubagentName: input.forcedSubagentName,
    enableSkills,
    enableSubagents,
  };

  let agentSystemPrompt: string | undefined;
  if ((effectiveMode === "Research" || effectiveMode === "Agent") &&
      input.origin === "subagent" && input.subagentPrompt) {
    // A sub-agent must work only in its temporary notebook copy. The parent's
    // editor context describes the user's GUI, so passing it through would add
    // "Open Notebook" / "Connected Notebook" sections telling the sub-agent to
    // connect to — or keep operating on — a notebook its own prompt forbids
    // touching. Only report a connection once it is the sub-agent's own copy.
    const subagentConnectedNotebookPath =
      input.connectedNotebookPath === input.subagentPrompt.tmpNotebookPath
        ? input.connectedNotebookPath
        : null;
    const envContext = buildAgentEnvironmentContextPrompt({
      serverInfo: input.serverInfo,
      jupyterServerIsLocal: input.jupyterServerIsLocal,
      clientPlatformOs: input.clientPlatformOs,
      rootDirectory: input.rootDirectory,
      workspaceDirectory: input.workspaceDirectory,
      connectedNotebookPath: subagentConnectedNotebookPath,
      capabilities: resolveModeToolCapabilities({
        baseMode: "Agent",
        toolNames: input.interactionMode.toolNames,
        bashPolicy: input.interactionMode.bashPolicy,
      }),
    });
    agentSystemPrompt = buildSubagentSystemPrompt({
      subagent: input.subagentPrompt,
      envContext,
      agentRules: input.agentRules,
      forcedSkillNames: input.missingForcedSkillNames,
      rootDirectory: input.rootDirectory,
      personalContext: input.personalContext,
    });
  } else if (effectiveMode === "Research") {
    agentSystemPrompt = buildResearchModeSystemPrompt(sharedPromptOptions);
  } else if (effectiveMode === "Agent") {
    agentSystemPrompt = buildAgentSystemPrompt(sharedPromptOptions);
  } else if (effectiveMode === "Ask") {
    agentSystemPrompt = buildAskModeSystemPrompt(sharedPromptOptions);
  } else {
    agentSystemPrompt = buildEditModeSystemPrompt(sharedPromptOptions);
  }

  if (effectiveMode === "Research" && input.researchSession && agentSystemPrompt) {
    const sessionPrompt = summarizeResearchSessionForPrompt({
      session: input.researchSession,
      nudge: input.researchNudge,
    });
    const continuationNote = input.automaticContinuationAttempt > 0
      ? `\nAutomatic continuation ${input.automaticContinuationAttempt}${
        input.automaticContinuationReason ? ` (${input.automaticContinuationReason})` : ""
      }.`
      : "";
    agentSystemPrompt += `\n\n${sessionPrompt}${continuationNote}`;
  }

  const gateway = getModelGateway();
  const prepared = gateway.processRequest({
    messages: input.messages,
    modelId: input.modelId,
    providerId: input.providerId,
    agentSystemPrompt,
    requestId: input.requestId,
    modelSettings: input.modelSettings,
    credentials: input.credential,
  });
  // Never advertise a tool the model cannot use successfully: `delegate` and
  // `load_skill` both point at a system-prompt list that is omitted when empty,
  // and sub-agents are hard-blocked from delegating and writing memory.
  const hasDelegationTarget =
    filterDiscoverableSubagents(input.availableSubagents ?? []).length > 0 ||
    Boolean(input.forcedSubagentName);
  const hasLoadableSkill = (input.availableSkills ?? []).length > 0;
  const unusableTools = new Set<OrionToolName>();
  if (input.origin === "subagent") {
    unusableTools.add("update_memory");
    unusableTools.add("delegate");
  } else if (!hasDelegationTarget) {
    unusableTools.add("delegate");
  }
  if (!hasLoadableSkill) {
    unusableTools.add("load_skill");
  }

  const toolMode = {
    ...input.interactionMode,
    toolNames: input.interactionMode.toolNames.filter(
      (toolName) => !unusableTools.has(toolName)
    ),
  };
  const tools = getToolsForInteractionMode(toolMode);
  const requestedToolChoice: PreparedChatInvocation["toolChoice"] =
    enableSubagents && input.forcedSubagentName && !input.hasDelegatedForcedSubagent
      ? { type: "tool", toolName: "delegate" }
      : input.missingForcedSkillNames.length > 0
        ? { type: "tool", toolName: "load_skill" }
        : "auto";

  return {
    ...prepared,
    agentSystemPrompt,
    tools,
    toolChoice: input.canForceToolChoice ? requestedToolChoice : "auto",
  };
}
