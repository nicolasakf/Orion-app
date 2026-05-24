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
            props: { gap: "sm" },
            children: [
              {
                type: "Input",
                props: {
                  label: "Region",
                  stateKey: "region",
                  defaultValue: "west",
                },
              },
            ],
          },
        },
      },
    });

    expect(result.success).toBe(true);
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

  it("rejects arbitrary className and style props", () => {
    const result = NotebookOrionMetadataSchema.safeParse({
      appView: {
        schema: {
          version: 1,
          primitiveRegistry: { source: "builtin" },
          root: {
            type: "Page",
            props: { className: "p-8", style: { color: "red" } },
          },
        },
      },
    });

    expect(result.success).toBe(false);
  });
});
