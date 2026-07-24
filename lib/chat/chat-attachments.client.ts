"use client";

import type { Contents } from "@jupyterlab/services";
import { z } from "zod";

import {
  normalizeChatMessageMetadata,
  parseChatMessageReferences,
  type ResolvedChatReference,
} from "@/lib/chat/chat-references";
import type { Chat } from "@/lib/chat/chat-types";

export const CHAT_ATTACHMENT_ROOT = ".orion/chat-attachments";
export const CHAT_ATTACHMENT_MANIFEST_NAME = "manifest.json";
export const CHAT_ATTACHMENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const CHAT_ATTACHMENT_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

const MAX_CHAT_ATTACHMENT_FILENAME_BYTES = 240;
const WINDOWS_RESERVED_FILENAME_PATTERN =
  /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

const ChatAttachmentManifestSchema = z.object({
  version: z.literal(1),
  attachmentId: z.string().min(1),
  originatingChatId: z.string().min(1),
  originalName: z.string().min(1),
  mediaType: z.string().min(1),
  size: z.number().int().min(0),
  createdAt: z.string().datetime(),
  managedPath: z.string().min(1),
});

export type ChatAttachmentManifest = z.infer<typeof ChatAttachmentManifestSchema>;

export type ChatAttachmentContentsManager = Pick<
  Contents.IManager,
  "delete" | "get" | "save"
>;

export interface StoreChatAttachmentOptions {
  attachmentId?: string;
  now?: Date;
}

export interface ChatAttachmentCleanupResult {
  deletedPaths: string[];
  failedPaths: string[];
}

/**
 * Runs cleanup immediately and once per day until the returned disposer is called.
 * Cleanup owns its error handling so one failed pass cannot stop later attempts.
 */
export function scheduleChatAttachmentCleanup(
  runCleanup: () => void | Promise<void>
): () => void {
  void runCleanup();
  const intervalId = window.setInterval(
    () => void runCleanup(),
    CHAT_ATTACHMENT_CLEANUP_INTERVAL_MS
  );
  return () => window.clearInterval(intervalId);
}

/** Joins Jupyter-relative path segments without introducing absolute paths. */
function joinJupyterPath(...segments: string[]): string {
  return segments
    .flatMap((segment) => segment.split("/"))
    .filter(Boolean)
    .join("/");
}

/** Produces a traversal-safe path segment for chat and attachment identifiers. */
function sanitizeIdentifier(value: string, fallback: string): string {
  const sanitized = value
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_")
    .replace(/[.\s]+$/g, "")
    .trim();
  return sanitized && sanitized !== "." && sanitized !== ".." ? sanitized : fallback;
}

/** Truncates text at a UTF-8 byte boundary without splitting a Unicode code point. */
function truncateUtf8(value: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  let result = "";
  let byteLength = 0;

  for (const character of value) {
    const characterBytes = encoder.encode(character).byteLength;
    if (byteLength + characterBytes > maxBytes) break;
    result += character;
    byteLength += characterBytes;
  }

  return result;
}

/** Limits a filename by encoded bytes while retaining its extension when possible. */
function truncateUtf8Filename(fileName: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(fileName).byteLength <= maxBytes) return fileName;

  const extensionIndex = fileName.lastIndexOf(".");
  if (extensionIndex > 0) {
    const extension = fileName.slice(extensionIndex);
    const extensionBytes = encoder.encode(extension).byteLength;
    if (extensionBytes < maxBytes) {
      const stem = truncateUtf8(fileName.slice(0, extensionIndex), maxBytes - extensionBytes);
      if (stem) return `${stem}${extension}`;
    }
  }

  return truncateUtf8(fileName, maxBytes);
}

/**
 * Produces a cross-platform-safe filename while retaining the user's extension.
 * The reserved manifest name is rewritten so file bytes cannot replace metadata.
 */
export function sanitizeChatAttachmentFilename(fileName: string): string {
  const baseName = fileName.split(/[\\/]/).at(-1) ?? "";
  let sanitized = sanitizeIdentifier(baseName, "attachment");
  if (sanitized.toLowerCase() === CHAT_ATTACHMENT_MANIFEST_NAME) {
    sanitized = `file-${sanitized}`;
  }
  if (WINDOWS_RESERVED_FILENAME_PATTERN.test(sanitized)) {
    sanitized = `file-${sanitized}`;
  }
  return truncateUtf8Filename(sanitized, MAX_CHAT_ATTACHMENT_FILENAME_BYTES) || "attachment";
}

/** Reads a browser File into the base64 payload expected by Jupyter ContentsManager. */
async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("File reader returned a non-string result."));
        return;
      }
      const commaIndex = reader.result.indexOf(",");
      if (commaIndex < 0) {
        reject(new Error("File reader returned an invalid data URL."));
        return;
      }
      resolve(reader.result.slice(commaIndex + 1).replace(/\s/g, ""));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read attachment."));
    reader.readAsDataURL(file);
  });
}

