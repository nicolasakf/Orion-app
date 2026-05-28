import { describe, expect, it } from "vitest";

import { NotebookOrionMetadataSchema } from "@/lib/agent/tools/edit-orion-metadata-schema";

describe("NotebookOrionMetadataSchema appView schema validation", () => {
  it("accepts the built-in declarative app-view schema contract", () => {
    const result = NotebookOrionMetadataSchema.safeParse({
      appView: {
        schema: {
          version: 1,
          primitiveRegistry: { source: "builtin" },
          root: {
            type: "Page",
            props: { gap: "sm", className: "dashboard-page" },
            children: [
              {
                type: "Input",
                props: {
                  label: "Region",
                  stateKey: "region",
                  defaultValue: "west",
                  className: "region-control",
                },
              },
            ],
          },
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

  it("rejects custom primitive registries in v1", () => {
    const result = NotebookOrionMetadataSchema.safeParse({
      appView: {
        schema: {
          version: 1,
          primitiveRegistry: { source: "workspace" },
          root: { type: "Page" },
        },
      },
    });

    expect(result.success).toBe(false);
  });

  it("accepts className hooks but rejects style props", () => {
    const result = NotebookOrionMetadataSchema.safeParse({
      appView: {
        schema: {
          version: 1,
          primitiveRegistry: { source: "builtin" },
          root: {
            type: "Page",
            props: { className: "dashboard-page", style: { color: "red" } },
          },
        },
      },
    });

    expect(result.success).toBe(false);
  });
});
