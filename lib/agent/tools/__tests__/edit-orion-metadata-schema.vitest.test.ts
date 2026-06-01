import { describe, expect, it } from "vitest";

import {
  CellOrionMetadataSchema,
  NotebookOrionMetadataSchema,
} from "@/lib/agent/tools/edit-orion-metadata-schema";

describe("Orion metadata App View validation", () => {
  it("accepts cell-level App View inclusion metadata", () => {
    const result = CellOrionMetadataSchema.safeParse({
      id: "cell-result",
      app: {
        enabled: true,
        title: "Summary",
        outputs: {
          "0": { enabled: true, title: "Chart" },
          "1": { enabled: false },
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it("preserves deprecated notebook appView fields without validating schema shape", () => {
    const result = NotebookOrionMetadataSchema.safeParse({
      appView: {
        grid: { cols: 8 },
        layout: { intro: { x: 0, y: 0, w: 2, h: 2 } },
        schema: {
          version: 99,
          primitiveRegistry: { source: "workspace" },
          root: { type: "CustomThing", props: { style: { color: "red" } } },
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects notebook metadata CSS fields", () => {
    const result = NotebookOrionMetadataSchema.safeParse({
      css: ".region-control { max-width: 20rem; }",
      appView: {
        css: ".dashboard-page { padding: 2rem; }",
      },
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(
      expect.arrayContaining(["css", "appView.css"]),
    );
  });
});
