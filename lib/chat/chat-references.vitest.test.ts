import { describe, expect, it } from "vitest";

import {
  formatOutputReferenceLabel,
  formatReferencesForMessage,
  parseChatMessageReferences,
  type ResolvedChatReference,
} from "./chat-references";

describe("external file chat references", () => {
  const externalFileReference: ResolvedChatReference = {
    id: "external-file:test",
    type: "external-file",
    label: "report.pdf",
    locator: {
      type: "external-file",
      fileName: "report.pdf",
      mediaType: "application/pdf",
      size: 2048,
      lastModified: 1_700_000_000_000,
    },
    status: "resolved",
    preview: "External file: report.pdf",
    resolvedAt: "2026-05-27T00:00:00.000Z",
    toolHint:
      "This external file is pointer-only; no file contents are available through workspace tools.",
  };

  it("parses external-file metadata without absolute paths", () => {
    const references = parseChatMessageReferences({
      references: [externalFileReference],
    });

    expect(references).toHaveLength(1);
    expect(references[0]?.locator).toMatchObject({
      type: "external-file",
      fileName: "report.pdf",
      mediaType: "application/pdf",
      size: 2048,
    });
    expect(JSON.stringify(references[0])).not.toContain("/Users/");
  });

  it("formats external files as pointer-only context", () => {
    const context = formatReferencesForMessage([externalFileReference]);

    expect(context).toContain("External file: report.pdf");
    expect(context).toContain("pointer-only");
    expect(context).toContain("report.pdf (application/pdf, 2.0 KB)");
  });

  it("parses and formats managed external-file paths for agent tools", () => {
    const managedReference: ResolvedChatReference = {
      ...externalFileReference,
      locator: {
        type: "external-file",
        fileName: "report.pdf",
        mediaType: "application/pdf",
        size: 2048,
        lastModified: 1_700_000_000_000,
        managedPath: ".orion/chat-attachments/chat-1/file-1/report.pdf",
        attachmentId: "file-1",
      },
      toolHint: "Use workspace tools to read the managed path.",
    };

    const [parsed] = parseChatMessageReferences({
      references: [managedReference],
    });
    const context = formatReferencesForMessage([managedReference]);

    expect(parsed?.locator).toMatchObject({
      type: "external-file",
      managedPath: ".orion/chat-attachments/chat-1/file-1/report.pdf",
      attachmentId: "file-1",
    });
    expect(context).toContain(
      ".orion/chat-attachments/chat-1/file-1/report.pdf"
    );
    expect(context).toContain("Use workspace tools");
    expect(context).not.toContain("External file references are pointer-only");
  });
});

describe("notebook output chat references", () => {
  const outputReference: ResolvedChatReference = {
    id: "output:test",
    type: "output",
    label: formatOutputReferenceLabel(2, 1),
    locator: {
      type: "output",
      notebookPath: "/workspace/analysis.ipynb",
      cellIndex: 2,
      outputIndex: 1,
    },
    status: "resolved",
    preview: "Notebook cell 2, output 1.",
    resolvedAt: "2026-05-27T00:00:00.000Z",
    toolHint:
      'Use use_notebook with notebookPath="/workspace/analysis.ipynb", then read_cell_output with reads=[{cellIndex:2,outputIndex:1}].',
  };

  it("parses and labels output metadata", () => {
    const references = parseChatMessageReferences({
      references: [outputReference],
    });

    expect(formatOutputReferenceLabel(2, 1)).toBe("Cell #2 output #1");
    expect(references[0]?.type).toBe("output");
    expect(references[0]?.locator).toMatchObject({
      type: "output",
      cellIndex: 2,
      outputIndex: 1,
    });
  });

  it("formats output references with read_cell_output guidance", () => {
    const context = formatReferencesForMessage([outputReference]);

    expect(context).toContain("Output: Cell #2 output #1");
    expect(context).toContain("/workspace/analysis.ipynb cell 2 output 1");
    expect(context).toContain("read_cell_output");
    expect(context).not.toContain("Selected text:");
  });
});
