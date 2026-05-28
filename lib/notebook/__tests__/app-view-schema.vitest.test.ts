import { describe, expect, it } from "vitest";

import {
  addNotebookAppViewReference,
  createDefaultNotebookAppViewSchema,
  isNotebookAppViewReferenceInMetadata,
  parseNotebookAppViewSchema,
  removeNotebookAppViewReference,
  withNotebookAppViewSchema,
} from "@/lib/notebook/app-view";
import { CellType, OutputType, type NotebookType } from "@/lib/types";

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

  it("accepts className hooks and rejects style props", () => {
    const result = parseNotebookAppViewSchema({
      orion: {
        appView: {
          schema: {
            version: 1,
            primitiveRegistry: { source: "builtin" },
            root: {
              type: "Page",
              props: { className: "hero-card", style: { color: "red" } },
            },
          },
        },
      },
    });

    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") return;
    expect(result.errors.join("\n")).toContain("style is not supported");
  });

  it("rejects non-string className props", () => {
    const result = parseNotebookAppViewSchema({
      orion: {
        appView: {
          schema: {
            version: 1,
            primitiveRegistry: { source: "builtin" },
            root: {
              type: "Page",
              props: { className: ["hero-card"] },
            },
          },
        },
      },
    });

    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") return;
    expect(result.errors.join("\n")).toContain("className must be a string");
  });

  it("accepts newly added built-in primitive names", () => {
    const newPrimitives = [
      "Popover",
      "HoverCard",
      "Tooltip",
      "Carousel",
      "Avatar",
      "Calendar",
      "DatePicker",
      "Collapsible",
      "Accordion",
      "RadioGroup",
      "Progress",
      "Alert",
      "Toggle",
      "ToggleGroup",
    ] as const;

    for (const type of newPrimitives) {
      const result = parseNotebookAppViewSchema({
        orion: {
          appView: {
            schema: {
              version: 1,
              primitiveRegistry: { source: "builtin" },
              root: { type, props: {} },
            },
          },
        },
      });

      expect(result.status).toBe("valid");
      if (result.status !== "valid") return;
      expect(result.schema.root.type).toBe(type);
    }
  });
});

