import { existsSync } from "fs";

import {
  resolveJupyterRootDirectory,
  resolvePythonChoiceSource,
  saveJupyterHandoffForChoice,
  startJupyterForChoice,
} from "../cli/bootstrap-jupyter";
import { startOrionAppServer, type StartedOrionApp } from "../cli/app-server";
import {
  checkJupyterCapabilities,
  ensureRuntimeDirectory,
  saveJupyterConnectionHandoff,
  startJupyterServer,
  type CapabilityCheckResult,
  type StartedJupyterServer,
} from "../cli/jupyter";
import {
  buildPythonInstallationReport,
  clearPythonPreference,
  describePythonPreference,
  loadPythonPreference,
  resolvePythonChoice,
  type PythonSelectionChoice,
} from "../cli/python-selection";
import type { PythonInstallationReport } from "../cli/python";
import { resolveManagedVenvDirectory } from "../cli/paths";
import type { LauncherJupyterConnection } from "../kernel/launcher-connection";
import { isOrionCloudConfiguredInAppBundle } from "./cloud-bundle";
import type { DesktopOptions } from "./options";
import {
  ensureDesktopManagedVenv,
  recordVenvPackageSnapshot,
} from "./python-runtime";
import {
  assertDesktopRuntimePresent,
  resolveDesktopRuntimePaths,
  type DesktopResourcePathOptions,
  type DesktopRuntimePaths,
} from "./paths";

export type DesktopJupyterMode = "bundled" | "pick-python" | "saved-existing";

export type DesktopPythonSource = "managed" | "existing";

export interface DesktopJupyterStartup {
  server: StartedJupyterServer;
  source: DesktopPythonSource;
}

export interface DesktopSession {
  app: StartedOrionApp | null;
  jupyter: StartedJupyterServer | null;
  /** How the running Jupyter's Python was resolved, or null when Jupyter is disabled. */
  pythonSource: DesktopPythonSource | null;
  /** Absolute directory Jupyter was launched from. Native folder picks must stay under this root. */
  jupyterRootDirectory: string;
  url: string;
  dispose: () => void;
}

export interface DesktopSmokeReport {
  ok: boolean;
  app: {
    url: string;
    port: number;
  };
  cloud: {
    configured: boolean;
  };
  jupyter: null | {
    baseUrl: string;
    pythonPath: string;
    source: "managed" | "existing";
  };
}

export interface DesktopLaunchOptions {
  argvOptions: DesktopOptions;
  devUrl?: string;
  resourceOptions?: DesktopResourcePathOptions;
}

/** Returns whether the packaged app runtime must be present before launch. */
export function requiresPackagedAppRuntime(devUrl: string | undefined): boolean {
  return normalizeDesktopDevUrl(devUrl) === null;
}

/** Chooses the desktop Python/Jupyter startup mode from flags and saved state. */
export function chooseDesktopJupyterMode(
  options: DesktopOptions,
  hasSavedExistingChoice: boolean
): DesktopJupyterMode {
  if (options.useBundled) {
    return "bundled";
  }
  if (options.pickPython) {
    return "pick-python";
  }
  return hasSavedExistingChoice ? "saved-existing" : "bundled";
}

/** Builds the standard launcher handoff for the bundled desktop Jupyter server. */
export function createBundledDesktopJupyterHandoff(
  server: StartedJupyterServer,
  capabilities: CapabilityCheckResult,
  jupyterRoot: string
): LauncherJupyterConnection {
  return {
    baseUrl: server.baseUrl,
    token: server.token,
    source: "managed",
    pythonPath: server.pythonPath,
    rootDirectory: jupyterRoot,
    jupyterVersion: capabilities.jupyterVersion,
    capabilities: capabilities.capabilities,
    createdAt: new Date().toISOString(),
  };
}

/** Prevents bundled Python from writing bytecode into the signed application bundle. */
export function createBundledPythonEnvironment(
  env: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  return {
    ...env,
    PYTHONDONTWRITEBYTECODE: "1",
  };
}

