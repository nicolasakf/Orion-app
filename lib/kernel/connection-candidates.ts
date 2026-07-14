import type { LauncherJupyterConnection } from "@/lib/kernel/launcher-connection";

export interface StoredKernelConnectionLike {
  baseUrl: string;
  token?: string;
  displayName?: string;
}

export interface AutoConnectionCandidate {
  baseUrl: string;
  token?: string;
  displayName?: string;
  source: "launcher" | "saved";
}

/** Returns a stable identity key for connection de-duplication. */
function connectionKey(baseUrl: string, token?: string): string {
  return `${baseUrl.trim()}::${token?.trim() ?? ""}`;
}

/**
 * Orders automatic Jupyter connection attempts with CLI handoff first, followed
 * by recent manually saved connections without duplicate attempts.
 */
export function getAutoConnectionCandidates(
  launcherConnection: LauncherJupyterConnection | null,
  savedConnections: StoredKernelConnectionLike[],
  maxSavedConnections = 3
): AutoConnectionCandidate[] {
  const candidates: AutoConnectionCandidate[] = [];
  const seen = new Set<string>();

  if (launcherConnection) {
    candidates.push({
      baseUrl: launcherConnection.baseUrl,
      token: launcherConnection.token,
      displayName: "Orion-managed Jupyter",
      source: "launcher",
    });
    seen.add(connectionKey(launcherConnection.baseUrl, launcherConnection.token));
  }

  for (const connection of savedConnections.slice(0, maxSavedConnections)) {
    const key = connectionKey(connection.baseUrl, connection.token);
    if (seen.has(key)) {
      continue;
    }
    candidates.push({
      baseUrl: connection.baseUrl,
      token: connection.token,
      displayName: connection.displayName,
      source: "saved",
    });
    seen.add(key);
  }

  return candidates;
}

/**
 * Returns the host root only for a successfully connected launcher candidate.
 * Saved connections do not carry a trustworthy local Jupyter root.
 */
export function getAutoConnectionRootDirectory(
  candidate: AutoConnectionCandidate,
  launcherConnection: LauncherJupyterConnection | null
): string | null {
  return candidate.source === "launcher"
    ? launcherConnection?.rootDirectory ?? null
    : null;
}