describe("declarative App View schema mutations", () => {
  function makeNotebook(metadata: NotebookType["metadata"] = {}): NotebookType {
    return {
      cells: [
        {
          cell_type: CellType.MARKDOWN,
          source: ["# Intro"],
          metadata: { orion: { id: "intro", app: { enabled: true } } },
        },
        {
          cell_type: CellType.CODE,
          source: ["print('chart')"],
          metadata: {
            orion: {
              id: "chart",
              app: { outputs: { "0": { enabled: true } } },
            },
          },
          execution_count: 1,
          outputs: [
            {
              output_type: OutputType.DISPLAY_DATA,
              data: { "text/plain": ["x"] },
            },
          ],
        },
      ],
      metadata,
      nbformat: 4,
      nbformat_minor: 5,
    };
  }

  it("creates the default root schema used by manual additions", () => {
    expect(createDefaultNotebookAppViewSchema()).toEqual({
      version: 1,
      primitiveRegistry: { source: "builtin" },
      root: {
        type: "Page",
        props: { gap: "lg", padding: "md" },
        children: [],
      },
    });
  });

  it("adds markdown and output references to a missing schema", () => {
    const withMarkdown = addNotebookAppViewReference(makeNotebook(), {
      kind: "markdown",
      cellId: "intro",
    });
    const withOutput = addNotebookAppViewReference(withMarkdown, {
      kind: "output",
      cellId: "chart",
      outputIndex: 0,
    });
    const result = parseNotebookAppViewSchema(withOutput.metadata);

    expect(result.status).toBe("valid");
    if (result.status !== "valid") return;
    expect(result.schema.root.children).toEqual([
      { type: "MarkdownCell", props: { cellId: "intro" }, children: [] },
      {
        type: "Output",
        props: { cellId: "chart", outputIndex: 0 },
        children: [],
      },
    ]);
  });

  it("adds all output references with repeated helper calls", () => {
    const withFirstOutput = addNotebookAppViewReference(makeNotebook(), {
      kind: "output",
      cellId: "chart",
      outputIndex: 0,
    });
    const withSecondOutput = addNotebookAppViewReference(withFirstOutput, {
      kind: "output",
      cellId: "chart",
      outputIndex: 1,
    });
    const result = parseNotebookAppViewSchema(withSecondOutput.metadata);

    expect(result.status).toBe("valid");
    if (result.status !== "valid") return;
    expect(result.schema.root.children).toEqual([
      {
        type: "Output",
        props: { cellId: "chart", outputIndex: 0 },
        children: [],
      },
      {
        type: "Output",
        props: { cellId: "chart", outputIndex: 1 },
        children: [],
      },
    ]);
  });

  it("wraps non-Page schema roots before appending manual references", () => {
    const notebook = withNotebookAppViewSchema(makeNotebook(), {
      version: 1,
      primitiveRegistry: { source: "builtin" },
      root: { type: "MarkdownCell", props: { cellId: "intro" }, children: [] },
    });
    const nextNotebook = addNotebookAppViewReference(notebook, {
      kind: "output",
      cellId: "chart",
      outputIndex: 0,
    });
    const result = parseNotebookAppViewSchema(nextNotebook.metadata);

    expect(result.status).toBe("valid");
    if (result.status !== "valid") return;
    expect(result.schema.root.type).toBe("Page");
    expect(result.schema.root.children).toEqual([
      { type: "MarkdownCell", props: { cellId: "intro" }, children: [] },
      {
        type: "Output",
        props: { cellId: "chart", outputIndex: 0 },
        children: [],
      },
    ]);
  });

  it("avoids duplicate schema references", () => {
    const reference = {
      kind: "output" as const,
      cellId: "chart",
      outputIndex: 0,
    };
    const once = addNotebookAppViewReference(makeNotebook(), reference);
    const twice = addNotebookAppViewReference(once, reference);
    const result = parseNotebookAppViewSchema(twice.metadata);

    expect(result.status).toBe("valid");
    if (result.status !== "valid") return;
    expect(result.schema.root.children).toHaveLength(1);
  });

  it("removes matching references", () => {
    const reference = { kind: "markdown" as const, cellId: "intro" };
    const added = addNotebookAppViewReference(makeNotebook(), reference);
    const removed = removeNotebookAppViewReference(added, reference);

    expect(
      isNotebookAppViewReferenceInMetadata(removed.metadata, reference),
    ).toBe(false);
    const result = parseNotebookAppViewSchema(removed.metadata);
    expect(result.status).toBe("valid");
    if (result.status !== "valid") return;
    expect(result.schema.root.children).toEqual([]);
  });

  it("preserves unrelated Orion metadata when writing the schema", () => {
    const notebook = makeNotebook({
      title: "Analysis",
      orion: {
        subagent: { model: "test-model" },
        appView: { layout: { stale: { x: 0, y: 0, w: 1, h: 1 } } },
      },
    });
    const nextNotebook = withNotebookAppViewSchema(
      notebook,
      createDefaultNotebookAppViewSchema(),
    );

    expect(nextNotebook.metadata?.title).toBe("Analysis");
    expect(nextNotebook.metadata?.orion?.subagent).toEqual({
      model: "test-model",
    });
    expect(nextNotebook.metadata?.orion?.appView?.layout).toEqual({
      stale: { x: 0, y: 0, w: 1, h: 1 },
    });
  });

  it("ignores legacy app/layout metadata when checking inclusion", () => {
    const notebook = makeNotebook({
      orion: {
        appView: {
          grid: { cols: 8 },
          layout: { intro: { x: 0, y: 0, w: 2, h: 2 } },
        },
      },
    });

    expect(
      isNotebookAppViewReferenceInMetadata(notebook.metadata, {
        kind: "markdown",
        cellId: "intro",
      }),
    ).toBe(false);
    expect(
      isNotebookAppViewReferenceInMetadata(notebook.metadata, {
        kind: "output",
        cellId: "chart",
        outputIndex: 0,
      }),
    ).toBe(false);
  });
});
