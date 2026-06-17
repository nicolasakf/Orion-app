#!/usr/bin/env node
import { spawn, type ChildProcess } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";

import { keepAliveUntilExit, ORION_MAX_HTTP_HEADER_SIZE } from "../lib/cli/app-server";
import {
  bootstrapJupyter,
  resolveJupyterRootDirectory,
  type BootstrapJupyterOptions,
} from "../lib/cli/bootstrap-jupyter";

interface DevWithJupyterOptions extends BootstrapJupyterOptions {
  here: boolean;
}

/** Parses options for the notebook dev orchestrator. */
function parseOptions(argv: string[]): DevWithJupyterOptions {
  const interactive =
    argv.includes("--pick-python") || process.env.ORION_DEV_INTERACTIVE === "1";
  return {
    here: argv.includes("--here"),
    pickPython: argv.includes("--pick-python"),
    yes:
      !interactive &&
      (argv.includes("--yes") ||
        argv.includes("-y") ||
        process.env.ORION_DEV_YES !== "0"),
  };
}

/** Prints usage for the notebook dev script. */
function printUsage(): void {
  console.log(`Usage: npm run dev:notebook [--] [--here] [--pick-python] [-y|--yes]

Starts Jupyter (same bootstrap as the Orion CLI) and Next.js dev on port 3001.
The app auto-connects via ~/.orion/runtime/jupyter-connection.json.

Options:
  --here          Start Jupyter from the current directory instead of ~.
  --pick-python   Show the Python selection menu (disables default --yes).
  -y, --yes       Approve Orion-managed setup prompts.
  -h, --help      Show this help message.

Environment:
  ORION_DEV_YES=0           Require interactive setup approval.
  ORION_DEV_INTERACTIVE=1   Same as passing --pick-python for setup prompts.`);
}

/** Spawns the Next.js dev server with Turbopack on port 3001. */
function startNextDevServer(): ChildProcess {
  const nextEntrypoint = resolve(process.cwd(), "node_modules/next/dist/bin/next");
  if (!existsSync(nextEntrypoint)) {
    throw new Error(
      `Next.js was not found at ${nextEntrypoint}. Run npm install in the repo root first.`
    );
  }

  return spawn(
    process.execPath,
    [`--max-http-header-size=${ORION_MAX_HTTP_HEADER_SIZE}`, nextEntrypoint, "dev", "-p", "3001", "--turbopack"],
    {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
    }
  );
}

/** Boots Jupyter and the Next.js dev server together. */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    return;
  }

  const options = parseOptions(argv);
  const jupyterRoot = resolveJupyterRootDirectory(options.here);

  console.log("Checking Python and Jupyter...");
  const jupyter = await bootstrapJupyter(options, jupyterRoot);
  console.log(`Jupyter is running at ${jupyter.baseUrl} (root: ${jupyterRoot})`);
  console.log("Starting Next.js dev server on http://127.0.0.1:3001 ...");

  const nextDev = startNextDevServer();
  nextDev.on("error", (error) => {
    jupyter.dispose();
    console.error(error);
    process.exitCode = 1;
  });

  keepAliveUntilExit([jupyter.process, nextDev]);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
