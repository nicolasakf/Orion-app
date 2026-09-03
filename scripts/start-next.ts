#!/usr/bin/env node
import { spawn, type ChildProcess } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";

import { DEFAULT_ORION_PORT, findAvailableOrionPort } from "../lib/cli/app-server";

/** Starts Next.js on the first available Orion port and forwards its exit status. */
async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command !== "dev" && command !== "start") {
    throw new Error("Usage: tsx scripts/start-next.ts <dev|start> [Next.js options]");
  }

  const nextEntrypoint = resolve(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  if (!existsSync(nextEntrypoint)) {
    throw new Error(
      `Next.js was not found at ${nextEntrypoint}. Run npm install --legacy-peer-deps first.`
    );
  }

  const port = await findAvailableOrionPort(DEFAULT_ORION_PORT);
  console.log(`Starting Next.js ${command} server on http://127.0.0.1:${port} ...`);
  const next = spawn(process.execPath, [nextEntrypoint, command, "-p", String(port), ...args], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
  await keepProcessAlive(next);
}

/** Keeps the launcher alive until Next.js exits and relays termination signals. */
function keepProcessAlive(next: ChildProcess): Promise<void> {
  const stop = (signal: NodeJS.Signals) => {
    if (!next.killed) {
      next.kill(signal);
    }
  };

  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));

  return new Promise((resolve, reject) => {
    next.once("error", reject);
    next.once("exit", (code, signal) => {
      process.exitCode = code ?? (signal ? 1 : 0);
      resolve();
    });
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
