import { execFile } from "child_process";
import { readFile } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";

import { NextResponse } from "next/server";

import { LauncherJupyterConnectionSchema } from "@/lib/kernel/launcher-connection";
import { getJupyterConnectionFilePath } from "@/lib/local/orion-paths.server";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

/** Escapes a string for interpolation into an AppleScript quoted string. */
function appleScriptString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Converts an absolute local folder into a Jupyter-relative path under the server root. */
function toJupyterRelativePath(rootDirectory: string, absoluteFolderPath: string): string | null {
  const root = path.resolve(rootDirectory);
  const target = path.resolve(absoluteFolderPath);
  const relative = path.relative(root, target);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }

  return relative.split(path.sep).join("/");
}

/** Returns a display name for an absolute directory path, including root selections. */
function directoryName(directoryPath: string): string {
  const normalized = directoryPath.replace(/[\\/]+$/, "");
  return path.basename(normalized) || directoryPath;
}

/** Reads the Jupyter root directory from the local CLI handoff, falling back to the home directory. */
async function readJupyterRootDirectory(): Promise<string> {
  try {
    const raw = await readFile(getJupyterConnectionFilePath(), "utf8");
    const parsed = LauncherJupyterConnectionSchema.parse(JSON.parse(raw));
    return parsed.rootDirectory ?? os.homedir();
  } catch {
    return os.homedir();
  }
}

/** Opens the macOS folder picker and returns the selected absolute folder path. */
async function showMacFolderDialog(defaultDirectory: string): Promise<string | null> {
  const script = [
    `set defaultFolder to POSIX file ${appleScriptString(defaultDirectory)}`,
    `set chosenFolder to choose folder with prompt "Choose a project folder:" default location defaultFolder`,
    "POSIX path of chosenFolder",
  ].join("\n");

  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], {
      timeout: 10 * 60 * 1000,
    });
    return stdout.trim() || null;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The folder picker was cancelled.";
    if (/user canceled|(-128)/i.test(message)) return null;
    throw error;
  }
}

/** Opens a native folder picker for local project selection. */
async function showNativeFolderDialog(defaultDirectory: string): Promise<string | null> {
  if (process.platform === "darwin") return showMacFolderDialog(defaultDirectory);

  throw new Error(
    "Native project folder picker fallback is currently supported on macOS.",
  );
}

/** Opens a native folder picker and returns its Jupyter-relative project path. */
export async function POST(): Promise<Response> {
  const rootDirectory = await readJupyterRootDirectory();
  let selectedPath: string | null;
  try {
    selectedPath = await showNativeFolderDialog(rootDirectory);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Failed to open the native project folder picker.",
      },
      { status: 500 },
    );
  }

  if (!selectedPath) {
    return NextResponse.json({ message: "Project selection cancelled." }, { status: 499 });
  }

  const projectPath = toJupyterRelativePath(rootDirectory, selectedPath);
  if (projectPath === null) {
    return NextResponse.json(
      {
        message:
          "Choose a folder inside the active Jupyter root so Orion can open it.",
        rootDirectory,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    path: projectPath,
    name: directoryName(selectedPath),
    rootDirectory,
  });
}
