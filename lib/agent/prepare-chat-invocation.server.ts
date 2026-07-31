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
    rootDirectory: input.rootDirectory,
    workspaceDirectory: input.workspaceDirectory,
    agentRules: input.agentRules,
    serverInfo: input.serverInfo,
    jupyterServerIsLocal: input.jupyterServerIsLocal,
    clientPlatformOs: input.clientPlatformOs,
    communicationStyle: input.communicationStyle,
    customCommunicationStyle: input.customCommunicationStyle,
    customSystemPrompt: input.interactionMode.customSystemPrompt,
  };

  let agentSystemPrompt: string | undefined;
  if ((effectiveMode === "Research" || effectiveMode === "Agent") &&
      input.origin === "subagent" && input.subagentPrompt) {
    const envContext = buildAgentEnvironmentContextPrompt({
      serverInfo: input.serverInfo,
      jupyterServerIsLocal: input.jupyterServerIsLocal,
      clientPlatformOs: input.clientPlatformOs,
      rootDirectory: input.rootDirectory,
      workspaceDirectory: input.workspaceDirectory,
      notebookPath: input.notebookPath,
      activeFilePath: input.activeFilePath,
    });
    agentSystemPrompt = buildSubagentSystemPrompt({
      subagent: input.subagentPrompt,
      envContext,
      agentRules: input.agentRules,
      forcedSkillNames: input.missingForcedSkillNames,
      rootDirectory: input.rootDirectory,
    });
  } else if (effectiveMode === "Research") {
    agentSystemPrompt = buildResearchModeSystemPrompt({
      ...sharedPromptOptions,
      availableSkills: input.availableSkills,
      availableSubagents: input.availableSubagents,
      forcedSkillNames: input.missingForcedSkillNames,
      forcedSubagentName: input.forcedSubagentName,
      enableSkills,
      enableSubagents,
      businessExperienceMode: input.businessExperienceMode,
    });
  } else if (effectiveMode === "Agent") {
    agentSystemPrompt = buildAgentSystemPrompt({
      ...sharedPromptOptions,
      availableSkills: input.availableSkills,
      availableSubagents: input.availableSubagents,
      forcedSkillNames: input.missingForcedSkillNames,
      forcedSubagentName: input.forcedSubagentName,
      enableSkills,
      enableSubagents,
      businessExperienceMode: input.businessExperienceMode,
    });
  } else if (effectiveMode === "Ask") {
    agentSystemPrompt = buildAskModeSystemPrompt({
      ...sharedPromptOptions,
      availableSkills: input.availableSkills,
      availableSubagents: input.availableSubagents,
      forcedSkillNames: input.missingForcedSkillNames,
      forcedSubagentName: input.forcedSubagentName,
      enableSkills,
      enableSubagents,
    });
  } else {
    agentSystemPrompt = buildEditModeSystemPrompt({
      ...sharedPromptOptions,
      availableSkills: input.availableSkills,
      availableSubagents: input.availableSubagents,
      forcedSkillNames: input.missingForcedSkillNames,
      forcedSubagentName: input.forcedSubagentName,
      enableSkills,
      enableSubagents,
    });
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
  const tools = getToolsForInteractionMode(input.interactionMode);
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
