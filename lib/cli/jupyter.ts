import { randomBytes } from "crypto";
import { spawn, type ChildProcess } from "child_process";
import { mkdir, readFile, writeFile } from "fs/promises";
import { createServer } from "net";
import os from "os";
import path from "path";

import type { JupyterCapabilities, LauncherJupyterConnection } from "../kernel/launcher-connection";
import {
  resolveJupyterConnectionFilePath,
  resolveOrionRuntimeDirectory,
} from "./paths";
import type { PythonRuntime } from "./python";

export interface CapabilityCheckResult {
  ok: boolean;
  capabilities: JupyterCapabilities;
  jupyterVersion: string;
  missing: Array<keyof Omit<JupyterCapabilities, "sysInfo">>;
}

export interface StartedJupyterServer {
  process: ChildProcess;
  baseUrl: string;
  token: string;
  pythonPath: string;
  dispose: () => void;
}

/** Returns a free local TCP port on 127.0.0.1. */
export async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "object" && address?.port) {
        server.close(() => resolve(address.port));
      } else {
        server.close();
        reject(new Error("Could not resolve a free local port."));
      }
    });
    server.on("error", reject);
  });
}

/** Returns whether a Python command can import Jupyter Server. */
export async function hasJupyterServerCommand(
  command: string,
  argsPrefix: string[] = []
): Promise<boolean> {
  const args = [
    ...argsPrefix,
    "-c",
    "import jupyter_server",
  ];

  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("exit", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

/** Returns whether a Python runtime can import Jupyter Server. */
export async function hasJupyterServer(runtime: PythonRuntime): Promise<boolean> {
  return hasJupyterServerCommand(
    runtime.candidate.command,
    runtime.candidate.argsPrefix
  );
}

/** Normalizes a Jupyter base URL to include a trailing slash. */
function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

/** Requests JSON from a Jupyter API endpoint using token auth. */
async function requestJupyterJson(
  baseUrl: string,
  endpoint: string,
  token: string | undefined,
): Promise<unknown> {
  const url = new URL(endpoint, normalizeBaseUrl(baseUrl));
  if (token) {
    url.searchParams.set("token", token);
  }

  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `token ${token}`);
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`${endpoint} returned ${response.status}`);
  }
  return response.json();
}

/** Verifies Orion-required Jupyter APIs instead of relying on version alone. */
export async function checkJupyterCapabilities(
  baseUrl: string,
  token?: string,
): Promise<CapabilityCheckResult> {
  let jupyterVersion = "unknown";
  const capabilities: JupyterCapabilities = {
    kernelspecs: false,
    sessions: false,
    kernels: false,
    contents: false,
    terminals: false,
    sysInfo: false,
  };

  try {
    const apiData = (await requestJupyterJson(baseUrl, "api", token)) as Record<
      string,
      unknown
    >;
    jupyterVersion = String(
      apiData.version ??
        apiData.server_version ??
        apiData.jupyter_server_version ??
        "unknown"
    );
  } catch {
    // Individual capability checks below produce the actionable result.
  }

  try {
    const data = (await requestJupyterJson(baseUrl, "api/kernelspecs", token)) as Record<
      string,
      unknown
    >;
    capabilities.kernelspecs = typeof data.kernelspecs === "object" && data.kernelspecs !== null;
  } catch {
    capabilities.kernelspecs = false;
  }

  for (const [endpoint, capability] of [
    ["api/sessions", "sessions"],
    ["api/kernels", "kernels"],
    ["api/terminals", "terminals"],
  ] as const) {
    try {
      capabilities[capability] = Array.isArray(
        await requestJupyterJson(baseUrl, endpoint, token)
      );
    } catch {
      capabilities[capability] = false;
    }
  }

  try {
    const data = await requestJupyterJson(baseUrl, "api/contents", token);
    capabilities.contents = typeof data === "object" && data !== null;
  } catch {
    capabilities.contents = false;
  }

  try {
    await requestJupyterJson(baseUrl, "api/sys_info", token);
    capabilities.sysInfo = true;
  } catch {
    capabilities.sysInfo = false;
  }

  const required = ["kernelspecs", "sessions", "kernels", "contents", "terminals"] as const;
  const missing = required.filter((capability) => !capabilities[capability]);

  return {
    ok: missing.length === 0,
    capabilities,
    jupyterVersion,
    missing,
  };
}

/** Returns the default Jupyter Server root directory (`~/`). */
export function resolveDefaultJupyterRootDirectory(): string {
  return os.homedir();
}

/** Upper bound on captured Jupyter output retained for failure diagnostics. */
const MAX_JUPYTER_LOG_BYTES = 8_000;

