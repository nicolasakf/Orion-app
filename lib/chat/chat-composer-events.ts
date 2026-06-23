export const OPEN_CHAT_SIDEBAR_EVENT = "orion:open-chat-sidebar";

export const INSERT_CHAT_SKILL_EVENT = "orion:insert-chat-skill";

export interface InsertChatSkillDetail {
  skillName: string;
  /** Optional message body to place after the skill token. */
  message?: string;
  /** When true, start a fresh chat session before inserting the skill token. */
  newChat?: boolean;
}

export interface InsertChatSkillOptions {
  /** When true, start a fresh chat session before inserting the skill token. */
  newChat?: boolean;
}

/**
 * Inserts a skill slash token into the composer input without duplicating it.
 */
export function insertSkillIntoComposerInput(
  currentInput: string,
  skillName: string,
  message?: string,
): string {
  const label = `/${skillName}`;
  const tokenRegex = new RegExp(
    `(^|\\s)${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`,
  );
  const trimmedMessage = message?.trim() ?? "";
  const hasSkillToken = tokenRegex.test(currentInput);

  let nextInput = currentInput;
  if (!hasSkillToken) {
    const token = `${label} `;
    const trimmed = currentInput.trim();
    nextInput = trimmed.length === 0 ? token : `${trimmed} ${token}`;
  }

  if (trimmedMessage.length === 0) {
    return nextInput;
  }

  if (nextInput.includes(trimmedMessage)) {
    return nextInput;
  }

  return `${nextInput.trimEnd()} ${trimmedMessage} `;
}

/** Requests that the chat sidebar panel be expanded when collapsed. */
export function dispatchOpenChatSidebar(): void {
  window.dispatchEvent(new CustomEvent(OPEN_CHAT_SIDEBAR_EVENT));
}

/** Requests that the chat composer insert a skill slash token. */
export function dispatchInsertChatSkill(
  skillName: string,
  message?: string,
  options?: InsertChatSkillOptions,
): void {
  dispatchOpenChatSidebar();
  window.dispatchEvent(
    new CustomEvent<InsertChatSkillDetail>(INSERT_CHAT_SKILL_EVENT, {
      detail: {
        skillName,
        ...(message !== undefined ? { message } : {}),
        ...(options?.newChat ? { newChat: true } : {}),
      },
    }),
  );
}

/** Extracts a typed insert-chat-skill payload from a DOM event. */
export function getInsertChatSkillDetail(
  event: Event,
): InsertChatSkillDetail | null {
  const detail = (event as CustomEvent<Partial<InsertChatSkillDetail>>).detail;

  if (!detail || typeof detail.skillName !== "string" || detail.skillName.length === 0) {
    return null;
  }

  return {
    skillName: detail.skillName,
    ...(typeof detail.message === "string" ? { message: detail.message } : {}),
    ...(detail.newChat === true ? { newChat: true } : {}),
  };
}