/** Normalizes and validates a local development URL for the Electron shell. */
export function normalizeDesktopDevUrl(devUrl: string | undefined): string | null {
  if (!devUrl) {
    return null;
  }

  const parsed = new URL(devUrl);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("ORION_DESKTOP_DEV_URL must be an http(s) URL.");
  }
  return parsed.toString();
}

/** Returns the launcher choice implied by a saved existing-Python preference. */
async function resolveSavedExistingPythonChoice(
  report: PythonInstallationReport
): Promise<PythonSelectionChoice | null> {
  const preference = await loadPythonPreference();
  if (!preference || preference.kind !== "existing") {
    return null;
  }

  const described = await describePythonPreference(report, preference);
  if (described.status !== "ready" || !described.installation?.runtime) {
    return null;
  }

  return {
    kind: "existing",
    runtime: described.installation.runtime,
    installation: described.installation,
  };
}

/**
 * Resolves the Python that bundled-mode Jupyter should run.
 *
 * Prefers the persistent environment under `~/.orion/runtime/venv` so user
 * package installs survive app updates instead of being written into (and wiped
 * with) the signed application bundle. Falling back to the bundled interpreter
 * keeps notebooks openable when the environment cannot be provisioned, which
 * matters more than the storage location.
 */
export async function resolveBundledDesktopPython(
  basePythonPath: string,
  ensureVenv: typeof ensureDesktopManagedVenv = ensureDesktopManagedVenv
): Promise<{ pythonPath: string; persistent: boolean }> {
  try {
    const result = await ensureVenv(basePythonPath);
    if (result.failedPackages.length > 0) {
      console.warn(
        `Rebuilt Orion's Python environment but could not reinstall: ${result.failedPackages.join(", ")}. Reinstall these packages from a notebook.`
      );
    }
    return { pythonPath: result.pythonPath, persistent: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(
      `Could not prepare Orion's persistent Python environment at ${resolveManagedVenvDirectory()}; falling back to the bundled interpreter. Packages installed this session will be lost on the next Orion update. Cause: ${reason}`
    );
    return { pythonPath: basePythonPath, persistent: false };
  }
}

/** Starts Jupyter from the bundled desktop Python runtime and writes the standard handoff. */
export async function startBundledDesktopJupyter(
  paths: DesktopRuntimePaths,
  jupyterRoot: string
): Promise<StartedJupyterServer> {
  if (!existsSync(paths.pythonExecutable)) {
    throw new Error(
      `Bundled Python was not found at ${paths.pythonExecutable}. Run diagnostics with Orion --smoke or reinstall Orion.`
    );
  }

  const runtime = await resolveBundledDesktopPython(paths.pythonExecutable);
  const server = await startJupyterServer(
    runtime.pythonPath,
    [],
    jupyterRoot,
    90_000,
    createBundledPythonEnvironment()
  );
  const capabilities = await checkJupyterCapabilities(server.baseUrl, server.token);
  if (!capabilities.ok) {
    server.dispose();
    throw new Error(
      `Bundled Jupyter is missing required APIs (${capabilities.missing.join(", ")}). Run diagnostics with Orion --smoke or reinstall Orion.`
    );
  }

  await saveJupyterConnectionHandoff(
    createBundledDesktopJupyterHandoff(server, capabilities, jupyterRoot)
  );

  // Records what the user has installed so a later rebuild can restore it. The
  // running session does not depend on this, so failures stay non-fatal.
  if (runtime.persistent) {
    void recordVenvPackageSnapshot(runtime.pythonPath).catch(() => undefined);
  }
  return server;
}

/** Starts Jupyter according to desktop defaults: saved existing Python, prompted Python, or bundled Python. */
export async function startDesktopJupyter(
  options: DesktopOptions,
  paths: DesktopRuntimePaths,
  jupyterRoot: string
): Promise<DesktopJupyterStartup> {
  await ensureRuntimeDirectory();

  if (options.useBundled) {
    await clearPythonPreference();
    return {
      server: await startBundledDesktopJupyter(paths, jupyterRoot),
      source: "managed",
    };
  }

  const report = await buildPythonInstallationReport();
  const savedExistingChoice = await resolveSavedExistingPythonChoice(report);
  const mode = chooseDesktopJupyterMode(options, Boolean(savedExistingChoice));

  if (mode === "pick-python") {
    const choice = await resolvePythonChoice(report, {
      assumeYes: false,
      forcePrompt: true,
    });
    const server = await startJupyterForChoice(
      choice,
      { yes: false, pickPython: true },
      jupyterRoot,
      report
    );
    await saveJupyterHandoffForChoice(server, choice, jupyterRoot);
    return { server, source: resolvePythonChoiceSource(choice) };
  }

  if (mode === "saved-existing" && savedExistingChoice) {
    const server = await startJupyterForChoice(
      savedExistingChoice,
      { yes: true, pickPython: false },
      jupyterRoot,
      report
    );
    await saveJupyterHandoffForChoice(server, savedExistingChoice, jupyterRoot);
    return { server, source: resolvePythonChoiceSource(savedExistingChoice) };
  }

  return {
    server: await startBundledDesktopJupyter(paths, jupyterRoot),
    source: "managed",
  };
}

/** Starts the desktop session services and returns a disposer for app shutdown. */
export async function startDesktopSession(
  launchOptions: DesktopLaunchOptions
): Promise<DesktopSession> {
  const devUrl = normalizeDesktopDevUrl(launchOptions.devUrl);
  const paths = resolveDesktopRuntimePaths(launchOptions.resourceOptions);
  if (!devUrl) {
    assertDesktopRuntimePresent(paths, {
      requirePython: launchOptions.argvOptions.useBundled,
    });
  }

  const jupyterRoot = resolveJupyterRootDirectory(launchOptions.argvOptions.here);
  const startup = launchOptions.argvOptions.appOnly
    ? null
    : await startDesktopJupyter(launchOptions.argvOptions, paths, jupyterRoot);
  const jupyter = startup?.server ?? null;

  if (devUrl) {
    return {
      app: null,
      jupyter,
      pythonSource: startup?.source ?? null,
      jupyterRootDirectory: jupyterRoot,
      url: devUrl,
      dispose: () => {
        jupyter?.dispose();
      },
    };
  }

  let app: StartedOrionApp;
  try {
    app = await startOrionAppServer({
      appDirectory: paths.appDirectory,
      nodeExecutable: paths.nodeExecutable,
      hideSubprocess: true,
    });
  } catch (error) {
    jupyter?.dispose();
    throw error;
  }

  return {
    app,
    jupyter,
    pythonSource: startup?.source ?? null,
    jupyterRootDirectory: jupyterRoot,
    url: app.url,
    dispose: () => {
      jupyter?.dispose();
      app.dispose();
    },
  };
}

/** Starts and immediately tears down a desktop session for installer smoke tests. */
export async function runDesktopSmoke(
  launchOptions: DesktopLaunchOptions
): Promise<DesktopSmokeReport> {
  const paths = resolveDesktopRuntimePaths(launchOptions.resourceOptions);
  const devUrl = normalizeDesktopDevUrl(launchOptions.devUrl);
  const session = await startDesktopSession(launchOptions);
  try {
    return {
      ok: true,
      app: {
        url: session.url,
        port: session.app?.port ?? Number(new URL(session.url).port || "0"),
      },
      cloud: {
        configured: devUrl ? true : isOrionCloudConfiguredInAppBundle(paths.appDirectory),
      },
      jupyter: session.jupyter
        ? {
            baseUrl: session.jupyter.baseUrl,
            pythonPath: session.jupyter.pythonPath,
            source: session.pythonSource ?? "existing",
          }
        : null,
    };
  } finally {
    session.dispose();
  }
}
