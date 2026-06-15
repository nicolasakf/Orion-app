import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { access, mkdir, readdir, unlink, writeFile } from "fs/promises";
import os from "os";
import path from "path";

import { resolveOrionAppDirectory } from "./app-server";
import { bootstrapJupyter, resolveJupyterRootDirectory } from "./bootstrap-jupyter";
import { ensureBundledNativeModules } from "./ensure-native-modules";
import {
  checkJupyterCapabilities,
  loadJupyterConnectionHandoff,
  type StartedJupyterServer,
} from "./jupyter";
import { readPackageVersion } from "./package-version";
import {
  resolveCachedAppDirectory,
  resolveManagedVenvDirectory,
  resolveOrionHomeDirectory,
  resolveOrionRuntimeDirectory,
} from "./paths";
import { buildPythonInstallationReport } from "./python-selection";
import type { PythonInstallation } from "./python";

interface DoctorOptions {
  json: boolean;
  setup: boolean;
}

interface CommandStatus {
  available: boolean;
  command: string;
  path?: string;
  version?: string;
  error?: string;
}

interface WritableCheck {
  ok: boolean;
  path: string;
  error?: string;
}

interface NetworkCheck {
  ok: boolean;
  url: string;
  status?: number;
  error?: string;
}

interface PathSummary {
  count: number;
  entries: string[];
}

interface AppBundleStatus {
  source: "env" | "bundled";
  path: string;
  present: boolean;
  serverJs: boolean;
  error?: string;
}

interface PortableNodeStatus {
  usedByLauncher: boolean;
  path: string;
  present: boolean;
  versions: string[];
}

interface CondaStatus {
  detected: boolean;
  prefix?: string;
  environment?: string;
}

interface PythonSummary {
  ready: PythonInstallation[];
  noJupyter: PythonInstallation[];
  unsupported: PythonInstallation[];
  probeFailed: PythonInstallation[];
  venvCreationRuntime: string | null;
}

interface JupyterStatus {
  status: "not_checked" | "ready" | "failed";
  source?: "handoff" | "setup";
  baseUrl?: string;
  jupyterVersion?: string;
  capabilities?: Record<string, boolean>;
  missing?: string[];
  error?: string;
}

interface DoctorReport {
  ok: boolean;
  generatedAt: string;
  version: string;
  install: {
    channel: "npm";
    executable: string;
  };
  system: {
    platform: NodeJS.Platform;
    arch: string;
    release: string;
    shell: string | null;
  };
  paths: {
    orionHome: string;
    runtime: string;
    managedVenv: string;
    path: PathSummary;
  };
  conda: CondaStatus;
  commands: Record<string, CommandStatus>;
  appBundle: AppBundleStatus;
  cachedAppBundle: {
    path: string;
    present: boolean;
  };
  portableNode: PortableNodeStatus;
  python: PythonSummary;
  jupyter: JupyterStatus;
  checks: {
    writable: WritableCheck;
    network: NetworkCheck[];
  };
  warnings: string[];
  errors: string[];
}

/** Parses doctor command options. */
function parseDoctorOptions(argv: string[]): DoctorOptions {
  return {
    json: argv.includes("--json"),
    setup: argv.includes("--setup"),
  };
}

/** Redacts common home-directory prefixes from diagnostic paths. */
function redactPath(value: string | undefined): string | undefined {
  if (!value) {
    return value;
  }

  const replacements = [
    [os.homedir(), "~"],
    [process.env.USERPROFILE, "%USERPROFILE%"],
    [process.env.HOME, "$HOME"],
  ].filter((entry): entry is [string, string] => Boolean(entry[0]));

  let redacted = value;
  for (const [prefix, replacement] of replacements) {
    if (prefix && redacted.startsWith(prefix)) {
      redacted = `${replacement}${redacted.slice(prefix.length)}`;
    }
  }
  return redacted;
}

/** Summarizes PATH without dumping the entire environment. */
function summarizePath(): PathSummary {
  const rawPath = process.env.PATH ?? process.env.Path ?? "";
  const entries = rawPath.split(path.delimiter).filter(Boolean);
  return {
    count: entries.length,
    entries: entries.slice(0, 12).map((entry) => redactPath(entry) ?? entry),
  };
}

