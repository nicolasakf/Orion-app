import { z } from "zod";

export const CHAT_REFERENCE_TYPES = [
  "file",
  "folder",
  "cell",
  "variable",
  "terminal",
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
  | { type: "variable"; name: string; notebookPath?: string }
  | { type: "terminal"; terminalName: string; chatId?: string };

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
    type: z.literal("variable"),
    name: z.string().min(1),
    notebookPath: z.string().optional(),
  }),
  z.object({
    type: z.literal("terminal"),
    terminalName: z.string().min(1),
    chatId: z.string().optional(),
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

export const ChatMessageMetadataSchema = z.object({
  references: z.array(ResolvedChatReferenceSchema).max(20).optional(),
});

/** Returns validated references from unknown message metadata. */
export function parseChatMessageReferences(metadata: unknown): ResolvedChatReference[] {
  const parsed = ChatMessageMetadataSchema.safeParse(metadata);
  if (!parsed.success) return [];
  return parsed.data.references ?? [];
}

export function getReferenceTypeLabel(type: ChatReferenceType): string {
  switch (type) {
    case "file":
      return "File";
    case "folder":
      return "Folder";
    case "cell":
      return "Cell";
    case "variable":
      return "Variable";
    case "terminal":
      return "Terminal";
  }
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
    case "variable":
      return locator.notebookPath ? `${locator.name} in ${locator.notebookPath}` : locator.name;
    case "terminal":
      return locator.terminalName;
  }
}

function hasSelectedTextPayload(reference: ResolvedChatReference): boolean {
  const locator = reference.locator;
  return (
    (locator.type === "file" || locator.type === "cell") &&
    !!locator.lineStart &&
    !!locator.lineEnd
  );
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

The user attached these references specifically to this message. Treat regular mentions as pointers, and use tools when exact content is needed. Highlighted editor selections include their selected text inline.

${blocks.join("\n\n")}`;
}
