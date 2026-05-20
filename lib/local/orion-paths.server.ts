import "server-only";

import { mkdir } from "fs/promises";
import os from "os";
import path from "path";

/** Returns the local Orion data directory, defaulting to `~/.orion`. */
export function getOrionDataDirectory(): string {
  return process.env.ORION_HOME_DIR ?? path.join(os.homedir(), ".orion");
}

/** Ensures the local Orion data directory exists and returns its absolute path. */
export async function ensureOrionDataDirectory(): Promise<string> {
  const directory = getOrionDataDirectory();
  await mkdir(directory, { recursive: true });
  return directory;
}

/** Returns the absolute path to Orion's local user settings file. */
export function getUserSettingsFilePath(): string {
  return path.join(getOrionDataDirectory(), "settings.json");
}

/** Returns the absolute path to Orion's local SQLite database file. */
export function getOrionDatabasePath(): string {
  return path.join(getOrionDataDirectory(), "orion.db");
}

/** Returns the absolute path to spilled agent terminal output logs. */
export function getTerminalOutputDirectory(): string {
  return path.join(getOrionDataDirectory(), "terminal");
}

/** Ensures `~/.orion/terminal` exists and returns its absolute path. */
export async function ensureTerminalOutputDirectory(): Promise<string> {
  const directory = getTerminalOutputDirectory();
  await mkdir(directory, { recursive: true });
  return directory;
}
