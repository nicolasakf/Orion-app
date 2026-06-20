import { existsSync } from "fs";

import {
  resolveJupyterRootDirectory,
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
import type { LauncherJupyterConnection } from "../kernel/launcher-connection";
import { isOrionCloudConfiguredInAppBundle } from "./cloud-bundle";
import type { DesktopOptions } from "./options";
import {
  assertDesktopRuntimePresent,
  resolveDesktopRuntimePaths,
  type DesktopResourcePathOptions,
  type DesktopRuntimePaths,
} from "./paths";

export type DesktopJupyterMode = "bundled" | "pick-python" | "saved-existing";

export interface DesktopSession {
  app: StartedOrionApp | null;
  jupyter: StartedJupyterServer | null;
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

  const server = await startJupyterServer(paths.pythonExecutable, [], jupyterRoot);
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
  return server;
}

/** Starts Jupyter according to desktop defaults: saved existing Python, prompted Python, or bundled Python. */
export async function startDesktopJupyter(
  options: DesktopOptions,
  paths: DesktopRuntimePaths,
  jupyterRoot: string
): Promise<StartedJupyterServer> {
  await ensureRuntimeDirectory();

  if (options.useBundled) {
    await clearPythonPreference();
    return startBundledDesktopJupyter(paths, jupyterRoot);
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
    return server;
  }

  if (mode === "saved-existing" && savedExistingChoice) {
    const server = await startJupyterForChoice(
      savedExistingChoice,
      { yes: true, pickPython: false },
      jupyterRoot,
      report
    );
    await saveJupyterHandoffForChoice(server, savedExistingChoice, jupyterRoot);
    return server;
  }

  return startBundledDesktopJupyter(paths, jupyterRoot);
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
  const jupyter = launchOptions.argvOptions.appOnly
    ? null
    : await startDesktopJupyter(launchOptions.argvOptions, paths, jupyterRoot);

  if (devUrl) {
    return {
      app: null,
      jupyter,
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
    });
  } catch (error) {
    jupyter?.dispose();
    throw error;
  }

  return {
    app,
    jupyter,
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
            source: session.jupyter.pythonPath === paths.pythonExecutable
              ? "managed"
              : "existing",
          }
        : null,
    };
  } finally {
    session.dispose();
  }
}
