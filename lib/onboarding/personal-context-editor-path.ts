/** Virtual editor path for the user-maintained personal context file. */
export const PERSONAL_CONTEXT_EDITOR_PATH = "~/.orion/ORION.md";

/** Dispatched after `ORION.md` is written or deleted outside the open editor. */
export const PERSONAL_CONTEXT_FILE_CHANGED_EVENT =
  "orion:personal-context-file-changed";

/** Returns true when the editor path refers to Orion's personal context file. */
export function isPersonalContextEditorPath(
  filepath: string | null | undefined,
): boolean {
  return filepath === PERSONAL_CONTEXT_EDITOR_PATH;
}
