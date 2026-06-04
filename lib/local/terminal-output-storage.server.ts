
import { writeFile } from "fs/promises";
import os from "os";
import path from "path";

import {
  ensureTerminalOutputDirectory,
  getOrionDataDirectory,
} from "@/lib/local/orion-paths.server";

/** Formats an absolute path for agent-facing messages. */
export function formatHomeRelativePath(absolutePath: string): string {
  const orionDir = getOrionDataDirectory();
  if (absolutePath === orionDir) {
    return "~/.orion";
  }
  if (absolutePath.startsWith(`${orionDir}${path.sep}`)) {
    return path.join("~/.orion", absolutePath.slice(orionDir.length + 1));
  }

  const home = os.homedir();
  if (absolutePath === home) {
    return "~";
  }
  if (absolutePath.startsWith(`${home}${path.sep}`)) {
    return `~${absolutePath.slice(home.length)}`;
  }
  return absolutePath;
}

/**
 * Persists large bash tool output under `~/.orion/terminal` and returns a
 * home-relative path suitable for agent-facing messages.
 */
export async function saveTerminalOutputSpill(content: string): Promise<string> {
  const directory = await ensureTerminalOutputDirectory();
  const fileName = `terminal_output_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}.log`;
  const absolutePath = path.join(directory, fileName);
  await writeFile(absolutePath, content, "utf8");
  return formatHomeRelativePath(absolutePath);
}
