import { describe, expect, it } from "vitest";

import {
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
});
