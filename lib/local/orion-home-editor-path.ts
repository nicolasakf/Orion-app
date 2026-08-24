import { isPersonalContextEditorPath } from "@/lib/onboarding/personal-context-editor-path";
import { isUserSettingsEditorPath } from "@/lib/settings/user-settings-editor-path";

/**
 * Returns true when the editor path is a virtual `~/.orion` file loaded outside
 * Jupyter ContentsManager.
 */
export function isOrionHomeEditorPath(
  filepath: string | null | undefined,
): boolean {
  return isUserSettingsEditorPath(filepath) || isPersonalContextEditorPath(filepath);
}