/** Resolves a command path using the host platform's lookup tool. */
function resolveCommandPath(command: string): string | undefined {
  const resolver = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(resolver, [command], {
    encoding: "utf8",
    timeout: 5_000,
  });
  if (result.status !== 0) {
    return undefined;
  }
  return result.stdout.split(/\r?\n/).find(Boolean);
}

/** Probes whether a command is available and returns its version output. */
function inspectCommand(
  command: string,
  versionArgs: string[] = ["--version"]
): CommandStatus {
  const result = spawnSync(command, versionArgs, {
    encoding: "utf8",
    timeout: 10_000,
  });
  const status: CommandStatus = {
    available: result.status === 0,
    command: [command, ...versionArgs].join(" "),
  };
  const resolved = resolveCommandPath(command);
  if (resolved) {
    status.path = redactPath(resolved);
  }
  if (result.status === 0) {
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    if (output) {
      status.version = output.split(/\r?\n/)[0];
    }
    return status;
  }
  const output = `${result.stderr ?? ""}${result.stdout ?? ""}`.trim();
  if (output) {
    status.error = output.split(/\r?\n/)[0];
  } else if (result.error) {
    status.error = result.error.message;
  }
  return status;
}

/** Returns whether conda is visible in the current shell. */
function detectConda(): CondaStatus {
  return {
    detected: Boolean(
      process.env.CONDA_PREFIX ||
        process.env.CONDA_DEFAULT_ENV ||
        resolveCommandPath("conda") ||
        resolveCommandPath("mamba")
    ),
    prefix: redactPath(process.env.CONDA_PREFIX),
    environment: process.env.CONDA_DEFAULT_ENV,
  };
}

