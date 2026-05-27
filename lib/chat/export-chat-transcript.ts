import { isToolUIPart, type UIMessage } from "ai";

import { getTextContent } from "@/lib/chat/chat-types";

/** Sanitize a chat title for use in a downloaded filename. */
function sanitizeFilenameSegment(value: string): string {
  const trimmed = value.trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
  return trimmed.slice(0, 80) || "chat";
}

/** Escape characters that would break fenced markdown code blocks. */
function escapeFencedCodeBlock(value: string): string {
  return value.replace(/```/g, "\\`\\`\\`");
}

/** Format a tool result for markdown export. */
function formatToolOutput(output: unknown): string {
  if (output === undefined) return "";
  if (typeof output === "string") return output;
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}

/** Extract the Orion tool name from a UIMessage tool part type (`tool-<name>`). */
function getToolNameFromPartType(type: string): string {
  return type.startsWith("tool-") ? type.slice("tool-".length) : type;
}

/** Render one UIMessage as markdown sections for transcript export. */
function formatMessageMarkdown(message: UIMessage): string {
  const roleLabel =
    message.role === "user"
      ? "User"
      : message.role === "assistant"
        ? "Assistant"
        : message.role.charAt(0).toUpperCase() + message.role.slice(1);

  const sections: string[] = [`## ${roleLabel}`, ""];

  for (const part of message.parts) {
    if (part.type === "text" && "text" in part && part.text.trim()) {
      sections.push(part.text.trim(), "");
      continue;
    }

    if (part.type === "reasoning" && "text" in part && part.text.trim()) {
      sections.push("### Reasoning", "", part.text.trim(), "");
      continue;
    }

    if (isToolUIPart(part)) {
      const toolName = getToolNameFromPartType(part.type);
      const state = "state" in part ? String(part.state) : "unknown";
      sections.push(`### Tool: ${toolName}`, "", `_State: ${state}_`, "");

      if ("input" in part && part.input !== undefined) {
        const inputText = formatToolOutput(part.input);
        if (inputText) {
          sections.push("**Input**", "", "```json", escapeFencedCodeBlock(inputText), "```", "");
        }
      }

      if ("output" in part && part.output !== undefined) {
        const outputText = formatToolOutput(part.output);
        if (outputText) {
          sections.push("**Output**", "", "```", escapeFencedCodeBlock(outputText), "```", "");
        }
      }
    }
  }

  const textFallback = getTextContent(message).trim();
  if (sections.length === 2 && textFallback) {
    sections.push(textFallback, "");
  }

  return sections.join("\n").trimEnd();
}

/**
 * Build a markdown document for a chat transcript suitable for download or sharing.
 */
export function formatChatTranscriptMarkdown(
  title: string,
  messages: UIMessage[]
): string {
  const exportedAt = new Date().toISOString();
  const header = [
    `# ${title.trim() || "Chat"}`,
    "",
    `_Exported ${exportedAt}_`,
    "",
    "---",
    "",
  ];

  if (messages.length === 0) {
    return [...header, "_No messages in this chat._", ""].join("\n");
  }

  const body = messages
    .map((message) => formatMessageMarkdown(message))
    .filter((section) => section.length > 0)
    .join("\n\n");

  return [...header, body, ""].join("\n");
}

/**
 * Trigger a browser download of the chat transcript as a `.md` file.
 */
export function downloadChatTranscriptMarkdown(
  title: string,
  messages: UIMessage[]
): void {
  const markdown = formatChatTranscriptMarkdown(title, messages);
  const dateSegment = new Date().toISOString().slice(0, 10);
  const filename = `${sanitizeFilenameSegment(title)}-${dateSegment}.md`;
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}
