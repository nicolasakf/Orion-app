/** Builds the allowlisted self-update command for the active install channel. */
export function buildInstallCommand(source: "npm" | "pip" | "uv"): [string, string[]] {
  if (source === "npm") {
    return [
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["install", "--global", "orion-notebook@latest", "--legacy-peer-deps"],
    ];
  }
  if (source === "uv") {
    return [process.env.ORION_LAUNCHER_EXECUTABLE ?? "uv", ["tool", "upgrade", "orion-notebook"]];
  }
  const python = process.env.ORION_LAUNCHER_EXECUTABLE;
  if (!python) throw new Error("The Python launcher path is unavailable.");
  return [python, ["-m", "pip", "install", "--upgrade", "orion-notebook"]];
}
