import { z } from "zod";

export const CHAT_REFERENCE_TYPES = [
  "file",
  "folder",
  "cell",
  "output",
  "variable",
  "terminal",
  "conversation",
  "external-file",
] as const;

export type ChatReferenceType = (typeof CHAT_REFERENCE_TYPES)[number];

export type ChatReferenceLocator =
  | {
      type: "file";
      path: string;
      lineStart?: number;
      lineEnd?: number;
    }
  | { type: "folder"; path: string }
  | {
      type: "cell";
      notebookPath: string;
      cellIndices: number[];
      lineStart?: number;
      lineEnd?: number;
    }
  | {
      type: "output";
      notebookPath: string;
      cellIndex: number;
      outputIndex: number;
    }
  | { type: "variable"; name: string; notebookPath?: string }
  | { type: "terminal"; terminalName: string; chatId?: string }
  | {
      type: "conversation";
      messageId: string;
      messageIndex: number;
      partIndex: number;
      source: "assistant" | "tool";
      toolName?: string;
      toolCallId?: string;
      selectionHash?: string;
    }
  | {
      type: "external-file";
      fileName: string;
      mediaType: string;
      size: number;
      lastModified?: number;
      /** Jupyter-relative path for an external file copied into Orion-managed storage. */
      managedPath?: string;
      /** Stable identifier for an external file copied into Orion-managed storage. */
      attachmentId?: string;
    };

export interface ChatReference {
  id: string;
  type: ChatReferenceType;
  label: string;
  locator: ChatReferenceLocator;
}

export interface ResolvedChatReference extends ChatReference {
  status: "resolved" | "unavailable";
  preview: string;
  resolvedAt: string;
  toolHint?: string;
}

export interface ChatMessageMetadata {
  references?: ResolvedChatReference[];
  slashCommands?: ChatSlashCommandToken[];
}

export type ChatSlashCommandCategory = "builtin" | "subagent" | "skill";

export interface ChatSlashCommandToken {
  label: string;
  name?: string;
  category?: ChatSlashCommandCategory;
}

export interface ChatReferenceOption {
  id: string;
  type: ChatReferenceType;
  label: string;
  description: string;
  reference: ResolvedChatReference;
}

const ChatReferenceLocatorSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("file"),
    path: z.string().min(1),
    lineStart: z.number().int().min(1).optional(),
    lineEnd: z.number().int().min(1).optional(),
  }),
  z.object({ type: z.literal("folder"), path: z.string() }),
  z.object({
    type: z.literal("cell"),
    notebookPath: z.string().min(1),
    cellIndices: z.array(z.number().int().min(0)).min(1).max(50),
    lineStart: z.number().int().min(1).optional(),
    lineEnd: z.number().int().min(1).optional(),
  }),
  z.object({
    type: z.literal("output"),
    notebookPath: z.string().min(1),
    cellIndex: z.number().int().min(0),
    outputIndex: z.number().int().min(0),
  }),
  z.object({
    type: z.literal("variable"),
    name: z.string().min(1),
    notebookPath: z.string().optional(),
  }),
  z.object({
    type: z.literal("terminal"),
    terminalName: z.string().min(1),
    chatId: z.string().optional(),
  }),
  z.object({
    type: z.literal("conversation"),
    messageId: z.string().min(1),
    messageIndex: z.number().int().min(0),
    partIndex: z.number().int().min(0),
    source: z.enum(["assistant", "tool"]),
    toolName: z.string().min(1).optional(),
    toolCallId: z.string().min(1).optional(),
    selectionHash: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal("external-file"),
    fileName: z.string().min(1),
    mediaType: z.string().min(1),
    size: z.number().int().min(0),
    lastModified: z.number().int().min(0).optional(),
    managedPath: z.string().min(1).optional(),
    attachmentId: z.string().min(1).optional(),
  }),
]);

export const ResolvedChatReferenceSchema = z.object({
  id: z.string().min(1),
  type: z.enum(CHAT_REFERENCE_TYPES),
  label: z.string().min(1),
  locator: ChatReferenceLocatorSchema,
  status: z.enum(["resolved", "unavailable"]),
  preview: z.string().max(4000),
  resolvedAt: z.string(),
  toolHint: z.string().max(1000).optional(),
});

const ChatSlashCommandTokenSchema = z.object({
  label: z.string().min(1).max(120),
  name: z.string().min(1).max(160).optional(),
  category: z.enum(["builtin", "subagent", "skill"]).optional(),
});

export const ChatMessageMetadataSchema = z.object({
  references: z.array(ResolvedChatReferenceSchema).max(20).optional(),
  slashCommands: z.array(ChatSlashCommandTokenSchema).max(10).optional(),
});

/** Returns validated references from unknown message metadata. */
export function parseChatMessageReferences(metadata: unknown): ResolvedChatReference[] {
  const parsed = ChatMessageMetadataSchema.safeParse(metadata);
  if (!parsed.success) return [];
  return parsed.data.references ?? [];
}

/** Returns validated slash command tokens from unknown message metadata. */
export function parseChatMessageSlashCommands(metadata: unknown): ChatSlashCommandToken[] {
  const parsed = ChatMessageMetadataSchema.safeParse(metadata);
  if (!parsed.success) return [];
  return parsed.data.slashCommands ?? [];
}

