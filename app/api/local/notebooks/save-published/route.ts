import { execFile } from "child_process";
import { mkdir, readFile, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";

import { NextResponse } from "next/server";
import { z } from "zod";

import { getJupyterConnectionFilePath } from "@/lib/local/orion-paths.server";
import { LauncherJupyterConnectionSchema } from "@/lib/kernel/launcher-connection";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

const SavePublishedNotebookRequestSchema = z.object({
  filename: z.string().trim().min(1),
  notebook: z.record(z.string(), z.unknown()),
});

/** Escapes a string for interpolation into an AppleScript quoted string. */
function appleScriptString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Ensures downloaded notebooks are saved with a notebook file extension. */
function ensureNotebookExtension(filePath: string): string {
  return filePath.toLowerCase().endsWith(".ipynb") ? filePath : `${filePath}.ipynb`;
}

/** Keeps native dialog default names to a filename rather than a path. */
function sanitizeDefaultFilename(filename: string): string {
  const basename = filename.split(/[\\/]/).filter(Boolean).pop() ?? "published-notebook.ipynb";
  const safe = basename.replace(/[^\w.\- ()]/g, "_").replace(/\.ipynb$/i, "").trim();
  return `${safe || "published-notebook"}.ipynb`;
}

/** Converts an absolute local path into a Jupyter-relative path under the server root. */
function toJupyterRelativePath(rootDirectory: string, absoluteFilePath: string): string | null {
  const root = path.resolve(rootDirectory);
  const target = path.resolve(absoluteFilePath);
  const relative = path.relative(root, target);

  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }

  return relative.split(path.sep).join("/");
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

/** Opens the macOS save dialog and returns the selected absolute file path. */
async function showMacSaveDialog(options: {
  defaultDirectory: string;
  filename: string;
}): Promise<string | null> {
  const script = [
    `set defaultFolder to POSIX file ${appleScriptString(options.defaultDirectory)}`,
    `set chosenFile to choose file name with prompt "Save published Orion notebook as:" default name ${appleScriptString(options.filename)} default location defaultFolder`,
    "POSIX path of chosenFile",
  ].join("\n");

  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], {
      timeout: 10 * 60 * 1000,
    });
    return stdout.trim() || null;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The save dialog was cancelled.";
    if (/user canceled|(-128)/i.test(message)) return null;
    throw error;
  }
}

/** Opens a native save dialog for the current OS. */
async function showNativeSaveDialog(options: {
  defaultDirectory: string;
  filename: string;
}): Promise<string | null> {
  if (process.platform === "darwin") return showMacSaveDialog(options);

  throw new Error(
    "Native save picker is currently supported on macOS for local Orion imports.",
  );
}

/** Opens a native save picker, writes the published notebook, and returns its Jupyter path. */
export async function POST(request: Request): Promise<Response> {
  const body = SavePublishedNotebookRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { message: "Invalid published notebook save request." },
      { status: 400 },
    );
  }

  const rootDirectory = await readJupyterRootDirectory();
  let selectedPath: string | null;
  try {
    selectedPath = await showNativeSaveDialog({
      defaultDirectory: rootDirectory,
      filename: sanitizeDefaultFilename(body.data.filename),
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Failed to open the native save picker.",
      },
      { status: 500 },
    );
  }

  if (!selectedPath) {
    return NextResponse.json({ message: "Save cancelled." }, { status: 499 });
  }

  const targetPath = ensureNotebookExtension(selectedPath);
  const jupyterPath = toJupyterRelativePath(rootDirectory, targetPath);
  if (!jupyterPath) {
    return NextResponse.json(
      {
        message:
          "Choose a save location inside the active Jupyter root so Orion can open the notebook.",
        rootDirectory,
      },
      { status: 400 },
    );
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(body.data.notebook, null, 2)}\n`, "utf8");

  return NextResponse.json({
    path: jupyterPath,
    name: path.basename(targetPath),
    rootDirectory,
  });
}
