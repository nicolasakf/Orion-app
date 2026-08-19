/**
 * TerminalPool - Centralised lifecycle manager for all Jupyter terminal sessions.
 *
 * Two terminal types are tracked:
 *
 *   Agent  — created by agent tools, scoped to a chat session (chatId).
 *            Automatically closed after 1h of idle time.
 *
 *   User   — created by the user via the terminal panel UI.
 *            Never auto-closed.
 *
 * This class wraps KernelService terminal methods — it does not manage
 * WebSocket connections directly. KernelService remains the sole Jupyter gateway.
 */

import type { KernelService } from "@/lib/kernel/kernel-service";
import {
  type PendingTerminalCommand,
  TerminalType,
  type PooledTerminal,
  type TerminalPoolOptions,
  type TerminalPoolState,
} from "./types";

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_IDLE_TIMEOUT_MS = 60 * 60 * 1_000; // 1 hour
const DEFAULT_REAPER_INTERVAL_MS = 60_000; // 1 minute

// ============================================================================
// TerminalPool
// ============================================================================

export class TerminalPool {
  private readonly kernelService: KernelService;
  private readonly options: Required<TerminalPoolOptions>;
  private readonly terminals: Map<string, PooledTerminal> = new Map();
  private readonly changeCallbacks: Set<() => void> = new Set();
  private reaperTimer: ReturnType<typeof setInterval> | null = null;

  constructor(kernelService: KernelService, options?: TerminalPoolOptions) {
    this.kernelService = kernelService;
    this.options = {
      idleTimeoutMs: options?.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
      reaperIntervalMs: options?.reaperIntervalMs ?? DEFAULT_REAPER_INTERVAL_MS,
    };

    // Keep pool in sync when KernelService drops a terminal from its own tracking
    this.kernelService.onTerminalsChanged(() => {
      this.reconcileWithKernelService();
    });

    this.startReaper();
  }

  // ============================================================================
  // Terminal creation
  // ============================================================================

  /**
   * Create a buffered terminal scoped to a chat session.
   *
   * Agent terminals are idle-reaped after `idleTimeoutMs` (default 1h).
   */
  async createAgentTerminal(chatId: string, cwd?: string): Promise<PooledTerminal> {
    const name = await this.kernelService.startTerminal(cwd || undefined);
    const connection = this.kernelService.getTerminalConnection(name);
    if (!connection) {
      throw new Error(`Pool: no connection found for agent terminal "${name}"`);
    }

    const terminal: PooledTerminal = {
      name,
      type: TerminalType.Agent,
      chatId,
      lastActivityMs: Date.now(),
      connection,
    };

    this.terminals.set(name, terminal);
    this.notifyChanged();
    return terminal;
  }

  /**
   * Create a raw terminal for the UI (xterm.js rendering).
   *
   * User terminals are never idle-reaped.
   */
  async createUserTerminal(cwd?: string): Promise<PooledTerminal> {
    const connection = await this.kernelService.startTerminalRaw(cwd || undefined);

    const terminal: PooledTerminal = {
      name: connection.name,
      type: TerminalType.User,
      chatId: null,
      lastActivityMs: Date.now(),
      connection,
    };

    this.terminals.set(connection.name, terminal);
    this.notifyChanged();
    return terminal;
  }

  // ============================================================================
  // Queries
  // ============================================================================

  /** Look up a pooled terminal by name. */
  getTerminal(name: string): PooledTerminal | undefined {
    return this.terminals.get(name);
  }

  /** Return all Agent terminals associated with a chat session. */
  getTerminalsForChat(chatId: string): PooledTerminal[] {
    return Array.from(this.terminals.values()).filter(
      (t) => t.type === TerminalType.Agent && t.chatId === chatId
    );
  }

  /** Return pending command marker state for a terminal, if any. */
  getPendingCommand(name: string): PendingTerminalCommand | null {
    const terminal = this.terminals.get(name);
    return terminal?.pendingCommand ?? null;
  }

  /** Attach pending command marker state to a terminal. */
  setPendingCommand(name: string, pending: PendingTerminalCommand): void {
    const terminal = this.terminals.get(name);
    if (!terminal) return;
    terminal.pendingCommand = { ...pending };
    terminal.lastActivityMs = Date.now();
  }

