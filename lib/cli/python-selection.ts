import { existsSync } from "fs";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";

import { hasJupyterServerCommand } from "./jupyter";
import {
  resolveOrionRuntimeDirectory,
  resolveManagedVenvDirectory,
  resolveManagedVenvPythonPath,
  resolvePythonPreferenceFilePath,
} from "./paths";
import {
  confirmDefaultYes,
  confirmSetup,
  isInteractivePromptAvailable,
  promptNumberSelection,
  type PromptOptions,
} from "./prompt";
import {
  formatPythonVersion,
  probePythonInstallations,
  type PythonInstallation,
  type PythonInstallationReport,
  type PythonRuntime,
} from "./python";

export type PythonSelectionKind = "existing" | "managed";

export interface PythonSelectionChoice {
  kind: PythonSelectionKind;
  runtime: PythonRuntime;
  installation?: PythonInstallation;
}

export interface SavedPythonPreference {
  executable: string;
  kind: PythonSelectionKind;
  savedAt: string;
}

export interface ResolvePythonChoiceOptions extends PromptOptions {
  assumeYes?: boolean;
  forcePrompt?: boolean;
}

/** Loads a saved Python preference when present. */
export async function loadPythonPreference(
  filePath = resolvePythonPreferenceFilePath()
): Promise<SavedPythonPreference | null> {
  try {
    const raw = JSON.parse(await readFile(filePath, "utf8")) as Partial<SavedPythonPreference>;
    if (typeof raw.executable !== "string" || !raw.executable) {
      return null;
    }
    if (raw.kind !== "existing" && raw.kind !== "managed") {
      return null;
    }
    return {
      executable: raw.executable,
      kind: raw.kind,
      savedAt: typeof raw.savedAt === "string" ? raw.savedAt : new Date(0).toISOString(),
    };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}

/** Persists the user's Python choice for future Orion launches. */
export async function savePythonPreference(
  choice: PythonSelectionChoice,
  filePath = resolvePythonPreferenceFilePath()
): Promise<void> {
  let executable = choice.runtime.executable;
  if (choice.kind === "managed") {
    const venvPython = resolveManagedVenvPythonPath(resolveManagedVenvDirectory());
    if (existsSync(venvPython)) {
      executable = venvPython;
    }
  }

  const preference: SavedPythonPreference = {
    executable,
    kind: choice.kind,
    savedAt: new Date().toISOString(),
  };
  await mkdir(resolveOrionRuntimeDirectory(), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(preference, null, 2)}\n`, "utf8");
}

/** Removes the saved Python preference file. */
export async function clearPythonPreference(
  filePath = resolvePythonPreferenceFilePath()
): Promise<boolean> {
  try {
    await unlink(filePath);
    return true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "ENOENT"
    ) {
      return false;
    }
    throw error;
  }
}

/** Describes whether a saved Python preference is still usable. */
export async function describePythonPreference(
  report: PythonInstallationReport,
  preference: SavedPythonPreference | null = null
): Promise<{
  preference: SavedPythonPreference | null;
  status: "none" | "ready" | "stale";
  installation: PythonInstallation | null;
}> {
  const saved = preference ?? (await loadPythonPreference());
  if (!saved) {
    return { preference: null, status: "none", installation: null };
  }

  const installation =
    findReadyInstallation(report, saved.executable) ??
    (saved.kind === "managed"
      ? report.ready.find((entry) => entry.managed) ?? null
      : null);

  if (installation?.runtime) {
    return { preference: saved, status: "ready", installation };
  }

  return { preference: saved, status: "stale", installation: null };
}

/** Builds a discovery report for all Python installations Orion can probe. */
export async function buildPythonInstallationReport(): Promise<PythonInstallationReport> {
  const managedPythonPath = resolveManagedVenvPythonPath(resolveManagedVenvDirectory());
  return probePythonInstallations({
    managedPythonPath: existsSync(managedPythonPath) ? managedPythonPath : undefined,
    hasJupyter: hasJupyterServerCommand,
  });
}

/** Formats one installation line for the CLI report. */
export function formatInstallationSummary(installation: PythonInstallation): string {
  const version =
    installation.version !== undefined
      ? `Python ${formatPythonVersion(installation.version)}`
      : "Python unknown";
  const pathLabel = installation.executable ?? installation.label;
  const tags = [installation.label];
  if (installation.managed) {
    tags.push("Orion managed");
  }
  const suffix = installation.reason ? ` — ${installation.reason}` : "";
  return `- ${pathLabel} (${version}, ${tags.join(", ")})${suffix}`;
}

/** Prints the Python discovery report to stdout. */
export function printPythonInstallationReport(report: PythonInstallationReport): void {
  console.log("");
  console.log("Python installations found on this machine:");
  console.log("");

  if (report.ready.length > 0) {
    console.log("  Ready to use:");
    for (const [index, installation] of report.ready.entries()) {
      console.log(`    [${index + 1}] ${formatInstallationSummary(installation).slice(2)}`);
    }
    console.log("");
  } else {
    console.log("  Ready to use: none");
    console.log("");
  }

  if (report.noJupyter.length > 0) {
    console.log("  Python found, no Jupyter:");
    for (const installation of report.noJupyter) {
      console.log(`    ${formatInstallationSummary(installation).slice(2)}`);
    }
    console.log("");
  }

  if (report.unsupported.length > 0) {
    console.log("  Unsupported:");
    for (const installation of report.unsupported) {
      console.log(`    ${formatInstallationSummary(installation).slice(2)}`);
    }
    console.log("");
  }

  if (report.probeFailed.length > 0) {
    console.log("  Could not probe:");
    for (const installation of report.probeFailed) {
      console.log(`    ${formatInstallationSummary(installation).slice(2)}`);
    }
    console.log("");
  }
}

/** Returns a ready installation matching a saved executable path. */
export function findReadyInstallation(
  report: PythonInstallationReport,
  executable: string
): PythonInstallation | null {
  return report.ready.find((installation) => installation.executable === executable) ?? null;
}

/** Picks the default ready installation for non-interactive runs. */
export function selectDefaultReadyInstallation(
  report: PythonInstallationReport,
  env: NodeJS.ProcessEnv = process.env
): PythonInstallation | null {
  const preference = env.PYTHON ?? env.ORION_PYTHON;
  if (preference) {
    const preferred = report.ready.find(
      (installation) =>
        installation.executable === preference ||
        installation.candidate?.command === preference
    );
    if (preferred) {
      return preferred;
    }
  }

  if (env.CONDA_PREFIX) {
    const condaReady = report.ready.find((installation) =>
      installation.executable?.startsWith(env.CONDA_PREFIX!)
    );
    if (condaReady) {
      return condaReady;
    }
  }

  return (
    report.ready.find((installation) => installation.runtime?.support === "preferred") ??
    report.ready[0] ??
    null
  );
}

/** Converts a ready installation into a runtime choice. */
export function choiceFromReadyInstallation(
  installation: PythonInstallation
): PythonSelectionChoice {
  if (!installation.runtime) {
    throw new Error("Ready Python installation is missing runtime metadata.");
  }

  return {
    kind: installation.managed ? "managed" : "existing",
    runtime: installation.runtime,
    installation,
  };
}

/** Builds a managed-runtime choice using the best Python for venv creation. */
export function choiceForManagedRuntime(
  report: PythonInstallationReport
): PythonSelectionChoice {
  if (!report.venvCreationRuntime) {
    throw new Error(
      "No supported Python runtime found. Install Python 3.8+ from python.org, Homebrew, Conda, or the Windows Python Launcher, then rerun `orion`."
    );
  }

  return {
    kind: "managed",
    runtime: report.venvCreationRuntime,
  };
}

/** Resolves which Python Orion should use, prompting when interactive. */
export async function resolvePythonChoice(
  report: PythonInstallationReport,
  options: ResolvePythonChoiceOptions = {}
): Promise<PythonSelectionChoice> {
  const savedPreference =
    options.forcePrompt === true ? null : await loadPythonPreference();
  if (savedPreference) {
    const described = await describePythonPreference(report, savedPreference);
    if (described.status === "ready" && described.installation?.runtime) {
      console.log(`Using saved Python: ${described.installation.executable}`);
      return choiceFromReadyInstallation(described.installation);
    }
  }

  const managedReady = report.ready.some((installation) => installation.managed);
  const menuOptions: Array<
    | { type: "ready"; installation: PythonInstallation }
    | { type: "managed" }
  > = report.ready.map((installation) => ({ type: "ready", installation }));
  if (!managedReady && report.venvCreationRuntime) {
    menuOptions.push({ type: "managed" });
  }

  if (menuOptions.length === 0) {
    if (!report.venvCreationRuntime) {
      throw new Error(
        "No supported Python runtime found. Install Python 3.8+ from python.org, Homebrew, Conda, or the Windows Python Launcher, then rerun `orion`."
      );
    }

    if (!options.assumeYes && isInteractivePromptAvailable(options)) {
      printPythonInstallationReport(report);
    }

    const accepted = await confirmSetup(
      "No Python with Jupyter was found. Create an Orion-managed runtime under ~/.orion/runtime?",
      options
    );
    if (!accepted) {
      throw new Error(
        "Setup declined. Install jupyter_server in one of your Python environments or rerun `orion --yes` to create an Orion-managed runtime."
      );
    }
    return choiceForManagedRuntime(report);
  }

  if (options.assumeYes || !isInteractivePromptAvailable(options)) {
    const defaultReady = selectDefaultReadyInstallation(report);
    if (defaultReady) {
      console.log(`Using ${defaultReady.executable}`);
      return choiceFromReadyInstallation(defaultReady);
    }
    if (!options.assumeYes) {
      throw new Error(
        "No Python with Jupyter was found in non-interactive mode. Set PYTHON, install jupyter_server, or rerun with `orion --yes` to create an Orion-managed runtime."
      );
    }
    return choiceForManagedRuntime(report);
  }

  printPythonInstallationReport(report);

  if (menuOptions.length === 1) {
    const onlyOption = menuOptions[0]!;
    if (onlyOption.type === "managed") {
      if (!options.assumeYes && isInteractivePromptAvailable(options)) {
        printPythonInstallationReport(report);
      }

      const accepted = await confirmSetup(
        "No Python with Jupyter was found. Create an Orion-managed runtime under ~/.orion/runtime?",
        options
      );
      if (!accepted) {
        throw new Error(
          "Setup declined. Install jupyter_server in one of your Python environments or rerun `orion --yes`."
        );
      }
      return choiceForManagedRuntime(report);
    }

    if (!options.assumeYes && isInteractivePromptAvailable(options)) {
      printPythonInstallationReport(report);
    }

    const installation = onlyOption.installation;
    const accepted = await confirmDefaultYes(
      `Use ${installation.executable} (${installation.label})?`,
      options
    );
    if (!accepted) {
      throw new Error("Setup declined. Rerun `orion` to choose a different Python runtime.");
    }
    return choiceFromReadyInstallation(installation);
  }

  const defaultChoice = 1;
  const promptLines = menuOptions.map((option, index) => {
    if (option.type === "ready") {
      return `[${index + 1}] ${option.installation.executable} (${option.installation.label})`;
    }
    return `[${index + 1}] Create Orion-managed runtime under ~/.orion/runtime`;
  });
  console.log("Select a Python runtime:");
  for (const line of promptLines) {
    console.log(`  ${line}`);
  }
  console.log("");

  const selection = await promptNumberSelection(
    "Enter choice",
    1,
    menuOptions.length,
    defaultChoice,
    options
  );
  const selected = menuOptions[selection - 1]!;
  if (selected.type === "managed") {
    return choiceForManagedRuntime(report);
  }
  console.log(`Using ${selected.installation.executable}`);
  return choiceFromReadyInstallation(selected.installation);
}
