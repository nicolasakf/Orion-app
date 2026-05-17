/**
 * Re-exports from lib/shell/system-commands/constants.
 *
 * The canonical definitions have moved to the shell package so they can be
 * shared with both agent tools and future UI components. This module keeps
 * existing imports within the agent layer working without changes.
 */

export {
  DEFAULT_IGNORE_DIRS,
  BINARY_EXTENSIONS,
  globToRegex,
  parseIncludeGlobs,
} from "@/lib/shell/system-commands/constants";
