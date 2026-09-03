"use client";

import { GoalSessionSchema, type GoalSession } from "./types";

/** Loads the current goal session for one chat. */
export async function loadGoalSession(chatId: string): Promise<GoalSession | null> {
  const response = await fetch(`/api/chats/${encodeURIComponent(chatId)}/goal`);
  if (!response.ok) throw new Error(`Failed to load goal session: ${response.status}`);
  const body = (await response.json()) as { goal?: unknown };
  if (body.goal == null) return null;
  return GoalSessionSchema.parse(body.goal);
}

/** Persists the complete current goal session for one chat. */
export async function persistGoalSession(session: GoalSession): Promise<void> {
  const response = await fetch(`/api/chats/${encodeURIComponent(session.chatId)}/goal`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(session),
  });
  if (!response.ok) throw new Error(`Failed to save goal session: ${response.status}`);
}

/** Deletes the current goal session for one chat. */
export async function removeGoalSession(chatId: string): Promise<void> {
  const response = await fetch(`/api/chats/${encodeURIComponent(chatId)}/goal`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(`Failed to delete goal session: ${response.status}`);
}
