import type { UIMessage } from "ai";

/**
 * Collapse repeated message snapshots while preserving first-seen transcript order.
 *
 * Concurrent AI SDK sends can briefly surface the same message ID more than once.
 * The snapshot with the most parts is the most complete; equally sized later
 * snapshots win so terminal tool-state updates are retained.
 */
export function deduplicateMessagesById<T extends UIMessage>(
  messages: T[]
): { messages: T[]; changed: boolean } {
  const deduplicated: T[] = [];
  const indexById = new Map<string, number>();
  let changed = false;

  for (const message of messages) {
    const existingIndex = indexById.get(message.id);
    if (existingIndex === undefined) {
      indexById.set(message.id, deduplicated.length);
      deduplicated.push(message);
      continue;
    }

    changed = true;
    const existing = deduplicated[existingIndex];
    if (message.parts.length >= existing.parts.length) {
      deduplicated[existingIndex] = message;
    }
  }

  return {
    messages: changed ? deduplicated : messages,
    changed,
  };
}
