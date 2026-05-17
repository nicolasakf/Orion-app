/**
 * Lightweight console interceptor that buffers recent log entries for bug reports.
 *
 * Patches console.log / .warn / .error to record entries into a circular buffer.
 * Call initConsoleLogger() once early in the app lifecycle (no-ops after the first call).
 * Call getRecentLogs() to retrieve a snapshot of the buffer for submission.
 */

const BUFFER_SIZE = 100;
/** Max characters per serialized message before truncation. */
const MAX_MESSAGE_CHARS = 400;

export interface LogEntry {
  level: "log" | "warn" | "error";
  message: string;
  ts: string;
}

// Module-level ring buffer — survives re-renders.
const buffer: LogEntry[] = [];
let initialized = false;

/** Serialize arbitrary console args to a single string. */
function serialize(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

/** Truncate a string to MAX_MESSAGE_CHARS with an ellipsis indicator. */
function truncate(s: string): string {
  return s.length > MAX_MESSAGE_CHARS
    ? `${s.slice(0, MAX_MESSAGE_CHARS)}… [+${s.length - MAX_MESSAGE_CHARS} chars]`
    : s;
}

/** Push an entry, evicting the oldest when the buffer is full. */
function push(entry: LogEntry): void {
  if (buffer.length >= BUFFER_SIZE) buffer.shift();
  buffer.push(entry);
}

/** Patch a single console method and record entries. */
function patch(
  level: LogEntry["level"],
  original: (...args: unknown[]) => void
): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    push({ level, message: truncate(serialize(args)), ts: new Date().toISOString() });
    original.apply(console, args);
  };
}

/** Initialize the interceptor. Safe to call multiple times — only installs once. */
export function initConsoleLogger(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  console.log = patch("log", console.log.bind(console));
  console.warn = patch("warn", console.warn.bind(console));
  console.error = patch("error", console.error.bind(console));
}

/**
 * Returns a snapshot of the recent log buffer, most-recent last.
 * Errors and warnings are always included; plain logs fill remaining slots.
 * Total returned entries capped at 50 to keep payloads reasonable.
 */
export function getRecentLogs(): LogEntry[] {
  const MAX_RETURN = 50;
  if (buffer.length === 0) return [];

  // Always include all warn/error entries first, then pad with logs
  const important = buffer.filter((e) => e.level !== "log");
  const logs = buffer.filter((e) => e.level === "log");

  const combined = [
    ...important.slice(-MAX_RETURN),
    ...logs.slice(-(Math.max(0, MAX_RETURN - important.length))),
  ];

  // Re-sort by original insertion order (ts)
  combined.sort((a, b) => a.ts.localeCompare(b.ts));

  return combined.slice(-MAX_RETURN);
}
