#!/usr/bin/env node
import { existsSync } from "fs";

import { startOrionAppServer, keepAliveUntilExit, openBrowser } from "../lib/cli/app-server";
import {
  checkJupyterCapabilities,
  ensureRuntimeDirectory,
  hasJupyterServer,
  hasJupyterServerCommand,
  resolveDefaultJupyterRootDirectory,
  saveJupyterConnectionHandoff,
  startJupyterServer,
  type StartedJupyterServer,
} from "../lib/cli/jupyter";
import { confirmSetup } from "../lib/cli/prompt";
import {
  discoverPythonRuntime,
  ensureManagedPythonEnvironment,
  type PythonRuntime,
} from "../lib/cli/python";
import {
  resolveManagedVenvDirectory,
  resolveManagedVenvPythonPath,
} from "../lib/cli/paths";

interface CliOptions {
  yes: boolean;
  noBrowser: boolean;
  here: boolean;
}

/** Parses the small option set supported by the Orion CLI. */
function parseOptions(argv: string[]): CliOptions {
  return {
    yes: argv.includes("--yes") || argv.includes("-y"),
    noBrowser: argv.includes("--no-browser"),
    here: argv.includes("--here"),
  };
}

/** Resolves the directory Jupyter Server should use as its root. */
function resolveJupyterRootDirectory(options: CliOptions): string {
  return options.here ? process.cwd() : resolveDefaultJupyterRootDirectory();
}

/** Prints a compact usage message for CLI users. */
function printUsage(): void {
  console.log(`Usage: orion [--yes] [--no-browser] [--here]

Starts a local Orion app, starts Jupyter Server, and opens Orion already connected.

Options:
  -y, --yes       Approve Orion-managed setup prompts.
  --no-browser   Start services without opening a browser.
  --here         Start Jupyter from the current directory instead of ~.`);
}

/** Attempts to start Jupyter from an already-compatible existing Python runtime. */
async function tryExistingJupyter(
  runtime: PythonRuntime,
  jupyterRoot: string
): Promise<StartedJupyterServer | null> {
  if (!(await hasJupyterServer(runtime))) {
    return null;
  }

  const server = await startJupyterServer(
    runtime.candidate.command,
    runtime.candidate.argsPrefix,
    jupyterRoot
  );
  const capabilities = await checkJupyterCapabilities(server.baseUrl, server.token);
  if (!capabilities.ok) {
    server.dispose();
    return null;
  }

  return server;
}

/** Starts Jupyter through Orion's managed venv, creating it when approved. */
async function startManagedJupyter(
  runtime: PythonRuntime,
  options: CliOptions,
  jupyterRoot: string
): Promise<StartedJupyterServer> {
  const venvPython = resolveManagedVenvPythonPath(resolveManagedVenvDirectory());
  if (!existsSync(venvPython) || !(await hasJupyterServerCommand(venvPython))) {
    const accepted = await confirmSetup(
      "Orion needs a local Jupyter runtime. Create it under ~/.orion/runtime?",
      { assumeYes: options.yes }
    );
    if (!accepted) {
      throw new Error(
        "Setup declined. Install Jupyter yourself or rerun `orion --yes` to create an Orion-managed runtime."
      );
    }
    await ensureManagedPythonEnvironment(runtime);
  }

  const server = await startJupyterServer(venvPython, [], jupyterRoot);
  const capabilities = await checkJupyterCapabilities(server.baseUrl, server.token);
  if (!capabilities.ok) {
    server.dispose();
    const accepted = await confirmSetup(
      `The managed Jupyter runtime is missing required APIs (${capabilities.missing.join(", ")}). Update it now?`,
      { assumeYes: options.yes }
    );
    if (!accepted) {
      throw new Error("Setup declined. Orion cannot continue without a compatible Jupyter runtime.");
    }
    await ensureManagedPythonEnvironment(runtime);
    return startManagedJupyter(runtime, { ...options, yes: true }, jupyterRoot);
  }
  return server;
}

/** Bootstraps Jupyter and writes the Orion app handoff file. */
async function bootstrapJupyter(
  options: CliOptions,
  jupyterRoot: string
): Promise<StartedJupyterServer> {
  await ensureRuntimeDirectory();
  const runtime = await discoverPythonRuntime();
  if (!runtime) {
    await confirmSetup(
      "Orion needs Python 3.8+ to run notebooks. Managed Python download is not bundled yet; show setup instructions?",
      { assumeYes: options.yes }
    );
    throw new Error(
      "No supported Python runtime found. Install Python 3.8+ from python.org, Homebrew, Conda, or the Windows Python Launcher, then rerun `orion`."
    );
  }

  const existingServer = await tryExistingJupyter(runtime, jupyterRoot);
  const server = existingServer ?? (await startManagedJupyter(runtime, options, jupyterRoot));
  const capabilities = await checkJupyterCapabilities(server.baseUrl, server.token);
  await saveJupyterConnectionHandoff({
    baseUrl: server.baseUrl,
    token: server.token,
    source: existingServer ? "existing" : "managed",
    pythonPath: server.pythonPath,
    jupyterVersion: capabilities.jupyterVersion,
    capabilities: capabilities.capabilities,
    createdAt: new Date().toISOString(),
  });
  return server;
}

/** Runs the Orion CLI entrypoint. */
async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }

  const options = parseOptions(process.argv.slice(2));
  if (options.noBrowser) {
    process.env.ORION_NO_BROWSER = "1";
  }

  const jupyterRoot = resolveJupyterRootDirectory(options);

  console.log("Starting Orion...");
  console.log("Checking Python and Jupyter...");
  const jupyter = await bootstrapJupyter(options, jupyterRoot);
  console.log("Starting Orion app server...");
  const app = await startOrionAppServer();

  console.log(`Orion is running at ${app.url}`);
  console.log(`Jupyter is running at ${jupyter.baseUrl} (root: ${jupyterRoot})`);
  console.log(`Opening ${app.url} in your browser...`);
  openBrowser(app.url);
  keepAliveUntilExit([jupyter.process, app.process]);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
