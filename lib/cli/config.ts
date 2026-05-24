import {
  resolveJupyterConnectionFilePath,
  resolveOrionHomeDirectory,
  resolveOrionRuntimeDirectory,
  resolvePythonPreferenceFilePath,
} from "./paths";
import { confirmSetup } from "./prompt";
import {
  buildPythonInstallationReport,
  clearPythonPreference,
  describePythonPreference,
  loadPythonPreference,
  resolvePythonChoice,
  savePythonPreference,
} from "./python-selection";

export interface ConfigCommandOptions {
  yes?: boolean;
}

/** Prints config command usage. */
export function printConfigUsage(): void {
  console.log(`Usage: orion config [show]
       orion config python [show|pick|reset]

Inspect or change Orion CLI settings stored under ~/.orion/runtime.

Commands:
  show            Show Orion paths and saved settings (default).
  python show     Show the saved Python/Jupyter preference.
  python pick     Choose a Python runtime and save it for future runs.
  python reset    Clear the saved Python preference.

Options:
  -y, --yes       Approve prompts without asking (for python pick).`);
}

/** Prints a summary of Orion CLI configuration. */
export async function showConfigSummary(): Promise<void> {
  const home = resolveOrionHomeDirectory();
  const runtime = resolveOrionRuntimeDirectory();
  const pythonPreferencePath = resolvePythonPreferenceFilePath();
  const jupyterConnectionPath = resolveJupyterConnectionFilePath();
  const report = await buildPythonInstallationReport();
  const described = await describePythonPreference(report);

  console.log("Orion CLI configuration:");
  console.log("");
  console.log(`  Home:              ${home}`);
  console.log(`  Runtime:           ${runtime}`);
  console.log(`  Python preference: ${pythonPreferencePath}`);
  console.log(`  Jupyter handoff:   ${jupyterConnectionPath}`);
  console.log("");

  if (described.status === "none") {
    console.log("Python preference: not set");
    console.log("  Run `orion config python pick` to choose a runtime.");
    return;
  }

  console.log(`Python preference: ${described.status}`);
  console.log(`  Executable: ${described.preference?.executable}`);
  console.log(`  Kind:       ${described.preference?.kind}`);
  console.log(`  Saved at:   ${described.preference?.savedAt}`);
  if (described.status === "stale") {
    console.log("  This saved runtime is no longer ready. Run `orion config python pick`.");
  }
}

/** Shows the saved Python preference and current readiness. */
export async function showPythonConfig(): Promise<void> {
  const report = await buildPythonInstallationReport();
  const described = await describePythonPreference(report);
  const preferencePath = resolvePythonPreferenceFilePath();

  console.log(`Python preference file: ${preferencePath}`);
  console.log("");

  if (described.status === "none") {
    console.log("No Python preference is saved.");
    console.log("Run `orion config python pick` to choose one.");
    return;
  }

  console.log(`Status:     ${described.status}`);
  console.log(`Executable: ${described.preference?.executable}`);
  console.log(`Kind:       ${described.preference?.kind}`);
  console.log(`Saved at:   ${described.preference?.savedAt}`);

  if (described.status === "ready" && described.installation) {
    console.log(`Label:      ${described.installation.label}`);
  } else {
    console.log("");
    console.log("The saved runtime is no longer ready on this machine.");
    console.log("Run `orion config python pick` to choose a new one.");
  }
}

/** Interactively picks and saves a Python runtime without starting Orion. */
export async function pickPythonConfig(
  options: ConfigCommandOptions = {}
): Promise<void> {
  const report = await buildPythonInstallationReport();
  const choice = await resolvePythonChoice(report, {
    assumeYes: options.yes,
    forcePrompt: true,
  });
  await savePythonPreference(choice);
  console.log(`Saved Python preference: ${choice.runtime.executable}`);
}

/** Clears the saved Python preference. */
export async function resetPythonConfig(
  options: ConfigCommandOptions = {}
): Promise<void> {
  const existing = await loadPythonPreference();
  if (!existing) {
    console.log("No Python preference is saved.");
    return;
  }

  const accepted = await confirmSetup(
    `Clear saved Python preference (${existing.executable})?`,
    { assumeYes: options.yes }
  );
  if (!accepted) {
    console.log("Reset cancelled.");
    return;
  }

  const removed = await clearPythonPreference();
  if (removed) {
    console.log("Cleared saved Python preference.");
  }
}

/** Runs the Orion config subcommand. */
export async function runConfigCommand(
  argv: string[],
  options: ConfigCommandOptions = {}
): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    printConfigUsage();
    return;
  }

  const command = argv[0] ?? "show";

  if (command === "python") {
    const action = argv[1] ?? "show";
    switch (action) {
      case "show":
        await showPythonConfig();
        return;
      case "pick":
        await pickPythonConfig(options);
        return;
      case "reset":
        await resetPythonConfig(options);
        return;
      default:
        printConfigUsage();
        return;
    }
  }

  if (command === "show") {
    await showConfigSummary();
    return;
  }

  printConfigUsage();
}
