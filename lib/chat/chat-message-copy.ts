import type { UIMessage } from "ai";

import {
  normalizeChatMessageMetadata,
  parseChatMessageReferences,
  parseChatMessageSlashCommands,
  type ChatMessageMetadata,
  type ChatSlashCommandToken,
  type ResolvedChatReference,
} from "@/lib/chat/chat-references";
import { getTextContent } from "@/lib/chat/chat-types";

const ORION_CHAT_MESSAGE_CLIPBOARD_ATTRIBUTE = "data-orion-chat-message";

export interface OrionChatMessageClipboardPayload {
  version: 1;
  text: string;
  metadata?: ChatMessageMetadata;
}

/** Escapes copied plain text for the HTML clipboard fallback representation. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Returns the pasteable text for a rendered chat reference chip. */
export function formatReferenceClipboardToken(reference: ResolvedChatReference): string {
  const label = reference.label.trim();
  if (!label) return "";
  return label.startsWith("@") ? label : `@${label}`;
}

/** Returns the pasteable text for a rendered slash-command chip. */
export function formatSlashCommandClipboardToken(command: ChatSlashCommandToken): string {
  const label = command.label.trim();
  if (!label) return "";
  return label.startsWith("/") ? label : `/${label}`;
}

/** Builds the token prefix that should accompany copied user-message text. */
export function formatMessageClipboardPrefix(metadata: unknown): string {
  const slashCommands = parseChatMessageSlashCommands(metadata)
    .map(formatSlashCommandClipboardToken)
    .filter((token) => token.length > 0);
  const references = parseChatMessageReferences(metadata)
    .map(formatReferenceClipboardToken)
    .filter((token) => token.length > 0);

  return [...slashCommands, ...references].join(" ");
}

/** Formats a user message as plain text, including metadata-backed chips. */
export function formatUserMessageClipboardText(message: UIMessage): string {
  const textContent = getTextContent(message);
  const prefix = formatMessageClipboardPrefix(message.metadata);
  if (!prefix) return textContent;

  const trimmedText = textContent.trim();
  return trimmedText ? `${prefix}\n${trimmedText}` : prefix;
}

/** Builds the structured payload used to rehydrate chips when pasting inside Orion. */
export function buildUserMessageClipboardPayload(
  message: UIMessage
): OrionChatMessageClipboardPayload {
  return {
    version: 1,
    text: getTextContent(message),
    metadata: normalizeChatMessageMetadata(message.metadata),
  };
}

/** Formats the rich HTML clipboard data that carries Orion-only message metadata. */
export function formatUserMessageClipboardHtml(message: UIMessage): string {
  const payload = encodeURIComponent(JSON.stringify(buildUserMessageClipboardPayload(message)));
  const text = escapeHtml(formatUserMessageClipboardText(message)).replace(/\n/g, "<br>");
  return `<span ${ORION_CHAT_MESSAGE_CLIPBOARD_ATTRIBUTE}="${payload}">${text}</span>`;
}

/** Reads Orion message metadata from rich clipboard HTML, when present. */
export function parseUserMessageClipboardHtml(
  html: string
): OrionChatMessageClipboardPayload | null {
  const pattern = new RegExp(`${ORION_CHAT_MESSAGE_CLIPBOARD_ATTRIBUTE}="([^"]+)"`);
  const match = html.match(pattern);
  if (!match?.[1]) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(match[1])) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const payload = parsed as Partial<OrionChatMessageClipboardPayload>;
    if (payload.version !== 1 || typeof payload.text !== "string") return null;
    return {
      version: 1,
      text: payload.text,
      metadata: normalizeChatMessageMetadata(payload.metadata),
    };
  } catch {
    return null;
  }
}

/** Text inserted into the composer when a copied Orion message is pasted. */
export function formatClipboardPayloadComposerText(
  payload: OrionChatMessageClipboardPayload
): string {
  const slashPrefix = parseChatMessageSlashCommands(payload.metadata)
    .map(formatSlashCommandClipboardToken)
    .filter((token) => token.length > 0)
    .join(" ");
  const trimmedText = payload.text.trim();

  if (!slashPrefix) return payload.text;
  return trimmedText ? `${slashPrefix} ${trimmedText}` : `${slashPrefix} `;
}

/** Writes both normal text and Orion metadata to the system clipboard. */
export async function writeUserMessageToClipboard(message: UIMessage): Promise<void> {
  const text = formatUserMessageClipboardText(message);
  const html = formatUserMessageClipboardHtml(message);

  if (
    typeof ClipboardItem !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.write === "function"
  ) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([text], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ]);
      return;
    } catch {
      // Fall back to plain text when a browser rejects rich clipboard writes.
    }
  }

  await navigator.clipboard.writeText(text);
}