/**
 * Subscribes to a Jupyter child's stdout/stderr and returns a reader for the
 * most recent output. Draining the pipes also prevents the child from blocking
 * on a full OS pipe buffer when it logs verbosely (common on Windows startup).
 */
function trackJupyterOutput(proc: ChildProcess): () => string {
  let buffer = "";
  const append = (data: Buffer | string): void => {
    buffer += typeof data === "string" ? data : data.toString("utf8");
    if (buffer.length > MAX_JUPYTER_LOG_BYTES) {
      buffer = buffer.slice(buffer.length - MAX_JUPYTER_LOG_BYTES);
    }
  };
  proc.stdout?.on("data", append);
  proc.stderr?.on("data", append);
  return () => buffer.trim();
}

/** Appends captured Jupyter output to a failure message when any is available. */
function withJupyterOutput(message: string, output: string): string {
  return output ? `${message}\n\nRecent Jupyter output:\n${output}` : message;
}

/**
 * Starts Jupyter Server with token auth and waits for GET /api to respond.
 *
 * Captures the child's stdout/stderr and listens for the `error` event so that
 * a failed launch surfaces an actionable message instead of either a generic
 * timeout or an uncaught `error` event that crashes the CLI before the app
 * server starts (a frequent Windows failure mode where command resolution and
 * process launching are more fragile than on POSIX).
 */
export async function startJupyterServer(
  pythonCommand: string,
  pythonArgsPrefix: string[] = [],
  cwd = resolveDefaultJupyterRootDirectory(),
  readyTimeoutMs = 90_000,
  env: NodeJS.ProcessEnv = process.env
): Promise<StartedJupyterServer> {
  const port = await findFreePort();
  const token = randomBytes(24).toString("hex");
  const baseUrl = `http://127.0.0.1:${port}/`;
  const args = [
    ...pythonArgsPrefix,
    "-m",
    "jupyter_server",
    "--no-browser",
    "--ip=127.0.0.1",
    `--port=${port}`,
    `--ServerApp.token=${token}`,
    "--ServerApp.allow_origin=*",
    "--ServerApp.disable_check_xsrf=True",
  ];

  const proc = spawn(pythonCommand, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env,
    windowsHide: true,
  });

  const readOutput = trackJupyterOutput(proc);

  // Without this listener a spawn failure (e.g. ENOENT/EINVAL on Windows) is
  // emitted as an unhandled `error` event that crashes the process. A holder
  // object keeps the captured error visible to the loop below (a plain `let`
  // assigned only inside the callback is narrowed away to `never`).
  const launch: { error: Error | null } = { error: null };
  proc.on("error", (error: Error) => {
    launch.error = error;
  });

  const deadline = Date.now() + readyTimeoutMs;
  while (Date.now() < deadline) {
    if (launch.error) {
      throw new Error(
        withJupyterOutput(
          `Could not start Jupyter with ${pythonCommand}: ${launch.error.message}`,
          readOutput()
        )
      );
    }

    if (proc.exitCode !== null && proc.exitCode !== 0) {
      throw new Error(
        withJupyterOutput(
          `Jupyter exited before it became ready (code ${proc.exitCode}).`,
          readOutput()
        )
      );
    }

    try {
      const response = await fetch(
        `${baseUrl}api?token=${encodeURIComponent(token)}`
      );
      if (response.ok) {
        return {
          process: proc,
          baseUrl,
          token,
          pythonPath: pythonCommand,
          dispose: () => {
            if (!proc.killed) {
              proc.kill("SIGTERM");
            }
          },
        };
      }
    } catch {
      // Server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  if (!proc.killed) {
    proc.kill("SIGTERM");
  }
  throw new Error(
    withJupyterOutput(
      "Jupyter did not become ready before the timeout.",
      readOutput()
    )
  );
}

/** Saves the local CLI handoff file consumed by the Orion app. */
export async function saveJupyterConnectionHandoff(
  connection: LauncherJupyterConnection,
  filePath = resolveJupyterConnectionFilePath()
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(connection, null, 2)}\n`, "utf8");
}

/** Loads a previously written local Jupyter handoff file. */
export async function loadJupyterConnectionHandoff(
  filePath = resolveJupyterConnectionFilePath()
): Promise<LauncherJupyterConnection | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as LauncherJupyterConnection;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}

/** Ensures the runtime directory exists before launching local services. */
export async function ensureRuntimeDirectory(): Promise<string> {
  const directory = resolveOrionRuntimeDirectory();
  await mkdir(directory, { recursive: true });
  return directory;
}
