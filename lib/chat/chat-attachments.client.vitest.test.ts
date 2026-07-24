import type { Contents } from "@jupyterlab/services";
import { describe, expect, it, vi } from "vitest";

import type { Chat } from "@/lib/chat/chat-types";

import {
  buildManagedExternalFileReference,
  CHAT_ATTACHMENT_CLEANUP_INTERVAL_MS,
  CHAT_ATTACHMENT_MANIFEST_NAME,
  CHAT_ATTACHMENT_RETENTION_MS,
  cleanupExpiredChatAttachments,
  markManagedAttachmentReferencesUnavailable,
  scheduleChatAttachmentCleanup,
  sanitizeChatAttachmentFilename,
  storeChatAttachment,
  type ChatAttachmentContentsManager,
} from "./chat-attachments.client";

type StoredNode =
  | { type: "directory"; content: null }
  | { type: "file"; content: string; format: "base64" | "text" };

/** Creates a minimal in-memory Jupyter ContentsManager for attachment tests. */
function createMemoryContents(): ChatAttachmentContentsManager & {
  nodes: Map<string, StoredNode>;
} {
  const nodes = new Map<string, StoredNode>();

  const get = vi.fn(async (path: string, options?: Partial<Contents.IFetchOptions>) => {
    const node = nodes.get(path);
    if (!node) throw new Error(`404: ${path}`);

    if (node.type === "directory") {
      const prefix = path ? `${path}/` : "";
      const childNames = new Set<string>();
      for (const storedPath of nodes.keys()) {
        if (!storedPath.startsWith(prefix) || storedPath === path) continue;
        const childName = storedPath.slice(prefix.length).split("/")[0];
        if (childName) childNames.add(childName);
      }
      const content = [...childNames].map((name) => {
        const childPath = prefix ? `${prefix}${name}` : name;
        const child = nodes.get(childPath);
        return {
          name,
          path: childPath,
          type: child?.type ?? "directory",
          content: null,
        };
      });
      return {
        name: path.split("/").at(-1) ?? "",
        path,
        type: "directory",
        content: options?.content === false ? null : content,
      } as Contents.IModel;
    }

    return {
      name: path.split("/").at(-1) ?? "",
      path,
      type: "file",
      format: node.format,
      content: options?.content === false ? null : node.content,
    } as Contents.IModel;
  });

  const save = vi.fn(async (path: string, options?: Partial<Contents.IModel>) => {
    if (options?.type === "directory") {
      nodes.set(path, { type: "directory", content: null });
    } else {
      nodes.set(path, {
        type: "file",
        content: String(options?.content ?? ""),
        format: options?.format === "base64" ? "base64" : "text",
      });
    }
    return get(path, { content: true });
  });

  const deletePath = vi.fn(async (path: string) => {
    for (const storedPath of [...nodes.keys()]) {
      if (storedPath === path || storedPath.startsWith(`${path}/`)) {
        nodes.delete(storedPath);
      }
    }
  });

  return {
    nodes,
    get,
    save,
    delete: deletePath,
  } as unknown as ChatAttachmentContentsManager & {
    nodes: Map<string, StoredNode>;
  };
}

/** Creates one chat containing a managed external-file reference. */
function createChat(
  id: string,
  updatedAt: Date,
  reference: ReturnType<typeof buildManagedExternalFileReference>
): Chat {
  return {
    id,
    title: id,
    createdAt: updatedAt,
    updatedAt,
    messages: [
      {
        id: `${id}-message`,
        role: "user",
        parts: [{ type: "text", text: "Attached file" }],
        metadata: { references: [reference] },
        timestamp: updatedAt,
      },
    ],
  };
}

