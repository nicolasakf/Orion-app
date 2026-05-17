/**
 * NotebookManager - Centralized management for multiple notebooks and their kernels
 *
 * Tracks which notebooks are "active" (connected to a kernel) and which one
 * is the current notebook for cell operations.
 *
 * Each registered notebook is assigned a stable UUID (notebookId) at
 * registration time. The user-supplied name is stored as a display label only.
 * This avoids key conflicts when the model reuses the same label (e.g. "active")
 * for different notebooks across multiple use_notebook calls.
 *
 * Unlike the Python reference which has dual local/remote modes,
 * this implementation is always local -- communicating with the
 * Jupyter server through the KernelService REST API.
 */

import type { NotebookEntry } from "./types";

// ============================================================================
// NotebookManager Class
// ============================================================================

export class NotebookManager {
  /** Keyed by auto-generated UUID, not by the user-supplied display name */
  private notebooks: Map<string, NotebookEntry> = new Map();
  /** UUID of the currently active notebook */
  private currentNotebookId: string | null = null;

  // --------------------------------------------------------------------------
  // Notebook Registration
  // --------------------------------------------------------------------------

  /**
   * Add a notebook to the manager and set it as current if it's the first one.
   *
   * @param name    - Human-readable display label (not used as a key)
   * @param path    - Path to the notebook file relative to Jupyter root
   * @param kernelId - ID of the kernel associated with this notebook
   * @returns The generated UUID that uniquely identifies this registration
   */
  addNotebook(name: string, path: string, kernelId: string): string {
    const id = crypto.randomUUID();
    this.notebooks.set(id, {
      name,
      path,
      kernelId,
      addedAt: Date.now(),
    });

    if (this.currentNotebookId === null) {
      this.currentNotebookId = id;
    }

    return id;
  }

  /**
   * Remove a notebook from the manager by its ID.
   * If the removed notebook was the current one, switches to the most
   * recently added remaining notebook.
   *
   * @param id - Notebook UUID to remove
   * @returns true if the notebook was found and removed
   */
  removeNotebook(id: string): boolean {
    if (!this.notebooks.has(id)) {
      return false;
    }

    this.notebooks.delete(id);

    if (this.currentNotebookId === id) {
      if (this.notebooks.size > 0) {
        let latestId: string | null = null;
        let latestTime = 0;
        for (const [entryId, entry] of this.notebooks.entries()) {
          if (entry.addedAt > latestTime) {
            latestTime = entry.addedAt;
            latestId = entryId;
          }
        }
        this.currentNotebookId = latestId;
      } else {
        this.currentNotebookId = null;
      }
    }

    return true;
  }

  // --------------------------------------------------------------------------
  // Current Notebook Management
  // --------------------------------------------------------------------------

  /**
   * Set the currently active notebook by its ID.
   *
   * @param id - Notebook UUID to make current
   * @throws Error if the notebook is not tracked
   */
  setCurrentNotebook(id: string): void {
    if (!this.notebooks.has(id)) {
      throw new Error(
        `Notebook ID '${id}' not found in manager. ` +
        `Available IDs: ${this.listIds().join(", ") || "none"}`
      );
    }
    this.currentNotebookId = id;
  }

  /**
   * Get the UUID of the currently active notebook.
   */
  getCurrentNotebookId(): string | null {
    return this.currentNotebookId;
  }

  /**
   * Get the entry for the currently active notebook.
   */
  getCurrentNotebook(): NotebookEntry | null {
    if (!this.currentNotebookId) return null;
    return this.notebooks.get(this.currentNotebookId) ?? null;
  }

  /**
   * Get the file path for the currently active notebook.
   */
  getCurrentNotebookPath(): string | null {
    const entry = this.getCurrentNotebook();
    return entry?.path ?? null;
  }

  /**
   * Get the kernel ID for the currently active notebook.
   */
  getCurrentKernelId(): string | null {
    const entry = this.getCurrentNotebook();
    return entry?.kernelId ?? null;
  }

  // --------------------------------------------------------------------------
  // Lookup Methods
  // --------------------------------------------------------------------------

  /**
   * Check if a notebook ID is managed by this instance.
   */
  has(id: string): boolean {
    return this.notebooks.has(id);
  }

  /**
   * Get the entry for a specific notebook ID.
   */
  get(id: string): NotebookEntry | undefined {
    return this.notebooks.get(id);
  }

  /**
   * Get the file path for a specific notebook ID.
   */
  getNotebookPath(id: string): string | null {
    return this.notebooks.get(id)?.path ?? null;
  }

  /**
   * Get the kernel ID for a specific notebook ID.
   */
  getKernelId(id: string): string | null {
    return this.notebooks.get(id)?.kernelId ?? null;
  }

  /**
   * Find the first registered notebook whose path matches the given path.
   * Used to detect duplicate registrations before assigning a new ID.
   *
   * @returns `{ id, entry }` if found, otherwise `null`
   */
  getByPath(path: string): { id: string; entry: NotebookEntry } | null {
    for (const [id, entry] of this.notebooks.entries()) {
      if (entry.path === path) {
        return { id, entry };
      }
    }
    return null;
  }

  // --------------------------------------------------------------------------
  // Listing
  // --------------------------------------------------------------------------

  /**
   * List all notebook IDs managed by this instance.
   */
  listIds(): string[] {
    return Array.from(this.notebooks.keys());
  }

  /**
   * List all managed notebooks with their metadata.
   */
  listAll(): Array<{
    id: string;
    name: string;
    path: string;
    kernelId: string;
    isCurrent: boolean;
  }> {
    return Array.from(this.notebooks.entries()).map(([id, entry]) => ({
      id,
      name: entry.name,
      path: entry.path,
      kernelId: entry.kernelId,
      isCurrent: id === this.currentNotebookId,
    }));
  }

  /**
   * Get the total number of managed notebooks.
   */
  get size(): number {
    return this.notebooks.size;
  }

  /**
   * Remove all notebooks backed by a specific kernel ID.
   *
   * @param kernelId - Kernel ID to match against tracked notebooks
   * @returns IDs of the notebooks that were removed
   */
  removeByKernelId(kernelId: string): string[] {
    const removed: string[] = [];
    for (const [id, entry] of Array.from(this.notebooks.entries())) {
      if (entry.kernelId === kernelId) {
        this.removeNotebook(id);
        removed.push(id);
      }
    }
    return removed;
  }

  // --------------------------------------------------------------------------
  // Reset
  // --------------------------------------------------------------------------

  /**
   * Clear all tracked notebooks and reset state.
   */
  reset(): void {
    this.notebooks.clear();
    this.currentNotebookId = null;
  }
}