/** Creates each directory segment when it is absent from the Jupyter contents tree. */
async function ensureJupyterDirectory(
  contents: ChatAttachmentContentsManager,
  directoryPath: string
): Promise<void> {
  const segments = directoryPath.split("/").filter(Boolean);
  let current = "";

  for (const segment of segments) {
    current = joinJupyterPath(current, segment);
    try {
      const existing = await contents.get(current, { content: false });
      if (existing.type !== "directory") {
        throw new Error(`Attachment storage path '${current}' is not a directory.`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("is not a directory")) {
        throw error;
      }
      await contents.save(current, {
        type: "directory",
        format: "json",
        content: null,
      });
    }
  }
}

/**
 * Copies one browser File into Orion-managed storage on the active Jupyter server.
 * A manifest is written first so interrupted uploads remain eligible for later cleanup.
 */
export async function storeChatAttachment(
  contents: ChatAttachmentContentsManager,
  chatId: string,
  file: File,
  options: StoreChatAttachmentOptions = {}
): Promise<ChatAttachmentManifest> {
  const attachmentId = sanitizeIdentifier(
    options.attachmentId ?? crypto.randomUUID(),
    crypto.randomUUID()
  );
  const safeChatId = sanitizeIdentifier(chatId, "chat");
  const safeFileName = sanitizeChatAttachmentFilename(file.name);
  const attachmentDirectory = joinJupyterPath(
    CHAT_ATTACHMENT_ROOT,
    safeChatId,
    attachmentId
  );
  const managedPath = joinJupyterPath(attachmentDirectory, safeFileName);
  const manifest: ChatAttachmentManifest = {
    version: 1,
    attachmentId,
    originatingChatId: chatId,
    originalName: file.name || safeFileName,
    mediaType: file.type || "application/octet-stream",
    size: file.size,
    createdAt: (options.now ?? new Date()).toISOString(),
    managedPath,
  };

  await ensureJupyterDirectory(contents, attachmentDirectory);
  try {
    await contents.save(joinJupyterPath(attachmentDirectory, CHAT_ATTACHMENT_MANIFEST_NAME), {
      type: "file",
      format: "text",
      content: JSON.stringify(manifest),
    });
    await contents.save(managedPath, {
      type: "file",
      format: "base64",
      content: await readFileAsBase64(file),
    });
  } catch (error) {
    await contents.delete(attachmentDirectory).catch(() => undefined);
    throw error;
  }

  return manifest;
}

/** Builds the persisted chat reference for a successfully stored external file. */
export function buildManagedExternalFileReference(
  file: File,
  manifest: ChatAttachmentManifest
): ResolvedChatReference {
  const mediaType = file.type || "application/octet-stream";
  const locator = {
    type: "external-file" as const,
    fileName: file.name,
    mediaType,
    size: file.size,
    ...(file.lastModified > 0 ? { lastModified: file.lastModified } : {}),
    managedPath: manifest.managedPath,
    attachmentId: manifest.attachmentId,
  };

  return {
    id: `external-file:${JSON.stringify(locator)}`,
    type: "external-file",
    label: file.name,
    locator,
    status: "resolved",
    preview: `External file copied to ${manifest.managedPath} (${mediaType}, ${file.size} bytes).`,
    resolvedAt: manifest.createdAt,
    toolHint:
      `The file contents are available at Jupyter path "${manifest.managedPath}". ` +
      "Use read_file for text, or bash/Python and the relevant workspace tools for binary data.",
  };
}

/** Returns directory entries from Jupyter, or null when the directory is unavailable. */
async function listJupyterDirectory(
  contents: ChatAttachmentContentsManager,
  directoryPath: string
): Promise<Contents.IModel[] | null> {
  try {
    const model = await contents.get(directoryPath, { content: true });
    return model.type === "directory" && Array.isArray(model.content)
      ? (model.content as Contents.IModel[])
      : null;
  } catch {
    return null;
  }
}

/** Reads and validates a manifest without trusting arbitrary files under `.orion`. */
async function readAttachmentManifest(
  contents: ChatAttachmentContentsManager,
  attachmentDirectory: string,
  expectedAttachmentId: string
): Promise<ChatAttachmentManifest | null> {
  try {
    const model = await contents.get(
      joinJupyterPath(attachmentDirectory, CHAT_ATTACHMENT_MANIFEST_NAME),
      { content: true, format: "text", type: "file" }
    );
    if (typeof model.content !== "string") return null;

    const parsed = ChatAttachmentManifestSchema.safeParse(JSON.parse(model.content));
    if (!parsed.success) return null;

    const manifest = parsed.data;
    const expectedPrefix = `${attachmentDirectory}/`;
    if (
      manifest.attachmentId !== expectedAttachmentId ||
      !manifest.managedPath.startsWith(expectedPrefix) ||
      manifest.managedPath ===
        joinJupyterPath(attachmentDirectory, CHAT_ATTACHMENT_MANIFEST_NAME)
    ) {
      return null;
    }
    return manifest;
  } catch {
    return null;
  }
}

/** Finds the most recent chat activity for every managed attachment reference. */
function collectManagedAttachmentActivity(chats: readonly Chat[]): Map<string, number> {
  const latestActivity = new Map<string, number>();
  for (const chat of chats) {
    const chatUpdatedAt = chat.updatedAt.getTime();
    for (const message of chat.messages) {
      for (const reference of parseChatMessageReferences(message.metadata)) {
        const locator = reference.locator;
        if (locator.type !== "external-file" || !locator.managedPath) continue;
        latestActivity.set(
          locator.managedPath,
          Math.max(latestActivity.get(locator.managedPath) ?? 0, chatUpdatedAt)
        );
      }
    }
  }
  return latestActivity;
}

/**
 * Deletes valid managed attachment leaves whose latest referencing chat activity
 * (or manifest creation time for orphans) is older than the retention window.
 */
export async function cleanupExpiredChatAttachments(
  contents: ChatAttachmentContentsManager,
  chats: readonly Chat[],
  now = new Date()
): Promise<ChatAttachmentCleanupResult> {
  const result: ChatAttachmentCleanupResult = {
    deletedPaths: [],
    failedPaths: [],
  };
  const chatDirectories = await listJupyterDirectory(contents, CHAT_ATTACHMENT_ROOT);
  if (!chatDirectories) return result;

  const latestActivity = collectManagedAttachmentActivity(chats);
  const cutoff = now.getTime() - CHAT_ATTACHMENT_RETENTION_MS;

  for (const chatDirectory of chatDirectories) {
    if (chatDirectory.type !== "directory") continue;
    const attachmentDirectories = await listJupyterDirectory(contents, chatDirectory.path);
    if (!attachmentDirectories) continue;

    for (const attachmentDirectory of attachmentDirectories) {
      if (attachmentDirectory.type !== "directory") continue;
      const manifest = await readAttachmentManifest(
        contents,
        attachmentDirectory.path,
        attachmentDirectory.name
      );
      if (!manifest) continue;

      const relevantTimestamp =
        latestActivity.get(manifest.managedPath) ?? Date.parse(manifest.createdAt);
      if (!Number.isFinite(relevantTimestamp) || relevantTimestamp > cutoff) continue;

      try {
        await contents.delete(attachmentDirectory.path);
        result.deletedPaths.push(manifest.managedPath);
      } catch {
        result.failedPaths.push(manifest.managedPath);
      }
    }
  }

  return result;
}

/**
 * Marks references to successfully deleted managed files unavailable while
 * preserving chat timestamps and all unrelated message metadata.
 */
export function markManagedAttachmentReferencesUnavailable(
  chats: readonly Chat[],
  deletedPaths: readonly string[]
): { chats: Chat[]; changed: boolean } {
  const deleted = new Set(deletedPaths);
  if (deleted.size === 0) return { chats: [...chats], changed: false };

  let changed = false;
  const nextChats = chats.map((chat) => {
    const marked = markManagedAttachmentMessageReferencesUnavailable(
      chat.messages,
      deleted
    );
    changed ||= marked.changed;
    return marked.changed ? { ...chat, messages: marked.messages } : chat;
  });

  return { chats: nextChats, changed };
}

/**
 * Marks deleted managed references unavailable in an arbitrary UI-message-like
 * array so live chat state and persisted Chat records stay synchronized.
 */
export function markManagedAttachmentMessageReferencesUnavailable<
  TMessage extends { metadata?: unknown },
>(
  messages: readonly TMessage[],
  deletedPaths: readonly string[] | ReadonlySet<string>
): { messages: TMessage[]; changed: boolean } {
  const deleted =
    deletedPaths instanceof Set ? deletedPaths : new Set(deletedPaths);
  if (deleted.size === 0) return { messages: [...messages], changed: false };

  let changed = false;
  const nextMessages = messages.map((message) => {
    const metadata = normalizeChatMessageMetadata(message.metadata);
    const references = metadata?.references ?? [];
    let messageChanged = false;
    const nextReferences = references.map((reference) => {
      const locator = reference.locator;
      if (
        locator.type !== "external-file" ||
        !locator.managedPath ||
        !deleted.has(locator.managedPath) ||
        reference.status === "unavailable"
      ) {
        return reference;
      }
      messageChanged = true;
      return {
        ...reference,
        status: "unavailable" as const,
        toolHint:
          "This managed attachment expired after 30 days of chat inactivity and is no longer available.",
      };
    });
    if (!messageChanged) return message;

    changed = true;
    return {
      ...message,
      metadata: {
        ...metadata,
        references: nextReferences,
      },
    };
  });

  return { messages: nextMessages, changed };
}
