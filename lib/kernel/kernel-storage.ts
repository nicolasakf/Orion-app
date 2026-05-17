/**
 * Kernel storage utilities for managing saved kernel connections
 */

interface StoredKernelConnection {
  id: string;
  baseUrl: string;
  token?: string;
  createdAt: Date;
  lastConnectedAt: Date;
  displayName?: string;
}

interface SerializedKernelConnection {
  id: string;
  baseUrl: string;
  token?: string;
  createdAt: string;
  lastConnectedAt: string;
  displayName?: string;
}

const STORAGE_KEY = "orion_kernel_connections";

/**
 * Generates a unique ID for a kernel connection based on URL and token
 */
function generateConnectionId(baseUrl: string, token?: string): string {
  const combined = `${baseUrl}:${token || "no-token"}`;
  return btoa(combined).replace(/[^a-zA-Z0-9]/g, "");
}

/**
 * Saves a kernel connection to local storage
 */
export function saveKernelConnection(
  baseUrl: string,
  token?: string,
  displayName?: string
): void {
  try {
    const connections = getStoredKernelConnections();
    const id = generateConnectionId(baseUrl, token);
    const now = new Date();

    // Find existing connection or create new one
    const existingIndex = connections.findIndex((conn) => conn.id === id);

    if (existingIndex >= 0) {
      // Update existing connection
      connections[existingIndex].lastConnectedAt = now;
      if (displayName) {
        connections[existingIndex].displayName = displayName;
      }
    } else {
      // Add new connection
      connections.push({
        id,
        baseUrl,
        token,
        createdAt: now,
        lastConnectedAt: now,
        displayName,
      });
    }

    // Sort by last connected (most recent first) and keep only last 10
    connections.sort(
      (a, b) => b.lastConnectedAt.getTime() - a.lastConnectedAt.getTime()
    );
    const trimmed = connections.slice(0, 10);

    // Serialize and save to localStorage
    const serialized: SerializedKernelConnection[] = trimmed.map((conn) => ({
      ...conn,
      createdAt: conn.createdAt.toISOString(),
      lastConnectedAt: conn.lastConnectedAt.toISOString(),
    }));

    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
  } catch (error) {
    console.warn("Failed to save kernel connection to local storage:", error);
  }
}

/**
 * Retrieves all stored kernel connections from local storage
 */
export function getStoredKernelConnections(): StoredKernelConnection[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const serialized: SerializedKernelConnection[] = JSON.parse(stored);
    const connections = serialized.map((conn) => ({
      ...conn,
      createdAt: new Date(conn.createdAt),
      lastConnectedAt: new Date(conn.lastConnectedAt),
    }));

    return connections.sort(
      (a, b) => b.lastConnectedAt.getTime() - a.lastConnectedAt.getTime()
    );
  } catch (error) {
    console.warn(
      "Failed to load kernel connections from local storage:",
      error
    );
    return [];
  }
}

/**
 * Removes a kernel connection from storage
 */
export function removeKernelConnection(id: string): void {
  try {
    const connections = getStoredKernelConnections();
    const filtered = connections.filter((conn) => conn.id !== id);

    const serialized: SerializedKernelConnection[] = filtered.map((conn) => ({
      ...conn,
      createdAt: conn.createdAt.toISOString(),
      lastConnectedAt: conn.lastConnectedAt.toISOString(),
    }));

    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
  } catch (error) {
    console.warn(
      "Failed to remove kernel connection from local storage:",
      error
    );
  }
}

/**
 * Clears all stored kernel connections
 */
export function clearKernelConnections(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn(
      "Failed to clear kernel connections from local storage:",
      error
    );
  }
}
