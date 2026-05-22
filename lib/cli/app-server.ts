import { spawn, type ChildProcess } from "child_process";
import { existsSync } from "fs";
import { join, resolve } from "path";

import { findFreePort } from "./jupyter";

export interface StartedOrionApp {
  process: ChildProcess;
  url: string;
  port: number;
  dispose: () => void;
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

/** Returns whether a local HTTP server is accepting connections. */
async function isServerReady(url: string): Promise<boolean> {
  try {
    await fetch(url);
    // Any HTTP response (including 500) means the server is up and listening.
    return true;
  } catch {
    return false;
  }
}

/** Starts the packaged Next standalone server on port 3001 or a free fallback. */
export async function startOrionAppServer(
  requestedPort = Number(process.env.ORION_PORT ?? "3001"),
  readyTimeoutMs = 60_000
): Promise<StartedOrionApp> {
  const appDirectory = resolveOrionAppDirectory();
  const serverPath = join(appDirectory, "server.js");
  if (!existsSync(serverPath)) {
    throw new Error(
      `Orion app bundle was not found at ${serverPath}. Run the Orion packaging step before publishing the CLI.`
    );
  }

  let port = requestedPort;
  if (await isServerReady(`http://127.0.0.1:${port}`)) {
    port = await findFreePort();
  }

  const proc = spawn(process.execPath, [serverPath], {
    cwd: appDirectory,
    stdio: "inherit",
    env: {
      ...process.env,
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
      PORT: String(port),
    },
  });

  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + readyTimeoutMs;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null && proc.exitCode !== 0) {
      throw new Error(`Orion app server exited before it became ready (code ${proc.exitCode}).`);
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
  throw new Error("Orion app server did not become ready before the timeout.");
}

/** Keeps the foreground CLI process alive until a child service exits. */
export function keepAliveUntilExit(children: ChildProcess[]): void {
  for (const child of children) {
    child.on("exit", (code) => {
      process.exitCode = code ?? 0;
      for (const other of children) {
        if (other !== child && !other.killed) {
          other.kill("SIGTERM");
        }
      }
    });
  }
}
