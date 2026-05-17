import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns a human-readable relative day string (e.g., "Today", "Yesterday", "2d ago")
 *
 * @param date - The date to compare to now
 * @returns A string representing the relative day
 */
export const getRelativeDay = (date: Date): string => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const otherDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  const diffTime = today.getTime() - otherDate.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  if (diffDays > 365) {
    return `${Math.round(diffDays / 365)}y ago`;
  }
  if (diffDays > 30) {
    return `${Math.round(diffDays / 30)}mo ago`;
  }
  if (diffDays > 1) {
    return `${diffDays}d ago`;
  }

  return "Today";
};

/**
 * Returns a human-readable relative time string (e.g., "5 minutes ago", "2 hours ago", "just now")
 *
 * @param date - The date to compare to now
 * @returns A string representing the relative time
 */
export function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffSecs = (now.getTime() - date.getTime()) / 1000;

  if (diffSecs < 0) return "in the future";

  const seconds = Math.floor(diffSecs);
  const minutes = Math.floor(diffSecs / 60);
  const hours = Math.floor(diffSecs / (60 * 60));
  const days = Math.floor(diffSecs / (60 * 60 * 24));
  const months = Math.floor(diffSecs / (60 * 60 * 24 * 30));
  const years = Math.floor(diffSecs / (60 * 60 * 24 * 365));

  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}min ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  if (months < 12) return `${months}mo ago`;
  return `${years}y ago`;
}

/** Minimum duration (ms) for refresh button spin animation. */
export const MIN_REFRESH_SPIN_MS = 500;

/**
 * Schedules a callback to run after a minimum duration has elapsed since startTime.
 * Use for refresh spinners: pass Date.now() when starting the refresh, and pass
 * the callback to clear the spinner. Ensures the spinner shows for at least minMs
 * without blocking the actual refresh operation.
 */
export function scheduleAfterMinDuration(
  startTime: number,
  minMs: number,
  callback: () => void
): void {
  const elapsed = Date.now() - startTime;
  const remaining = Math.max(0, minMs - elapsed);
  setTimeout(callback, remaining);
}

// --- Platform / Jupyter (no React — safe for API routes) ---------------------------------------

export type PlatformOS = "macos" | "windows" | "linux" | "unknown";

/**
 * Browser-only: detect the client OS family synchronously (same rules as
 * `usePlatformOs`). Use for non-React code paths such as shell commands sent
 * from Jupyter-connected terminals — avoids PowerShell receiving Bash-only
 * snippets on Windows. Returns `"unknown"` when `navigator` is unavailable (SSR).
 */
export function detectClientPlatformOs(): PlatformOS {
  if (typeof navigator === "undefined") {
    return "unknown";
  }
  const userAgentData = (navigator as Navigator & {
    userAgentData?: { platform?: string };
  }).userAgentData;
  const detectedPlatform =
    userAgentData?.platform || navigator.platform || navigator.userAgent;
  const normalizedPlatform = detectedPlatform.toLowerCase();

  if (normalizedPlatform.includes("mac")) {
    return "macos";
  }
  if (normalizedPlatform.includes("win")) {
    return "windows";
  }
  if (
    normalizedPlatform.includes("linux") ||
    normalizedPlatform.includes("x11")
  ) {
    return "linux";
  }
  return "unknown";
}

/**
 * Human-readable OS label for agent prompts. Returns null when the OS is not
 * known (so the caller can omit it from the system prompt).
 */
export function formatPlatformOsForPrompt(os: PlatformOS): string | null {
  if (os === "unknown") return null;
  switch (os) {
    case "macos":
      return "macOS";
    case "windows":
      return "Windows";
    case "linux":
      return "Linux";
    default:
      return null;
  }
}

/**
 * True when the Jupyter server URL uses a loopback host (localhost, 127.*, ::1).
 * Use on the client to infer that the kernel runs on the same machine as the browser.
 */
export function isJupyterServerHostLocal(baseUrl: string): boolean {
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]") {
      return true;
    }
    if (hostname.startsWith("127.")) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