describe("managed chat attachment storage", () => {
  it("stores exact non-image bytes and a validated manifest", async () => {
    const contents = createMemoryContents();
    const file = new File(
      [new Uint8Array([0x00, 0xff, 0x80, 0x40])],
      "bytes.bin",
      { type: "application/octet-stream" }
    );

    const manifest = await storeChatAttachment(contents, "chat-1", file, {
      attachmentId: "attachment-1",
      now: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(manifest.managedPath).toBe(
      ".orion/chat-attachments/chat-1/attachment-1/bytes.bin"
    );
    expect(contents.nodes.get(manifest.managedPath)).toEqual({
      type: "file",
      format: "base64",
      content: "AP+AQA==",
    });
    const storedManifest = contents.nodes.get(
      `.orion/chat-attachments/chat-1/attachment-1/${CHAT_ATTACHMENT_MANIFEST_NAME}`
    );
    expect(storedManifest?.type).toBe("file");
    expect(
      storedManifest?.type === "file" ? JSON.parse(storedManifest.content) : null
    ).toMatchObject({
      attachmentId: "attachment-1",
      originatingChatId: "chat-1",
      originalName: "bytes.bin",
      size: 4,
      managedPath: manifest.managedPath,
    });
  });

  it("uses independent attachment directories for duplicate filenames", async () => {
    const contents = createMemoryContents();
    const file = new File(["same"], "data.csv", { type: "text/csv" });

    const first = await storeChatAttachment(contents, "chat-1", file, {
      attachmentId: "first",
    });
    const second = await storeChatAttachment(contents, "chat-1", file, {
      attachmentId: "second",
    });

    expect(first.managedPath).not.toBe(second.managedPath);
    expect(contents.nodes.has(first.managedPath)).toBe(true);
    expect(contents.nodes.has(second.managedPath)).toBe(true);
  });

  it("sanitizes unsafe and reserved filenames and supports empty files", async () => {
    expect(sanitizeChatAttachmentFilename("../../report?.csv")).toBe("report_.csv");
    expect(sanitizeChatAttachmentFilename("manifest.json")).toBe("file-manifest.json");
    expect(sanitizeChatAttachmentFilename("CON.txt")).toBe("file-CON.txt");

    const longUnicodeName = sanitizeChatAttachmentFilename(`${"😀".repeat(100)}.txt`);
    expect(new TextEncoder().encode(longUnicodeName)).toHaveLength(240);
    expect(longUnicodeName.endsWith(".txt")).toBe(true);

    const contents = createMemoryContents();
    const manifest = await storeChatAttachment(
      contents,
      "chat-1",
      new File([], "empty.bin", { type: "application/octet-stream" }),
      { attachmentId: "empty" }
    );
    expect(contents.nodes.get(manifest.managedPath)).toMatchObject({
      type: "file",
      format: "base64",
      content: "",
    });
  });

  it("removes the partial attachment directory when upload fails", async () => {
    const contents = createMemoryContents();
    const originalSave = contents.save;
    contents.save = vi.fn(async (path, options) => {
      if (options?.format === "base64") throw new Error("upload failed");
      return originalSave(path, options);
    });

    await expect(
      storeChatAttachment(
        contents,
        "chat-1",
        new File(["data"], "data.bin"),
        { attachmentId: "broken" }
      )
    ).rejects.toThrow("upload failed");

    expect(
      [...contents.nodes.keys()].some((path) => path.includes("/broken"))
    ).toBe(false);
  });
});

describe("managed chat attachment cleanup", () => {
  it("runs cleanup immediately and once per day until disposed", async () => {
    vi.useFakeTimers();
    try {
      const runCleanup = vi.fn().mockResolvedValue(undefined);
      const dispose = scheduleChatAttachmentCleanup(runCleanup);

      expect(runCleanup).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(CHAT_ATTACHMENT_CLEANUP_INTERVAL_MS);
      expect(runCleanup).toHaveBeenCalledTimes(2);

      dispose();
      await vi.advanceTimersByTimeAsync(CHAT_ATTACHMENT_CLEANUP_INTERVAL_MS);
      expect(runCleanup).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps attachments referenced by a recently updated chat", async () => {
    const contents = createMemoryContents();
    const now = new Date("2026-07-31T00:00:00.000Z");
    const file = new File(["data"], "data.csv", { type: "text/csv" });
    const manifest = await storeChatAttachment(contents, "source", file, {
      attachmentId: "active",
      now: new Date(now.getTime() - CHAT_ATTACHMENT_RETENTION_MS * 2),
    });
    const reference = buildManagedExternalFileReference(file, manifest);

    const result = await cleanupExpiredChatAttachments(
      contents,
      [createChat("active-chat", new Date("2026-07-30T00:00:00.000Z"), reference)],
      now
    );

    expect(result.deletedPaths).toEqual([]);
    expect(contents.nodes.has(manifest.managedPath)).toBe(true);
  });

  it("uses the newest referencing fork activity before expiring a shared file", async () => {
    const contents = createMemoryContents();
    const now = new Date("2026-07-31T00:00:00.000Z");
    const file = new File(["data"], "fork.csv", { type: "text/csv" });
    const manifest = await storeChatAttachment(contents, "source", file, {
      attachmentId: "shared",
      now: new Date("2026-05-01T00:00:00.000Z"),
    });
    const reference = buildManagedExternalFileReference(file, manifest);

    const result = await cleanupExpiredChatAttachments(
      contents,
      [
        createChat("source", new Date("2026-05-15T00:00:00.000Z"), reference),
        createChat("fork", new Date("2026-07-20T00:00:00.000Z"), reference),
      ],
      now
    );

    expect(result.deletedPaths).toEqual([]);
  });

  it("deletes inactive and orphaned files, then marks historical references unavailable", async () => {
    const contents = createMemoryContents();
    const now = new Date("2026-07-31T00:00:00.000Z");
    const oldDate = new Date("2026-05-01T00:00:00.000Z");
    const referencedFile = new File(["old"], "old.txt", { type: "text/plain" });
    const orphanFile = new File(["orphan"], "orphan.txt", { type: "text/plain" });
    const referencedManifest = await storeChatAttachment(contents, "old-chat", referencedFile, {
      attachmentId: "referenced",
      now: oldDate,
    });
    const orphanManifest = await storeChatAttachment(contents, "old-chat", orphanFile, {
      attachmentId: "orphan",
      now: oldDate,
    });
    const reference = buildManagedExternalFileReference(
      referencedFile,
      referencedManifest
    );
    const chat = createChat("old-chat", oldDate, reference);

    const cleanup = await cleanupExpiredChatAttachments(contents, [chat], now);
    const marked = markManagedAttachmentReferencesUnavailable(
      [chat],
      cleanup.deletedPaths
    );

    expect(cleanup.deletedPaths).toEqual(
      expect.arrayContaining([
        referencedManifest.managedPath,
        orphanManifest.managedPath,
      ])
    );
    expect(marked.changed).toBe(true);
    expect(marked.chats[0]?.updatedAt).toEqual(oldDate);
    expect(
      marked.chats[0]?.messages[0]?.metadata?.references?.[0]?.status
    ).toBe("unavailable");
  });

  it("skips malformed manifests and reports deletion failures without marking them deleted", async () => {
    const contents = createMemoryContents();
    await contents.save(".orion", { type: "directory", content: null, format: "json" });
    await contents.save(".orion/chat-attachments", {
      type: "directory",
      content: null,
      format: "json",
    });
    await contents.save(".orion/chat-attachments/chat", {
      type: "directory",
      content: null,
      format: "json",
    });
    await contents.save(".orion/chat-attachments/chat/malformed", {
      type: "directory",
      content: null,
      format: "json",
    });
    await contents.save(
      `.orion/chat-attachments/chat/malformed/${CHAT_ATTACHMENT_MANIFEST_NAME}`,
      { type: "file", format: "text", content: "{not-json" }
    );

    const file = new File(["old"], "old.txt", { type: "text/plain" });
    const manifest = await storeChatAttachment(contents, "chat", file, {
      attachmentId: "undeletable",
      now: new Date("2026-05-01T00:00:00.000Z"),
    });
    const originalDelete = contents.delete;
    contents.delete = vi.fn(async (path) => {
      if (path.endsWith("/undeletable")) throw new Error("denied");
      return originalDelete(path);
    });

    const result = await cleanupExpiredChatAttachments(
      contents,
      [],
      new Date("2026-07-31T00:00:00.000Z")
    );

    expect(result.deletedPaths).toEqual([]);
    expect(result.failedPaths).toEqual([manifest.managedPath]);
    expect(contents.nodes.has(manifest.managedPath)).toBe(true);
    expect(contents.nodes.has(".orion/chat-attachments/chat/malformed")).toBe(true);
  });
});