/** Checks whether Orion can write under its runtime directory. */
async function checkWritable(directory: string): Promise<WritableCheck> {
  const redactedDirectory = redactPath(directory) ?? directory;
  const testFile = path.join(directory, ".doctor-write-test");
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(testFile, "ok\n", "utf8");
    await access(testFile);
    await unlink(testFile);
    return { ok: true, path: redactedDirectory };
  } catch (error) {
    return {
      ok: false,
      path: redactedDirectory,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Performs a small network reachability check for installer dependencies. */
async function checkNetwork(url: string): Promise<NetworkCheck> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(5_000),
    });
    return { ok: response.ok, url, status: response.status };
  } catch (error) {
    return {
      ok: false,
      url,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Returns app bundle state for npm-installed Orion. */
function inspectAppBundle(): AppBundleStatus {
  try {
    const appDirectory = resolveOrionAppDirectory();
    const serverPath = path.join(appDirectory, "server.js");
    return {
      source: process.env.ORION_APP_DIR ? "env" : "bundled",
      path: redactPath(appDirectory) ?? appDirectory,
      present: existsSync(appDirectory),
      serverJs: existsSync(serverPath),
    };
  } catch (error) {
    return {
      source: process.env.ORION_APP_DIR ? "env" : "bundled",
      path: redactPath(process.env.ORION_APP_DIR ?? "") ?? "",
      present: false,
      serverJs: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Returns cached app bundle state used by Python/uv installs. */
function inspectCachedAppBundle(version: string): { path: string; present: boolean } {
  const directory = resolveCachedAppDirectory(version);
  return {
    path: redactPath(directory) ?? directory,
    present: existsSync(path.join(directory, "server.js")),
  };
}

/** Returns portable Node cache state under Orion's runtime directory. */
async function inspectPortableNode(): Promise<PortableNodeStatus> {
  const nodeDirectory = path.join(resolveOrionRuntimeDirectory(), "node");
  let versions: string[] = [];
  try {
    versions = existsSync(nodeDirectory) ? await readdir(nodeDirectory) : [];
  } catch {
    versions = [];
  }
  return {
    usedByLauncher: false,
    path: redactPath(nodeDirectory) ?? nodeDirectory,
    present: versions.length > 0,
    versions,
  };
}

/** Redacts Python installation paths in a discovery report. */
function redactInstallation(installation: PythonInstallation): PythonInstallation {
  return {
    ...installation,
    candidate: installation.candidate
      ? {
          ...installation.candidate,
          command: redactPath(installation.candidate.command) ?? installation.candidate.command,
        }
      : installation.candidate,
    executable: redactPath(installation.executable),
    runtime: installation.runtime
      ? {
          ...installation.runtime,
          candidate: {
            ...installation.runtime.candidate,
            command:
              redactPath(installation.runtime.candidate.command) ??
              installation.runtime.candidate.command,
          },
          executable: redactPath(installation.runtime.executable) ?? installation.runtime.executable,
        }
      : installation.runtime,
  };
}

/** Builds a compact Python discovery summary. */
async function summarizePython(): Promise<PythonSummary> {
  const report = await buildPythonInstallationReport();
  return {
    ready: report.ready.map(redactInstallation),
    noJupyter: report.noJupyter.map(redactInstallation),
    unsupported: report.unsupported.map(redactInstallation),
    probeFailed: report.probeFailed.map(redactInstallation),
    venvCreationRuntime: redactPath(report.venvCreationRuntime?.executable) ?? null,
  };
}

/** Checks a previous handoff file if Jupyter is still running. */
async function checkExistingJupyterHandoff(): Promise<JupyterStatus> {
  const handoff = await loadJupyterConnectionHandoff();
  if (!handoff) {
    return { status: "not_checked", source: "handoff" };
  }

  try {
    const result = await checkJupyterCapabilities(handoff.baseUrl, handoff.token);
    return {
      status: result.ok ? "ready" : "failed",
      source: "handoff",
      baseUrl: handoff.baseUrl,
      jupyterVersion: result.jupyterVersion,
      capabilities: result.capabilities,
      missing: result.missing,
    };
  } catch (error) {
    return {
      status: "failed",
      source: "handoff",
      baseUrl: handoff.baseUrl,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Redirects setup chatter to stderr so `--json` keeps stdout parseable. */
async function withJsonConsoleRedirect<T>(
  enabled: boolean,
  action: () => Promise<T>
): Promise<T> {
  if (!enabled) {
    return action();
  }

  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = (...args: unknown[]) => console.error(...args);
  console.warn = (...args: unknown[]) => console.error(...args);
  try {
    return await action();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
}

/** Runs first-run setup checks without starting the Orion browser session. */
async function runSetupChecks(jsonOutput: boolean): Promise<JupyterStatus> {
  let server: StartedJupyterServer | null = null;
  try {
    server = await withJsonConsoleRedirect(jsonOutput, async () => {
      const appDirectory = resolveOrionAppDirectory();
      if (!existsSync(path.join(appDirectory, "server.js"))) {
        throw new Error(
          `Orion app bundle was not found at ${appDirectory}. Reinstall orion-notebook.`
        );
      }
      ensureBundledNativeModules(appDirectory);
      return bootstrapJupyter(
        { yes: true, pickPython: false },
        resolveJupyterRootDirectory(false)
      );
    });

    if (!server) {
      throw new Error("Jupyter setup did not return a server.");
    }

    const result = await checkJupyterCapabilities(server.baseUrl, server.token);
    return {
      status: result.ok ? "ready" : "failed",
      source: "setup",
      baseUrl: server.baseUrl,
      jupyterVersion: result.jupyterVersion,
      capabilities: result.capabilities,
      missing: result.missing,
    };
  } catch (error) {
    return {
      status: "failed",
      source: "setup",
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    server?.dispose();
  }
}

/** Builds the full doctor report. */
async function buildDoctorReport(options: DoctorOptions): Promise<DoctorReport> {
  const version = readPackageVersion();
  const runtimeDirectory = resolveOrionRuntimeDirectory();
  const appBundle = inspectAppBundle();
  const [writable, portableNode, python, pypiNetwork, nodeNetwork] = await Promise.all([
    checkWritable(runtimeDirectory),
    inspectPortableNode(),
    summarizePython(),
    checkNetwork("https://pypi.org/simple/orion-notebook/"),
    checkNetwork("https://nodejs.org/dist/"),
  ]);

  const jupyter = options.setup
    ? await runSetupChecks(options.json)
    : await checkExistingJupyterHandoff();

  const warnings: string[] = [];
  const errors: string[] = [];
  if (!appBundle.serverJs) {
    errors.push("The npm app bundle is missing server.js.");
  }
  if (!writable.ok) {
    errors.push("Orion runtime directory is not writable.");
  }
  if (options.setup && jupyter.status !== "ready") {
    errors.push("Jupyter setup check failed.");
  }
  for (const network of [pypiNetwork, nodeNetwork]) {
    if (!network.ok) {
      warnings.push(`Network check failed for ${network.url}.`);
    }
  }

  return {
    ok: errors.length === 0,
    generatedAt: new Date().toISOString(),
    version,
    install: {
      channel: "npm",
      executable: redactPath(process.argv[1]) ?? process.argv[1] ?? "orion",
    },
    system: {
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
      shell: process.env.SHELL ?? process.env.ComSpec ?? null,
    },
    paths: {
      orionHome: redactPath(resolveOrionHomeDirectory()) ?? resolveOrionHomeDirectory(),
      runtime: redactPath(runtimeDirectory) ?? runtimeDirectory,
      managedVenv:
        redactPath(resolveManagedVenvDirectory()) ?? resolveManagedVenvDirectory(),
      path: summarizePath(),
    },
    conda: detectConda(),
    commands: {
      node: inspectCommand(process.execPath, ["--version"]),
      npm: inspectCommand("npm", ["--version"]),
      python: inspectCommand("python", ["--version"]),
      python3: inspectCommand("python3", ["--version"]),
      py: inspectCommand("py", ["-3", "--version"]),
      pip: inspectCommand("pip", ["--version"]),
      uv: inspectCommand("uv", ["--version"]),
    },
    appBundle,
    cachedAppBundle: inspectCachedAppBundle(version),
    portableNode,
    python,
    jupyter,
    checks: {
      writable,
      network: [pypiNetwork, nodeNetwork],
    },
    warnings,
    errors,
  };
}

/** Prints a readable doctor report for terminal users. */
function printTextReport(report: DoctorReport): void {
  console.log("Orion doctor");
  console.log(`Version: ${report.version}`);
  console.log(`Install channel: ${report.install.channel}`);
  console.log(`Platform: ${report.system.platform} ${report.system.arch}`);
  console.log(`Orion home: ${report.paths.orionHome}`);
  console.log("");
  console.log(`App bundle: ${report.appBundle.serverJs ? "ready" : "missing"} (${report.appBundle.path})`);
  console.log(
    `Managed runtime writable: ${report.checks.writable.ok ? "yes" : "no"} (${report.checks.writable.path})`
  );
  console.log(`Python ready installs: ${report.python.ready.length}`);
  console.log(`Python without Jupyter: ${report.python.noJupyter.length}`);
  console.log(`Jupyter: ${report.jupyter.status}`);
  if (report.jupyter.error) {
    console.log(`Jupyter error: ${report.jupyter.error}`);
  }
  console.log("");
  console.log("Commands:");
  for (const [name, status] of Object.entries(report.commands)) {
    const value = status.available ? status.version ?? "available" : "missing";
    console.log(`  ${name}: ${value}`);
  }
  if (report.warnings.length > 0) {
    console.log("");
    console.log("Warnings:");
    for (const warning of report.warnings) {
      console.log(`  - ${warning}`);
    }
  }
  if (report.errors.length > 0) {
    console.log("");
    console.log("Errors:");
    for (const error of report.errors) {
      console.log(`  - ${error}`);
    }
    console.log("");
    console.log("Try `orion uninstall --all --yes`, then rerun `orion doctor --setup`.");
  }
}

/** Prints doctor command usage. */
function printDoctorUsage(): void {
  console.log(`Usage: orion doctor [--json] [--setup]

Checks Orion installation, runtime, app bundle, Python/Jupyter, and network state.

Options:
  --json    Print machine-readable diagnostics.
  --setup   Run first-run setup checks without opening the browser.`);
}

/** Runs the Orion doctor subcommand. */
export async function runDoctorCommand(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    printDoctorUsage();
    return;
  }

  const options = parseDoctorOptions(argv);
  const report = await buildDoctorReport(options);
  if (options.json) {
    console.log(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printTextReport(report);
  }

  if (!report.ok) {
    process.exitCode = 1;
  }
}
