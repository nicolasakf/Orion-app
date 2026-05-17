/**
 * Reveal a file or folder in the OS native file manager.
 *
 * Behaviour per platform:
 *   macOS   — `open -R '<path>'`        → reveals the item in Finder
 *   Linux   — `xdg-open '<parentDir>'`  → opens the parent directory
 *   Windows — `explorer /select,"<path>"` → selects the item in Explorer
 *
 * Command strings must match the **default shell** Jupyter uses on that OS
 * (zsh/bash on macOS/Linux; PowerShell on Windows). Bash-only `case` snippets
 * break when pasted into PowerShell.
 *
 * The reveal helper is intentionally fire-and-forget — it does not wait for
 * confirmation that the file manager actually opened successfully.
 */

import type { KernelService } from "@/lib/kernel/kernel-service";
import type { TerminalPool } from "../terminal-pool";
import { executeInSystemTerminal } from "../terminal-executor";
import { detectClientPlatformOs, type PlatformOS } from "@/lib/utils";

/**
 * Escape a path for use inside a PowerShell single-quoted literal.
 */
function escapePowerShellSingleQuoted(path: string): string {
  return path.replace(/'/g, "''");
}

/**
 * Build a one-line shell command for the given client OS.
 */
function buildRevealInFileManagerCommand(path: string, os: PlatformOS): string {
  const safePath = path.replace(/'/g, "'\\''");
  const parentDir = path.includes("/")
    ? path.substring(0, path.lastIndexOf("/")) || "."
    : ".";
  const safeParentDir = parentDir.replace(/'/g, "'\\''");
  const winPath = path.replace(/\//g, "\\");

  switch (os) {
    case "windows": {
      const arg = escapePowerShellSingleQuoted(`/select,${winPath}`);
      return `Start-Process -FilePath explorer.exe -ArgumentList '${arg}'`;
    }
    case "macos": {
      return `open -R '${safePath}'`;
    }
    case "linux": {
      return `xdg-open '${safeParentDir}' 2>/dev/null || true`;
    }
    default: {
      // Remote / odd clients: POSIX fallback (matches prior uname-based script).
      return [
        `_ORION_PLATFORM=$(uname -s 2>/dev/null || echo Windows)`,
        `case "$_ORION_PLATFORM" in`,
        `  Darwin) open -R '${safePath}' ;;`,
        `  Linux)  xdg-open '${safeParentDir}' 2>/dev/null || true ;;`,
        `  *)      explorer /select,"${path.replace(/\//g, "\\")}" 2>/dev/null || true ;;`,
        `esac`,
      ].join("; ");
    }
  }
}

/**
 * Build a one-line command to open a path in the OS default application.
 */
function buildOpenPathCommand(path: string, os: PlatformOS): string {
  const safePath = path.replace(/'/g, "'\\''");
  const windowsPowerShellPath = escapePowerShellSingleQuoted(
    path.replace(/\//g, "\\")
  );

  switch (os) {
    case "windows": {
      return `Start-Process explorer.exe -ArgumentList '${windowsPowerShellPath}'`;
    }
    case "macos": {
      return `open '${safePath}' >/dev/null 2>&1`;
    }
    case "linux": {
      return `xdg-open '${safePath}' >/dev/null 2>&1 || true`;
    }
    default: {
      return [
        `_ORION_PLATFORM=$(uname -s 2>/dev/null || echo Windows)`,
        `case "$_ORION_PLATFORM" in`,
        `  Darwin) open '${safePath}' >/dev/null 2>&1 ;;`,
        `  Linux)  xdg-open '${safePath}' >/dev/null 2>&1 || true ;;`,
        `  *)      explorer "${path.replace(/\//g, "\\").replace(/"/g, '\\"')}" >/dev/null 2>&1 || true ;;`,
        `esac`,
      ].join("; ");
    }
  }
}

/**
 * Reveals the given path in the OS native file manager.
 *
 * @param kernelService - Active KernelService used to create and write to a terminal.
 * @param path          - Workspace-relative (or absolute) path to reveal.
 */
export async function openFile(
  kernelService: KernelService,
  path: string
): Promise<void> {
  const os = detectClientPlatformOs();
  const command = buildRevealInFileManagerCommand(path, os);

  let terminalName: string | null = null;
  try {
    terminalName = await kernelService.startTerminal();
    kernelService.sendToTerminal(terminalName, `${command}\r`);
  } finally { }
}

/**
 * Opens the given path in the user's OS-default application through a pooled
 * system terminal. This is intended for formats Orion cannot edit natively.
 *
 * @param pool          - TerminalPool used to acquire a system terminal.
 * @param kernelService - Active KernelService used for terminal I/O.
 * @param path          - Workspace-relative or absolute path to open.
 */
export async function openPathInSystemTerminal(
  pool: TerminalPool,
  kernelService: KernelService,
  path: string
): Promise<void> {
  const os = detectClientPlatformOs();
  const command = buildOpenPathCommand(path, os);

  await executeInSystemTerminal(pool, kernelService, {
    command,
    timeoutMs: 5_000,
  });
}
