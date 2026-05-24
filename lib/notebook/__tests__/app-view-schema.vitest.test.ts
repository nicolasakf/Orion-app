import { describe, expect, it } from "vitest";

import {
  getNotebookAppViewMetadata,
  parseNotebookAppViewSchema,
} from "@/lib/notebook/app-view";

describe("parseNotebookAppViewSchema", () => {
  it("returns missing when no declarative schema is configured", () => {
    const result = parseNotebookAppViewSchema({
      orion: {
        appView: {
          grid: { cols: 8 },
          layout: { item: { x: 0, y: 0, w: 2, h: 2 } },
        },
      },
    });

    expect(result.status).toBe("missing");
    expect(getNotebookAppViewMetadata({}).layout).toEqual({});
  });

  it("normalizes a valid built-in schema", () => {
    const result = parseNotebookAppViewSchema({
      orion: {
        appView: {
          schema: {
            version: 1,
            primitiveRegistry: { source: "builtin" },
            root: {
              type: "Page",
              props: { gap: "sm" },
              children: [
                {
                  type: "MarkdownCell",
                  props: { cellId: "intro" },
                },
              ],
            },
          },
        },
      },
    });

    expect(result.status).toBe("valid");
    if (result.status !== "valid") return;
    expect(result.schema.root.type).toBe("Page");
    expect(result.schema.root.children[0].type).toBe("MarkdownCell");
    expect(result.schema.root.children[0].children).toEqual([]);
  });

  it("rejects unknown primitive names", () => {
    const result = parseNotebookAppViewSchema({
      orion: {
        appView: {
          schema: {
            version: 1,
            primitiveRegistry: { source: "builtin" },
            root: { type: "Hero", props: {} },
          },
        },
      },
    });

    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") return;
    expect(result.errors.join("\n")).toContain("unknown primitive 'Hero'");
  });

  it("rejects non-built-in primitive registries", () => {
    const result = parseNotebookAppViewSchema({
      orion: {
        appView: {
          schema: {
            version: 1,
            primitiveRegistry: { source: "workspace" },
            root: { type: "Page", props: {} },
          },
        },
      },
    });

    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") return;
    expect(result.errors.join("\n")).toContain("only 'builtin' is supported");
  });

  it("rejects malformed children", () => {
    const result = parseNotebookAppViewSchema({
      orion: {
        appView: {
          schema: {
            version: 1,
            primitiveRegistry: { source: "builtin" },
            root: {
              type: "Page",
              props: {},
              children: { type: "Card" },
            },
          },
        },
      },
    });

    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") return;
    expect(result.errors.join("\n")).toContain("children must be an array");
  });

  it("rejects arbitrary className and style props", () => {
    const result = parseNotebookAppViewSchema({
      orion: {
        appView: {
          schema: {
            version: 1,
            primitiveRegistry: { source: "builtin" },
            root: {
              type: "Page",
              props: { className: "p-10", style: { color: "red" } },
            },
          },
        },
      },
    });

    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") return;
    expect(result.errors.join("\n")).toContain("className is not supported");
    expect(result.errors.join("\n")).toContain("style is not supported");
  });
});
