import type {
  EditCheckpoint,
  RecordEditCheckpointTargetRequest,
  UpdateEditCheckpointStatusRequest,
} from "@/lib/agent/edit-checkpoints";
import type { ChatWire } from "@/lib/chat/chat-types";
import { ChatWireSchema } from "@/lib/chat/chat-types";
import { GoalSessionSchema, type GoalSession } from "@/lib/agent/goals/types";

export type ChatSessionStatus = "idle" | "processing" | "completed" | "error";

export interface ModelUsageInsert {
  requestId?: string | null;
  modelId: string;
  providerId: string;
  tokensIn?: number | null;
  tokensOut?: number | null;
  costUsd?: number | null;
  cacheReadTokens?: number | null;
  cacheCreationTokens?: number | null;
  reasoningTokens?: number | null;
  isByok: boolean;
}

export interface ChatCostSummary {
  version: 2;
  totalCostUsd: number | null;
  requestCount: number;
  unknownCostRequestCount: number;
  bestAvailableTotalUsd: number | null;
  exactTotalUsd: number;
  estimatedTotalUsd: number;
  legacyEstimatedTotalUsd: number;
  exactRequestCount: number;
  estimatedRequestCount: number;
  pendingRequestCount: number;
  unavailableRequestCount: number;
  legacyRequestCount: number;
  models: Array<{
    modelId: string;
    providerId: string;
    requestCount: number;
    totalCostUsd: number | null;
    unknownCostRequestCount: number;
    bestAvailableTotalUsd: number | null;
    exactTotalUsd: number;
    estimatedTotalUsd: number;
    legacyEstimatedTotalUsd: number;
    exactRequestCount: number;
    estimatedRequestCount: number;
    pendingRequestCount: number;
    unavailableRequestCount: number;
    legacyRequestCount: number;
  }>;
}

const chats = new Map<string, ChatWire>();
const goalSessions = new Map<string, GoalSession>();

/** Returns whether the in-memory fallback store is active. */
export function isFallbackChatStorageActive(): boolean {
  return true;
}

/** Saves one complete chat to the in-memory fallback store. */
export async function saveFallbackChat(chat: ChatWire): Promise<void> {
  chats.set(chat.id, ChatWireSchema.parse(chat));
}

/** Saves multiple chats to the in-memory fallback store. */
export async function saveFallbackChats(nextChats: ChatWire[]): Promise<void> {
  for (const chat of nextChats) {
    await saveFallbackChat(chat);
  }
}

/** Returns all chats from the in-memory fallback store, newest first. */
export async function getFallbackChats(): Promise<ChatWire[]> {
  return [...chats.values()].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt)
  );
}

/** Returns chat metadata from the in-memory fallback store, newest first. */
export async function getFallbackChatMetas(): Promise<ChatWire[]> {
  return (await getFallbackChats()).map((chat) => ({
    ...chat,
    messages: [],
    subagentSessions: undefined,
  }));
}

/** Returns one chat from the in-memory fallback store. */
export async function getFallbackChat(chatId: string): Promise<ChatWire | undefined> {
  return chats.get(chatId);
}

/** Deletes one chat from the in-memory fallback store. */
export async function deleteFallbackChat(chatId: string): Promise<void> {
  chats.delete(chatId);
  goalSessions.delete(chatId);
}

/** Clears the in-memory fallback store. */
export async function clearFallbackChats(): Promise<void> {
  chats.clear();
  goalSessions.clear();
}

/** Saves the current goal session for one chat in degraded storage. */
export async function saveFallbackGoalSession(session: GoalSession): Promise<void> {
  const parsed = GoalSessionSchema.parse(session);
  goalSessions.set(parsed.chatId, parsed);
}

/** Returns the current goal session for one chat in degraded storage. */
export async function getFallbackGoalSession(chatId: string): Promise<GoalSession | null> {
  return goalSessions.get(chatId) ?? null;
}

/** Deletes the current goal session for one chat in degraded storage. */
export async function deleteFallbackGoalSession(chatId: string): Promise<void> {
  goalSessions.delete(chatId);
}

/** Updates compaction summary in the in-memory fallback store. */
export async function updateFallbackCompactionSummary(
  chatId: string,
  summary: ChatWire["compactionSummary"] | null
): Promise<void> {
  const chat = chats.get(chatId);
  if (!chat) {
    return;
  }
  chats.set(chatId, {
    ...chat,
    compactionSummary: summary ?? undefined,
    updatedAt: new Date().toISOString(),
  });
}

/** No-op checkpoint recording for degraded storage. */
export async function recordFallbackEditCheckpointTarget(
  _request: RecordEditCheckpointTargetRequest
): Promise<EditCheckpoint | null> {
  return null;
}

/** Returns no checkpoints while storage is degraded. */
export async function getFallbackEditCheckpointByRequestId(
  _requestId: string
): Promise<EditCheckpoint | null> {
  return null;
}

/** Returns no checkpoints while storage is degraded. */
export async function getFallbackEditCheckpointsForChat(
  _chatId: string
): Promise<EditCheckpoint[]> {
  return [];
}

/** No-op checkpoint status update for degraded storage. */
export async function updateFallbackEditCheckpointStatus(
  _requestId: string,
  _request: UpdateEditCheckpointStatusRequest
): Promise<EditCheckpoint | null> {
  return null;
}

/** No-op checkpoint interruption for degraded storage. */
export async function interruptFallbackOpenEditCheckpoints(_options: {
  olderThanMs: number;
}): Promise<number> {
  return 0;
}

/** Returns a synthetic session id for degraded storage. */
export async function resolveFallbackOrCreateChatSession(
  localChatId: string | undefined,
  _status: ChatSessionStatus = "processing"
): Promise<{ sessionId: string } | null> {
  if (!localChatId) {
    return null;
  }
  return { sessionId: `fallback-session-${localChatId}` };
}

/** No-op session status update for degraded storage. */
export async function updateFallbackChatSessionStatus(
  _sessionId: string,
  _status: ChatSessionStatus
): Promise<void> {
  return;
}

/** Returns a synthetic request id for degraded storage. */
export async function resolveFallbackOrCreateModelRequest(options: {
  id?: string | null;
  origin: string;
  chatSessionId?: string | null;
}): Promise<{ requestId: string }> {
  return { requestId: options.id ?? `fallback-request-${Date.now()}` };
}

/** No-op usage insert for degraded storage. */
export async function insertFallbackModelUsage(_usage: ModelUsageInsert): Promise<void> {
  return;
}

/** Returns an empty cost summary for degraded storage. */
export async function getFallbackChatCostSummary(
  _chatId: string
): Promise<ChatCostSummary> {
  return {
    version: 2,
    totalCostUsd: null,
    requestCount: 0,
    unknownCostRequestCount: 0,
    bestAvailableTotalUsd: null,
    exactTotalUsd: 0,
    estimatedTotalUsd: 0,
    legacyEstimatedTotalUsd: 0,
    exactRequestCount: 0,
    estimatedRequestCount: 0,
    pendingRequestCount: 0,
    unavailableRequestCount: 0,
    legacyRequestCount: 0,
    models: [],
  };
}

/** Clears fallback state, primarily for tests. */
export function resetFallbackChatStorage(): void {
  chats.clear();
  goalSessions.clear();
}
