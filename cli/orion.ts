#!/usr/bin/env node
import { startOrionAppServer, keepAliveUntilExit, openBrowser } from "../lib/cli/app-server";
import {
  bootstrapJupyter,
  resolveJupyterRootDirectory,
} from "../lib/cli/bootstrap-jupyter";
import type { StartedJupyterServer } from "../lib/cli/jupyter";
import { readPackageVersion } from "../lib/cli/package-version";
import { runConfigCommand } from "../lib/cli/config";
import { runDoctorCommand } from "../lib/cli/doctor";
import { runUninstall } from "../lib/cli/uninstall";
import {
  checkNpmUpdate,
  confirmCliUpdate,
  installLatestNpmVersion,
  runNpmUpdateCommand,
} from "../lib/cli/update";
import {
  printPackageUninstallResult,
  runPackageUninstall,
} from "../lib/cli/uninstall-package";

interface CliOptions {
  yes: boolean;
  noBrowser: boolean;
  here: boolean;
  appOnly: boolean;
  pickPython: boolean;
}

/** Parses the small option set supported by the Orion CLI. */
function parseOptions(argv: string[]): CliOptions {
  return {
    yes: argv.includes("--yes") || argv.includes("-y"),
    noBrowser: argv.includes("--no-browser"),
    here: argv.includes("--here"),
    appOnly: argv.includes("--app-only"),
    pickPython: argv.includes("--pick-python"),
  };
}

/** Prints uninstall usage for CLI users. */
function printUninstallUsage(): void {
  console.log(`Usage: orion uninstall [--yes] [--all]

Removes Orion-managed data under ~/.orion.

By default, removes the pip-downloaded app bundle and cached GitHub archive
for this package version, then uninstalls the orion-notebook package.

Options:
  -y, --yes   Approve removal prompts.
  --all       Remove the entire ~/.orion directory (app cache, Jupyter venv, portable Node).`);
}

/** Prints a compact usage message for CLI users. */
function printUsage(): void {
  console.log(`Usage: orion [--yes] [--no-browser] [--here] [--app-only] [--pick-python]
       orion config [show|python ...]
       orion doctor [--json] [--setup]
       orion update
       orion uninstall [--yes] [--all]

Starts a local Orion app, starts Jupyter Server, and opens Orion already connected.

Commands:
  (default)      Start Orion locally (options below apply to this command).
  config         Show or change Orion CLI settings under ~/.orion/runtime.
  doctor         Diagnose install, app bundle, Python/Jupyter, and network state.
  update         Install the latest Orion release and exit.
  uninstall      Remove cached Orion data under ~/.orion before package uninstall.

Options (default command):
  -V, --version  Print the Orion CLI version and exit.
  -y, --yes       Approve Orion-managed setup prompts.
  --no-browser   Start services without opening a browser.
  --here         Start Jupyter from the current directory instead of ~.
  --app-only     Start only the Orion app (skip Jupyter). Connect to an existing
                 Jupyter server from the UI, or use a prior handoff file.
  --pick-python  Ignore the saved Python preference and show the selection menu.`);
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
  printPackageUninstallResult(runPackageUninstall({ runningFrom: "npm" }));
}

/** Boots the local Orion app and optionally Jupyter services. */
async function runStartCommand(argv: string[]): Promise<void> {
  const options = parseOptions(argv);
  if (options.noBrowser) {
    process.env.ORION_NO_BROWSER = "1";
  }

  const currentVersion = readPackageVersion();
  let latestVersion: string | null = null;
  try {
    latestVersion = await checkNpmUpdate(currentVersion);
  } catch (error) {
    console.warn(
      `Could not check for Orion updates; continuing startup. ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (
    latestVersion &&
    (await confirmCliUpdate(
      `Orion ${latestVersion} is available. Update before starting?`,
      options.yes
    ))
  ) {
    console.log(`Updating Orion ${currentVersion} to ${latestVersion}...`);
    installLatestNpmVersion();
    console.log(`Orion ${latestVersion} installed. Run orion again to start the new version.`);
    return;
  }

  process.env.ORION_LAUNCH_MODE = "cli";
  process.env.ORION_INSTALL_CHANNEL = "npm";
  process.env.ORION_CURRENT_VERSION = currentVersion;

  console.log("Starting Orion...");
  let jupyter: StartedJupyterServer | null = null;
  let jupyterRoot: string | null = null;
  if (options.appOnly) {
    console.log("Starting Orion app server only (--app-only)...");
  } else {
    jupyterRoot = resolveJupyterRootDirectory(options.here);
    console.log("Checking Python and Jupyter...");
    jupyter = await bootstrapJupyter(
      { yes: options.yes, pickPython: options.pickPython },
      jupyterRoot
    );
    console.log("Starting Orion app server...");
  }

  let app: Awaited<ReturnType<typeof startOrionAppServer>>;
  try {
    app = await startOrionAppServer();
  } catch (error) {
    jupyter?.dispose();
    throw error;
  }

  console.log(`Orion is running at ${app.url}`);
  if (jupyter && jupyterRoot) {
    console.log(`Jupyter is running at ${jupyter.baseUrl} (root: ${jupyterRoot})`);
  }
  console.log(`Opening ${app.url} in your browser...`);
  openBrowser(app.url);
  keepAliveUntilExit(jupyter ? [jupyter.process, app.process] : [app.process]);
}

/** Prints the published Orion CLI version. */
function printVersion(): void {
  console.log(readPackageVersion());
}

/** Runs the Orion CLI entrypoint. */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.includes("--version") || argv.includes("-V")) {
    printVersion();
    return;
  }

  const command = argv[0];

  if (command === "uninstall") {
    await runUninstallCommand(argv.slice(1));
    return;
  }

  if (command === "config") {
    await runConfigCommand(argv.slice(1), {
      yes: argv.includes("--yes") || argv.includes("-y"),
    });
    return;
  }

  if (command === "doctor") {
    await runDoctorCommand(argv.slice(1));
    return;
  }

  if (command === "update") {
    if (argv.slice(1).includes("--help") || argv.slice(1).includes("-h")) {
      console.log(`Usage: orion update

Install the latest Orion release from npm and exit.`);
      return;
    }
    await runNpmUpdateCommand(readPackageVersion());
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
