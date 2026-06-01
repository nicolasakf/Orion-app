import { existsSync } from "fs";

import {
  checkJupyterCapabilities,
  ensureRuntimeDirectory,
  hasJupyterServerCommand,
  resolveDefaultJupyterRootDirectory,
  saveJupyterConnectionHandoff,
  startJupyterServer,
  type StartedJupyterServer,
} from "./jupyter";
import { readPackageVersion } from "./package-version";
import { confirmSetup } from "./prompt";
import {
  buildPythonInstallationReport,
  resolvePythonChoice,
  savePythonPreference,
  type PythonSelectionChoice,
} from "./python-selection";
import {
  ensureManagedPythonEnvironment,
  syncManagedRuntimePackages,
  type PythonInstallationReport,
  type PythonRuntime,
} from "./python";
import {
  resolveManagedVenvDirectory,
  resolveManagedVenvPythonPath,
} from "./paths";

export interface BootstrapJupyterOptions {
  yes: boolean;
  pickPython: boolean;
}

/** Resolves the directory Jupyter Server should use as its root. */
export function resolveJupyterRootDirectory(here: boolean): string {
  return here ? process.cwd() : resolveDefaultJupyterRootDirectory();
}

/** Starts Jupyter from a user-selected existing Python runtime. */
async function startExistingJupyter(
  runtime: PythonRuntime,
  options: BootstrapJupyterOptions,
  jupyterRoot: string,
  report: PythonInstallationReport
): Promise<StartedJupyterServer> {
  const server = await startJupyterServer(
    runtime.candidate.command,
    runtime.candidate.argsPrefix,
    jupyterRoot
  );
  const capabilities = await checkJupyterCapabilities(server.baseUrl, server.token);
  if (!capabilities.ok) {
    server.dispose();
    if (!report.venvCreationRuntime) {
      throw new Error(
        `The selected Python is missing required Jupyter APIs (${capabilities.missing.join(", ")}).`
      );
    }

    const accepted = await confirmSetup(
      `The selected Python is missing required Jupyter APIs (${capabilities.missing.join(", ")}). Create or update an Orion-managed runtime instead?`,
      { assumeYes: options.yes }
    );
    if (!accepted) {
      throw new Error("Setup declined. Orion cannot continue without a compatible Jupyter runtime.");
    }
    return startManagedJupyter(report.venvCreationRuntime, options, jupyterRoot, true);
  }

  return server;
}

/** Starts Jupyter through Orion's managed venv, creating it when approved. */
async function startManagedJupyter(
  runtime: PythonRuntime,
  options: BootstrapJupyterOptions,
  jupyterRoot: string,
  setupApproved = false
): Promise<StartedJupyterServer> {
  const orionVersion = readPackageVersion();
  const venvPython = resolveManagedVenvPythonPath(resolveManagedVenvDirectory());
  if (!existsSync(venvPython) || !(await hasJupyterServerCommand(venvPython))) {
    if (!setupApproved) {
      const accepted = await confirmSetup(
        "Orion needs a local Jupyter runtime. Create it under ~/.orion/runtime?",
        { assumeYes: options.yes }
      );
      if (!accepted) {
        throw new Error(
          "Setup declined. Install Jupyter yourself or rerun with `--yes` to create an Orion-managed runtime."
        );
      }
    }
    await ensureManagedPythonEnvironment(runtime, orionVersion);
  } else {
    await syncManagedRuntimePackages(venvPython, runtime.support, orionVersion);
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
    await ensureManagedPythonEnvironment(runtime, orionVersion);
    return startManagedJupyter(runtime, { ...options, yes: true }, jupyterRoot, true);
  }
  return server;
}

/** Starts Jupyter for the resolved Python choice. */
async function startJupyterForChoice(
  choice: PythonSelectionChoice,
  options: BootstrapJupyterOptions,
  jupyterRoot: string,
  report: PythonInstallationReport
): Promise<StartedJupyterServer> {
  if (choice.kind === "managed") {
    return startManagedJupyter(choice.runtime, options, jupyterRoot, true);
  }

  if (choice.installation?.managed) {
    const venvPython = resolveManagedVenvPythonPath(resolveManagedVenvDirectory());
    const orionVersion = readPackageVersion();
    await syncManagedRuntimePackages(venvPython, choice.runtime.support, orionVersion);
    const server = await startJupyterServer(venvPython, [], jupyterRoot);
    const capabilities = await checkJupyterCapabilities(server.baseUrl, server.token);
    if (!capabilities.ok) {
      server.dispose();
      return startManagedJupyter(choice.runtime, options, jupyterRoot, true);
    }
    return server;
  }

  return startExistingJupyter(choice.runtime, options, jupyterRoot, report);
}

/** Bootstraps Jupyter and writes the Orion app handoff file. */
export async function bootstrapJupyter(
  options: BootstrapJupyterOptions,
  jupyterRoot: string
): Promise<StartedJupyterServer> {
  await ensureRuntimeDirectory();
  const report = await buildPythonInstallationReport();
  const choice = await resolvePythonChoice(report, {
    assumeYes: options.yes,
    forcePrompt: options.pickPython,
  });
  const server = await startJupyterForChoice(choice, options, jupyterRoot, report);
  const capabilities = await checkJupyterCapabilities(server.baseUrl, server.token);
  await savePythonPreference(choice);
  await saveJupyterConnectionHandoff({
    baseUrl: server.baseUrl,
    token: server.token,
    source: choice.kind === "managed" || choice.installation?.managed ? "managed" : "existing",
    pythonPath: server.pythonPath,
    jupyterVersion: capabilities.jupyterVersion,
    capabilities: capabilities.capabilities,
    createdAt: new Date().toISOString(),
  });
  return server;
}
