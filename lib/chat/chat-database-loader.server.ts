import {
  createNodeSqliteDatabase,
  isNodeSqliteModuleAvailable,
} from "@/lib/chat/node-sqlite-adapter.server";
import type { OrionDatabase } from "@/lib/chat/sqlite-adapter";

type ChatStorageEngine = "node:sqlite" | "better-sqlite3";

let selectedEngine: ChatStorageEngine | null = null;
let loadAttempted = false;
let degradedReason: string | null = null;

const DEGRADED_ENV_MESSAGE =
  "Chat storage was unavailable during startup. Chat history will not persist across restarts.";

/** Returns whether chat storage fell back to the in-memory store. */
export function isChatStorageDegraded(): boolean {
  return loadAttempted && selectedEngine === null;
}

/** Returns the reason chat storage is degraded, when available. */
export function getChatStorageDegradedReason(): string | null {
  return degradedReason;
}

/** Resets loader state, primarily for tests. */
export function resetChatDatabaseLoader(): void {
  selectedEngine = null;
  loadAttempted = false;
  degradedReason = null;
}

/** Resets loader state, primarily for tests (legacy alias). */
export function resetBetterSqlite3Loader(): void {
  resetChatDatabaseLoader();
}

/** Returns whether Node's built-in node:sqlite module is available. */
export function isNodeSqliteAvailable(): boolean {
  return isNodeSqliteModuleAvailable();
}

/** Marks chat storage as degraded. */
function markDegraded(reason: string): void {
  loadAttempted = true;
  selectedEngine = null;
  degradedReason = reason;
}

/** Returns whether better-sqlite3 can be required in this runtime. */
function canLoadBetterSqlite3Module(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("better-sqlite3");
    return true;
  } catch {
    return false;
  }
}

/** Probes persistent chat storage engines without opening a database file. */
export function probeChatStorageAvailability(): boolean {
  if (loadAttempted) {
    return selectedEngine !== null;
  }

  if (process.env.ORION_CHAT_STORAGE_DEGRADED === "1") {
    markDegraded(DEGRADED_ENV_MESSAGE);
    return false;
  }

  if (isNodeSqliteModuleAvailable()) {
    loadAttempted = true;
    selectedEngine = "node:sqlite";
    return true;
  }

  if (canLoadBetterSqlite3Module()) {
    loadAttempted = true;
    selectedEngine = "better-sqlite3";
    return true;
  }

  markDegraded(
    "No SQLite engine is available on this machine (node:sqlite and better-sqlite3 both failed)."
  );
  return false;
}

/** Opens Orion's chat database using the best available SQLite engine. */
export function openChatDatabase(path: string): OrionDatabase | null {
  if (process.env.ORION_CHAT_STORAGE_DEGRADED === "1") {
    markDegraded(DEGRADED_ENV_MESSAGE);
    return null;
  }

  if (isNodeSqliteModuleAvailable()) {
    try {
      loadAttempted = true;
      selectedEngine = "node:sqlite";
      return createNodeSqliteDatabase(path);
    } catch (error) {
      selectedEngine = null;
      degradedReason =
        error instanceof Error
          ? error.message
          : "node:sqlite could not open the Orion database.";
    }
  }

  if (canLoadBetterSqlite3Module()) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const BetterSqlite3 = require("better-sqlite3") as typeof import("better-sqlite3");
      loadAttempted = true;
      selectedEngine = "better-sqlite3";
      return new BetterSqlite3(path) as OrionDatabase;
    } catch (error) {
      markDegraded(
        error instanceof Error
          ? error.message
          : "better-sqlite3 could not be loaded on this machine."
      );
      return null;
    }
  }

  if (!loadAttempted) {
    markDegraded(
      "No SQLite engine is available on this machine (node:sqlite and better-sqlite3 both failed)."
    );
  } else if (selectedEngine === null && !degradedReason) {
    markDegraded(
      "No SQLite engine is available on this machine (node:sqlite and better-sqlite3 both failed)."
    );
  }

  return null;
}

/**
 * Loads better-sqlite3 once, returning null when unavailable.
 * @deprecated Prefer probeChatStorageAvailability/openChatDatabase.
 */
export function loadBetterSqlite3(): typeof import("better-sqlite3") | null {
  if (!probeChatStorageAvailability() || selectedEngine !== "better-sqlite3") {
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("better-sqlite3") as typeof import("better-sqlite3");
  } catch {
    markDegraded("better-sqlite3 could not be loaded on this machine.");
    return null;
  }
}

export type { OrionDatabase };
