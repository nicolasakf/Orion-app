// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  getEditorFileExtension,
  resolveEditorDefinition,
} from "@/lib/editor/editor-registry";

describe("editor registry resolution", () => {
  it("returns null when no file is selected", () => {
    expect(resolveEditorDefinition(null)).toBeNull();
    expect(resolveEditorDefinition({ name: "", path: "" })).toBeNull();
  });

  it("resolves notebooks unless they are forced through text mode", () => {
    expect(
      resolveEditorDefinition({ name: "analysis.ipynb", path: "analysis.ipynb" })
        ?.id,
    ).toBe("notebook");
    expect(
      resolveEditorDefinition({
        name: "analysis.ipynb",
        path: "analysis.ipynb",
        openAsText: true,
      })?.id,
    ).toBe("text");
  });

  it("resolves markdown variants to the markdown editor", () => {
    expect(resolveEditorDefinition({ path: "README.md" })?.id).toBe(
      "markdown",
    );
    expect(resolveEditorDefinition({ path: "docs/guide.markdown" })?.id).toBe(
      "markdown",
    );
    expect(resolveEditorDefinition({ path: "notes/page.mdx" })?.id).toBe(
      "markdown",
    );
  });

  it("falls back to the text editor for other files", () => {
    expect(resolveEditorDefinition({ path: "src/app.tsx" })?.id).toBe("text");
    expect(resolveEditorDefinition({ path: "data.csv" })?.id).toBe("text");
  });

  it("derives extensions from path before display name", () => {
    expect(
      getEditorFileExtension({ name: "Untitled", path: "docs/README.md" }),
    ).toBe("md");
  });
});