  /** Append newly-read output to the tracked pending command buffer. */
  appendPendingBuffer(name: string, chunk: string): void {
    if (!chunk) return;
    const terminal = this.terminals.get(name);
    if (!terminal?.pendingCommand) return;
    terminal.pendingCommand.buffer += chunk;
    terminal.pendingCommand.lastOutputAtMs = Date.now();
    terminal.lastActivityMs = Date.now();
  }

  /** Clear pending command marker state for a terminal. */
  clearPendingCommand(name: string): void {
    const terminal = this.terminals.get(name);
    if (!terminal || !terminal.pendingCommand) return;
    delete terminal.pendingCommand;
    terminal.lastActivityMs = Date.now();
  }

  /** Return an immutable snapshot of the current pool state (for UI rendering). */
  getState(): TerminalPoolState {
    return { terminals: Array.from(this.terminals.values()) };
  }

  // ============================================================================
  // Lifecycle operations
  // ============================================================================

  /**
   * Touch the last-activity timestamp for a terminal to defer idle reaping.
   *
   * Call this from send/read terminal tools so that an active conversation
   * does not cause a terminal to be reaped mid-session.
   */
  touchActivity(name: string): void {
    const terminal = this.terminals.get(name);
    if (terminal) {
      terminal.lastActivityMs = Date.now();
    }
  }

  /**
   * Close a terminal and remove it from the pool.
   *
   * Safe to call on terminals not in the pool (no-op for unknown names).
   */
  async closeTerminal(name: string): Promise<void> {
    try {
      await this.kernelService.closeTerminal(name);
    } catch {
      // Terminal may already be gone; still clean up local state
    }
    const had = this.terminals.delete(name);
    if (had) this.notifyChanged();
  }

  /** Close all Agent terminals associated with a given chat session. */
  async closeTerminalsForChat(chatId: string): Promise<void> {
    const targets = this.getTerminalsForChat(chatId);
    await Promise.allSettled(targets.map((t) => this.closeTerminal(t.name)));
  }

  /**
   * Reconcile pool state with the Jupyter server by calling
   * `refreshTerminalsFromServer`. Removes pool entries for terminals that the
   * server no longer reports.
   */
  async syncFromServer(): Promise<void> {
    await this.kernelService.refreshTerminalsFromServer();
    this.reconcileWithKernelService();
  }

  /**
   * Subscribe to pool state changes (terminal added or removed).
   *
   * @returns An unsubscribe function.
   */
  onStateChanged(callback: () => void): () => void {
    this.changeCallbacks.add(callback);
    return () => this.changeCallbacks.delete(callback);
  }

  /**
   * Stop the idle-reaper.
   *
   * Call this when the associated KernelService is being replaced or when the
   * pool is no longer needed (e.g. component unmount).
   */
  dispose(): void {
    if (this.reaperTimer !== null) {
      clearInterval(this.reaperTimer);
      this.reaperTimer = null;
    }
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  /**
   * Remove pool entries whose terminal is no longer tracked by KernelService.
   * Called on every `onTerminalsChanged` event from KernelService.
   */
  private reconcileWithKernelService(): void {
    const live = new Set(this.kernelService.listTerminals());
    let changed = false;

    for (const name of this.terminals.keys()) {
      if (!live.has(name)) {
        this.terminals.delete(name);
        changed = true;
      }
    }

    if (changed) this.notifyChanged();
  }

  /** Start the background idle-reaper interval. */
  private startReaper(): void {
    this.reaperTimer = setInterval(() => {
      this.reapIdleTerminals();
    }, this.options.reaperIntervalMs);
  }

  /**
   * Close Agent terminals idle longer than `idleTimeoutMs`.
   * User terminals are never reaped.
   */
  private reapIdleTerminals(): void {
    const cutoff = Date.now() - this.options.idleTimeoutMs;
    let changed = false;

    for (const terminal of this.terminals.values()) {
      if (terminal.type === TerminalType.User) continue;
      if (terminal.lastActivityMs <= cutoff) {
        this.terminals.delete(terminal.name);
        this.kernelService.closeTerminal(terminal.name).catch(() => {});
        changed = true;
      }
    }

    if (changed) this.notifyChanged();
  }

  /** Fire all registered state-change listeners. */
  private notifyChanged(): void {
    for (const cb of this.changeCallbacks) {
      try {
        cb();
      } catch {
        // Don't let subscriber errors break the pool
      }
    }
  }

}
