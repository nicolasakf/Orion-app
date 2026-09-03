import { spawn, type ChildProcess } from "child_process";
import { existsSync } from "fs";
import { createServer } from "net";
import { join, resolve } from "path";

import { ensureBundledNativeModules } from "./ensure-native-modules";

/** The first local port Orion tries when no port is explicitly configured. */
export const DEFAULT_ORION_PORT = 7070;

const MAX_PORT_SEARCH_ATTEMPTS = 100;

export interface StartedOrionApp {
  process: ChildProcess;
  url: string;
  port: number;
  dispose: () => void;
}

export interface StartOrionAppServerOptions {
  requestedPort?: number;
  readyTimeoutMs?: number;
  appDirectory?: string;
  nodeExecutable?: string;
  /** Hides the child process console on Windows (used by the desktop shell). */
  hideSubprocess?: boolean;
}

/** Node's default 16 KiB header limit rejects browsers with large localhost cookie jars (HTTP 431). */
export const ORION_MAX_HTTP_HEADER_SIZE = 65_536;

/** Returns whether a TCP port can be bound on Orion's loopback interface. */
async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    const finish = (available: boolean) => {
      server.removeAllListeners();
      resolve(available);
    };

    server.once("error", () => finish(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => finish(true));
    });
  });
}

/** Finds the first idle local port at or above the requested Orion port. */
export async function findAvailableOrionPort(requestedPort: number): Promise<number> {
  if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65_535) {
    throw new Error("ORION_PORT must be an integer between 1 and 65535.");
  }

  const finalPort = Math.min(65_535, requestedPort + MAX_PORT_SEARCH_ATTEMPTS - 1);
  for (let port = requestedPort; port <= finalPort; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(
    `Could not find an available local port between ${requestedPort} and ${finalPort}.`
  );
}

/** Returns the app bundle directory for an npm-installed Orion CLI. */
export function resolveBundledAppDirectory(fromDirectory = __dirname): string {
  // Compiled CLI lives at dist/cli/lib/cli; the app bundle sits at dist/orion-app.
  return resolve(fromDirectory, "..", "..", "..", "orion-app");
}

/** Returns a usable app directory from explicit env or npm package layout. */
export function resolveOrionAppDirectory(): string {
  if (process.env.ORION_APP_DIR) {
    return process.env.ORION_APP_DIR;
  }
  return resolveBundledAppDirectory();
}

/** Opens a URL in the user's default browser without blocking the CLI process. */
export function openBrowser(url: string): void {
  if (process.env.ORION_NO_BROWSER === "1") {
    return;
  }

  if (process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
    return;
  }

  spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

/** Captures recent stdout/stderr from a hidden Orion app server child process. */
function trackAppServerOutput(proc: ChildProcess): () => string {
  const chunks: string[] = [];
  const append = (chunk: Buffer | string) => {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    if (chunks.length > 20) {
      chunks.shift();
    }
  };
  proc.stdout?.on("data", append);
  proc.stderr?.on("data", append);
  return () => chunks.join("").trim();
}

/** Appends captured server output to a failure message when any is available. */
function withAppServerOutput(message: string, output: string): string {
  return output ? `${message}\n\nRecent server output:\n${output}` : message;
}

/** Returns whether a local HTTP server is accepting connections. */
async function isServerReady(url: string, timeoutMs = 3_000): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    // Any HTTP response (including 500) means the server is up and listening.
    return true;
  } catch {
    return false;
  }
}

/** Starts the packaged Next standalone server on the first available Orion port. */
export async function startOrionAppServer(
  options: StartOrionAppServerOptions = {}
): Promise<StartedOrionApp> {
  const requestedPort =
    options.requestedPort ?? Number(process.env.ORION_PORT ?? DEFAULT_ORION_PORT);
  const readyTimeoutMs = options.readyTimeoutMs ?? 60_000;
  const appDirectory = options.appDirectory ?? resolveOrionAppDirectory();
  const nodeExecutable = options.nodeExecutable ?? process.execPath;
  const serverPath = join(appDirectory, "server.js");
  if (!existsSync(serverPath)) {
    throw new Error(
      `Orion app bundle was not found at ${serverPath}. Reinstall orion-notebook, then run ` +
        "`orion doctor --json` if the problem persists."
    );
  }

  ensureBundledNativeModules(appDirectory, nodeExecutable);

  const port = await findAvailableOrionPort(requestedPort);

  const hideSubprocess = options.hideSubprocess ?? false;
  const proc = spawn(
    nodeExecutable,
    [`--max-http-header-size=${ORION_MAX_HTTP_HEADER_SIZE}`, serverPath],
    {
      cwd: appDirectory,
      stdio: hideSubprocess ? ["ignore", "pipe", "pipe"] : "inherit",
      windowsHide: hideSubprocess,
      env: {
        ...process.env,
        HOSTNAME: "127.0.0.1",
        NODE_ENV: "production",
        PORT: String(port),
      },
    }
  );
  const readOutput = hideSubprocess ? trackAppServerOutput(proc) : () => "";

  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + readyTimeoutMs;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null && proc.exitCode !== 0) {
      throw new Error(
        withAppServerOutput(
          `Orion app server exited before it became ready (code ${proc.exitCode}).`,
          readOutput()
        )
      );
    }
    if (await isServerReady(url)) {
      return {
        process: proc,
        url,
        port,
        dispose: () => {
          if (!proc.killed) {
            proc.kill("SIGTERM");
          }
        },
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  if (!proc.killed) {
    proc.kill("SIGTERM");
  }
  throw new Error(
    withAppServerOutput(
      "Orion app server did not become ready before the timeout.",
      readOutput()
    )
  );
}

/** Keeps the foreground CLI process alive until a child service exits. */
export function keepAliveUntilExit(children: ChildProcess[]): void {
  const signalExitCodes = {
    SIGINT: 130,
    SIGTERM: 143,
  } as const;
  const exitCodeForSignal = (signal: NodeJS.Signals): number =>
    signal in signalExitCodes
      ? signalExitCodes[signal as keyof typeof signalExitCodes]
      : 1;

  const terminateChildren = (exclude?: ChildProcess) => {
    for (const child of children) {
      if (child !== exclude && !child.killed) {
        child.kill("SIGTERM");
      }
    }
  };

  for (const child of children) {
    child.on("exit", (code, signal) => {
      if (process.exitCode === undefined) {
        process.exitCode = code ?? (signal ? exitCodeForSignal(signal) : 0);
      }
      terminateChildren(child);
    });
  }

  process.once("SIGINT", () => {
    process.exitCode = signalExitCodes.SIGINT;
    terminateChildren();
  });
  process.once("SIGTERM", () => {
    process.exitCode = signalExitCodes.SIGTERM;
    terminateChildren();
  });
  process.once("exit", () => {
    terminateChildren();
  });
}
