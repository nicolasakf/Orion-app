import { extname } from "path";

export type EditorId = "notebook" | "markdown" | "text";

export interface EditorFileReference {
  name?: string;
  path?: string;
  /** Forces files with richer native editors to open through the text editor. */
  openAsText?: boolean;
}

export interface EditorDefinition {
  id: EditorId;
  label: string;
  priority: number;
  matches: (file: EditorFileReference) => boolean;
}

/** Returns the lower-case file extension for editor matching. */
export function getEditorFileExtension(file: EditorFileReference): string {
  const candidate = file.path || file.name || "";
  return extname(candidate).slice(1).toLowerCase();
}

/** Built-in Orion editor definitions ordered by specificity. */
export const BUILT_IN_EDITOR_DEFINITIONS: EditorDefinition[] = [
  {
    id: "notebook",
    label: "Notebook",
    priority: 100,
    matches: (file) =>
      !file.openAsText && getEditorFileExtension(file) === "ipynb",
  },
  {
    id: "markdown",
    label: "Markdown",
    priority: 80,
    matches: (file) =>
      !file.openAsText &&
      ["md", "markdown", "mdx"].includes(getEditorFileExtension(file)),
  },
  {
    id: "text",
    label: "Text",
    priority: 0,
    matches: (file) => Boolean(file.path || file.name),
  },
];

/**
 * Resolves the editor definition for a file using built-in priority ordering.
 * Returns null when no file is selected.
 */
export function resolveEditorDefinition(
  file: EditorFileReference | null | undefined,
  definitions: readonly EditorDefinition[] = BUILT_IN_EDITOR_DEFINITIONS,
): EditorDefinition | null {
  if (!file || !(file.path || file.name)) {
    return null;
  }

  return (
    [...definitions]
      .sort((a, b) => b.priority - a.priority)
      .find((definition) => definition.matches(file)) ?? null
  );
}
