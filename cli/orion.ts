#!/usr/bin/env node
import { existsSync, readFileSync } from "fs";
import { join } from "path";

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
import { runUninstall } from "../lib/cli/uninstall";

/** Reads the published package version from package.json. */
function readPackageVersion(): string {
  const packageJsonPath = join(__dirname, "..", "..", "..", "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    version?: string;
  };
  if (!packageJson.version) {
    throw new Error(`Missing version in ${packageJsonPath}.`);
  }
  return packageJson.version;
}

interface CliOptions {
  yes: boolean;
  noBrowser: boolean;
  here: boolean;
  appOnly: boolean;
}

/** Parses the small option set supported by the Orion CLI. */
function parseOptions(argv: string[]): CliOptions {
  return {
    yes: argv.includes("--yes") || argv.includes("-y"),
    noBrowser: argv.includes("--no-browser"),
    here: argv.includes("--here"),
    appOnly: argv.includes("--app-only"),
  };
}

/** Resolves the directory Jupyter Server should use as its root. */
function resolveJupyterRootDirectory(options: CliOptions): string {
  return options.here ? process.cwd() : resolveDefaultJupyterRootDirectory();
}

/** Prints uninstall usage for CLI users. */
function printUninstallUsage(): void {
  console.log(`Usage: orion uninstall [--yes] [--all]

Removes Orion-managed data under ~/.orion.

By default, removes the pip-downloaded app bundle and cached GitHub archive
for this package version. Does not remove the npm/pip package itself.

Options:
  -y, --yes   Approve removal prompts.
  --all       Remove the entire ~/.orion directory (app cache, Jupyter venv, portable Node).`);
}

/** Prints a compact usage message for CLI users. */
function printUsage(): void {
  console.log(`Usage: orion [--yes] [--no-browser] [--here] [--app-only]
       orion uninstall [--yes] [--all]

Starts a local Orion app, starts Jupyter Server, and opens Orion already connected.

Options:
  -y, --yes       Approve Orion-managed setup prompts.
  --no-browser   Start services without opening a browser.
  --here         Start Jupyter from the current directory instead of ~.
  --app-only     Start only the Orion app (skip Jupyter). Connect to an existing
                 Jupyter server from the UI, or use a prior handoff file.

Commands:
  uninstall      Remove cached Orion data under ~/.orion before package uninstall.`);
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

/** Removes Orion-managed cache data under ~/.orion. */
async function runUninstallCommand(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    printUninstallUsage();
    return;
  }

  const result = await runUninstall({
    version: readPackageVersion(),
    yes: argv.includes("--yes") || argv.includes("-y"),
    all: argv.includes("--all"),
  });

  if (result.removed.length === 0) {
    console.log("Nothing to remove.");
    if (result.skipped.length > 0) {
      console.log("Expected locations were already absent.");
    }
  } else {
    console.log("Removed:");
    for (const path of result.removed) {
      console.log(`  - ${path}`);
    }
  }

  console.log("");
  console.log("To remove the installed package, run:");
  console.log("  npm uninstall -g orion-notebook");
  console.log("  pip uninstall orion-notebook");
}

/** Boots the local Orion app and optionally Jupyter services. */
async function runStartCommand(argv: string[]): Promise<void> {
  const options = parseOptions(argv);
  if (options.noBrowser) {
    process.env.ORION_NO_BROWSER = "1";
  }

  console.log("Starting Orion...");
  let jupyter: StartedJupyterServer | null = null;
  let jupyterRoot: string | null = null;
  if (options.appOnly) {
    console.log("Starting Orion app server only (--app-only)...");
  } else {
    jupyterRoot = resolveJupyterRootDirectory(options);
    console.log("Checking Python and Jupyter...");
    jupyter = await bootstrapJupyter(options, jupyterRoot);
    console.log("Starting Orion app server...");
  }

  const app = await startOrionAppServer();

  console.log(`Orion is running at ${app.url}`);
  if (jupyter && jupyterRoot) {
    console.log(`Jupyter is running at ${jupyter.baseUrl} (root: ${jupyterRoot})`);
  }
  console.log(`Opening ${app.url} in your browser...`);
  openBrowser(app.url);
  keepAliveUntilExit(jupyter ? [jupyter.process, app.process] : [app.process]);
}

/** Runs the Orion CLI entrypoint. */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0];

  if (command === "uninstall") {
    await runUninstallCommand(argv.slice(1));
    return;
  }

  if (argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    return;
  }

  await runStartCommand(argv);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
