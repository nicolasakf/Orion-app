#!/usr/bin/env node
import { spawn, type ChildProcess } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";

import { ORION_MAX_HTTP_HEADER_SIZE } from "../lib/cli/app-server";

const DEFAULT_DEV_URL = "http://127.0.0.1:3001";
const DEFAULT_DEV_PORT = "3001";

/** Prints usage for the desktop dev launcher. */
function printUsage(): void {
  console.log(`Usage: npm run dev:desktop -- [--pick-python] [--here] [--app-only]

Starts the Next.js dev server, waits for it, then launches Electron.

Environment:
  ORION_DESKTOP_DEV_URL   URL Electron should load (default: http://127.0.0.1:3001).`);
}

/** Returns whether a local HTTP server is accepting connections. */
async function isServerReady(url: string, timeoutMs = 2_000): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return true;
  } catch {
    return false;
  }
}

/** Waits until the dev server is reachable. */
async function waitForServer(url: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isServerReady(url)) {
      return;
    }
    await new Promise((resolveReady) => setTimeout(resolveReady, 300));
  }
  throw new Error(`Next.js dev server did not become ready at ${url}.`);
}

/** Terminates child processes when the orchestrator exits. */
function keepAliveUntilExit(children: ChildProcess[]): void {
  const terminateChildren = () => {
    for (const child of children) {
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    }
  };

  for (const child of children) {
    child.on("exit", (code, signal) => {
      if (process.exitCode === undefined) {
        process.exitCode = code ?? (signal ? 1 : 0);
      }
      terminateChildren();
    });
  }

  process.once("SIGINT", () => {
    process.exitCode = 130;
    terminateChildren();
  });
  process.once("SIGTERM", () => {
    process.exitCode = 143;
    terminateChildren();
  });
  process.once("exit", terminateChildren);
}

/** Spawns the Next.js dev server with Turbopack. */
function startNextDevServer(port: string): ChildProcess {
  const nextEntrypoint = resolve(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  if (!existsSync(nextEntrypoint)) {
    throw new Error(
      `Next.js was not found at ${nextEntrypoint}. Run npm install --legacy-peer-deps first.`
    );
  }

  return spawn(
    process.execPath,
    [
      `--max-http-header-size=${ORION_MAX_HTTP_HEADER_SIZE}`,
      nextEntrypoint,
      "dev",
      "-p",
      port,
      "--turbopack",
    ],
    {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
    }
  );
}

/** Launches Electron's local CLI entrypoint with the desktop dev URL enabled. */
function startElectron(argv: string[], devUrl: string): ChildProcess {
  const electronCli = resolve(process.cwd(), "node_modules", "electron", "cli.js");
  if (!existsSync(electronCli)) {
    throw new Error(
      `Electron was not found at ${electronCli}. Run npm install --legacy-peer-deps first.`
    );
  }

  return spawn(process.execPath, [electronCli, ".", ...argv], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      ORION_DESKTOP_DEV_URL: devUrl,
    },
  });
}

/** Starts the full desktop dev stack from one command. */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    return;
  }

  const devUrl = process.env.ORION_DESKTOP_DEV_URL ?? DEFAULT_DEV_URL;
  const port = new URL(devUrl).port || DEFAULT_DEV_PORT;
  const children: ChildProcess[] = [];

  let nextDev: ChildProcess | null = null;
  if (await isServerReady(devUrl)) {
    console.log(`Using existing Next.js dev server at ${devUrl}`);
  } else {
    console.log(`Starting Next.js dev server at ${devUrl} ...`);
    nextDev = startNextDevServer(port);
    children.push(nextDev);
    await waitForServer(devUrl);
  }

  console.log("Starting Electron desktop shell...");
  const electron = startElectron(argv, devUrl);
  children.push(electron);

  for (const child of children) {
    child.on("error", (error) => {
      nextDev?.kill("SIGTERM");
      electron.kill("SIGTERM");
      console.error(error);
      process.exitCode = 1;
    });
  }

  keepAliveUntilExit(children);
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
