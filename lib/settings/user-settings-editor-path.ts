/** Virtual editor path for Orion's local user settings file. */
export const USER_SETTINGS_EDITOR_PATH = "~/.orion/settings.json";

/** Returns true when the editor path refers to Orion's user settings file. */
export function isUserSettingsEditorPath(filepath: string | null | undefined): boolean {
  return filepath === USER_SETTINGS_EDITOR_PATH;
}