/** Keeps only chat metadata fields that Orion understands and should persist. */
export function normalizeChatMessageMetadata(metadata: unknown): ChatMessageMetadata | undefined {
  const parsed = ChatMessageMetadataSchema.safeParse(metadata);
  if (!parsed.success) return undefined;

  const references = parsed.data.references ?? [];
  const slashCommands = parsed.data.slashCommands ?? [];
  if (references.length === 0 && slashCommands.length === 0) return undefined;

  return {
    ...(references.length > 0 ? { references } : {}),
    ...(slashCommands.length > 0 ? { slashCommands } : {}),
  };
}

export function getReferenceTypeLabel(type: ChatReferenceType): string {
  switch (type) {
    case "file":
      return "File";
    case "folder":
      return "Folder";
    case "cell":
      return "Cell";
    case "output":
      return "Output";
    case "variable":
      return "Variable";
    case "terminal":
      return "Terminal";
    case "conversation":
      return "Conversation";
    case "external-file":
      return "External file";
  }
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB"];
  let value = size / 1024;
  for (const unit of units) {
    if (value < 1024 || unit === units[units.length - 1]) {
      return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${unit}`;
    }
    value /= 1024;
  }
  return `${size} B`;
}

/**
 * Short label for cell references in the @ picker and message chips (`Cell #0`).
 * Indices are 0-based, matching notebook tool APIs.
 */
export function formatCellReferenceLabel(cellIndices: readonly number[]): string {
  if (cellIndices.length === 0) return "Cell";
  if (cellIndices.length === 1) return `Cell #${cellIndices[0]}`;
  return `Cells #${cellIndices.join(", #")}`;
}

/** Short label for a specific notebook cell output reference. */
export function formatOutputReferenceLabel(cellIndex: number, outputIndex: number): string {
  return `Cell #${cellIndex} output #${outputIndex}`;
}

function formatLocator(reference: ResolvedChatReference): string {
  const locator = reference.locator;
  switch (locator.type) {
    case "file":
      if (locator.lineStart && locator.lineEnd) {
        const range =
          locator.lineStart === locator.lineEnd
            ? `L${locator.lineStart}`
            : `L${locator.lineStart}-L${locator.lineEnd}`;
        return `${locator.path}:${range}`;
      }
      return locator.path || "/";
    case "folder":
      return locator.path || "/";
    case "cell":
      if (locator.lineStart && locator.lineEnd) {
        const range =
          locator.lineStart === locator.lineEnd
            ? `L${locator.lineStart}`
            : `L${locator.lineStart}-L${locator.lineEnd}`;
        return `${locator.notebookPath} cells ${locator.cellIndices.join(", ")}:${range}`;
      }
      return `${locator.notebookPath} cells ${locator.cellIndices.join(", ")}`;
    case "output":
      return `${locator.notebookPath} cell ${locator.cellIndex} output ${locator.outputIndex}`;
    case "variable":
      return locator.notebookPath ? `${locator.name} in ${locator.notebookPath}` : locator.name;
    case "terminal":
      return locator.terminalName;
    case "conversation":
      if (locator.source === "tool") {
        return locator.toolName
          ? `Message ${locator.messageIndex + 1}, ${locator.toolName} tool`
          : `Message ${locator.messageIndex + 1}, tool call`;
      }
      return `Message ${locator.messageIndex + 1}, assistant response`;
    case "external-file":
      if (locator.managedPath) {
        return `${locator.managedPath} (${locator.mediaType}, ${formatBytes(locator.size)})`;
      }
      return `${locator.fileName} (${locator.mediaType}, ${formatBytes(locator.size)})`;
  }
}

function hasSelectedTextPayload(reference: ResolvedChatReference): boolean {
  const locator = reference.locator;
  return (
    (locator.type === "file" || locator.type === "cell") &&
    !!locator.lineStart &&
    !!locator.lineEnd
  ) || locator.type === "conversation";
}

/** Builds compact context for a single user message's attached references. */
export function formatReferencesForMessage(references: ResolvedChatReference[]): string {
  if (references.length === 0) return "";

  const blocks = references.map((reference, index) => {
    const lines = [
      `### ${index + 1}. ${getReferenceTypeLabel(reference.type)}: ${reference.label}`,
      `- Status: ${reference.status}`,
      `- Locator: ${formatLocator(reference)}`,
    ];

    if (reference.toolHint) {
      lines.push(`- Tool guidance: ${reference.toolHint}`);
    }

    if (hasSelectedTextPayload(reference)) {
      const selectedText = reference.preview.trim() || "(empty selection)";
      lines.push("", "Selected text:", "```text", selectedText, "```");
    }

    return lines.join("\n");
  });

  return `## Referenced Context For This Message

The user attached these references specifically to this message. Treat regular mentions as pointers, and use tools when exact content is needed. Highlighted editor and conversation selections include their selected text inline. External file references without a managed path are pointer-only unless a separate image input is present in the message.

${blocks.join("\n\n")}`;
}
