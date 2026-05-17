/**
 * RuntimeContextStore - Caches runtime state for the AI Assistant
 * 
 * This module maintains:
 * - A rolling buffer of recent kernel events (stdout, stderr, errors)
 * - A cache of variable summaries with staleness tracking
 * - Recent execution outputs for context injection
 */

import type { VariableSummary, IOPubEvent, KernelMessage } from "./kernel-sidecar";

// ============================================================================
// Types
// ============================================================================

export interface StreamEvent {
  type: "stdout" | "stderr";
  text: string;
  timestamp: number;
  executionCount?: number;
}

export interface ErrorEvent {
  ename: string;
  evalue: string;
  traceback: string[];
  timestamp: number;
  executionCount?: number;
  cellIndex?: number;
}

export interface ExecutionResult {
  type: "execute_result" | "display_data";
  data: Record<string, any>;
  timestamp: number;
  executionCount?: number;
  cellIndex?: number;
}

export interface RuntimeSnapshot {
  variables: Map<string, VariableSummary>;
  recentErrors: ErrorEvent[];
  recentOutputs: StreamEvent[];
  recentResults: ExecutionResult[];
  lastExecutionCount: number;
  kernelStatus: string;
}

export interface StoreConfig {
  maxStreamEvents: number;
  maxErrors: number;
  maxResults: number;
  variableCacheTTL: number; // ms
  maxVariableCacheSize: number;
}

const DEFAULT_CONFIG: StoreConfig = {
  maxStreamEvents: 50,
  maxErrors: 20,
  maxResults: 30,
  variableCacheTTL: 60000, // 1 minute
  maxVariableCacheSize: 100,
};

// ============================================================================
// RuntimeContextStore Class
// ============================================================================

export class RuntimeContextStore {
  private config: StoreConfig;
  
  // Variable cache with staleness tracking
  private variableCache: Map<string, VariableSummary> = new Map();
  private variableAccessOrder: string[] = []; // LRU tracking
  
  // Rolling buffers for events
  private streamEvents: StreamEvent[] = [];
  private errorEvents: ErrorEvent[] = [];
  private executionResults: ExecutionResult[] = [];
  
  // Execution tracking
  private lastExecutionCount: number = 0;
  private kernelStatus: string = "unknown";
  
  // Listeners
  private changeListeners: Set<(snapshot: RuntimeSnapshot) => void> = new Set();

  constructor(config: Partial<StoreConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================================
  // IOPub Event Handling
  // ============================================================================

  /**
   * Process a kernel message and update the store
   */
  processMessage(msg: KernelMessage): void {
    const msgType = msg.header?.msg_type;
    const content = msg.content;
    const executionCount = content?.execution_count || msg.parent_header?.execution_count;

    if (executionCount) {
      this.lastExecutionCount = executionCount;
    }

    switch (msgType) {
      case "stream":
        this.addStreamEvent({
          type: content.name === "stderr" ? "stderr" : "stdout",
          text: Array.isArray(content.text) ? content.text.join("") : content.text,
          timestamp: Date.now(),
          executionCount,
        });
        break;

      case "error":
        this.addErrorEvent({
          ename: content.ename,
          evalue: content.evalue,
          traceback: content.traceback || [],
          timestamp: Date.now(),
          executionCount,
        });
        break;

      case "execute_result":
        this.addExecutionResult({
          type: "execute_result",
          data: content.data || {},
          timestamp: Date.now(),
          executionCount,
        });
        break;

      case "display_data":
        this.addExecutionResult({
          type: "display_data",
          data: content.data || {},
          timestamp: Date.now(),
          executionCount,
        });
        break;

      case "status":
        this.kernelStatus = content.execution_state || "unknown";
        break;
    }
  }

  // ============================================================================
  // Stream Events
  // ============================================================================

  private addStreamEvent(event: StreamEvent): void {
    this.streamEvents.push(event);
    
    // Trim to max size
    if (this.streamEvents.length > this.config.maxStreamEvents) {
      this.streamEvents = this.streamEvents.slice(-this.config.maxStreamEvents);
    }
    
    this.notifyListeners();
  }

  /**
   * Get recent stdout/stderr output
   */
  getRecentOutputs(limit?: number): StreamEvent[] {
    const n = limit || this.config.maxStreamEvents;
    return this.streamEvents.slice(-n);
  }

  /**
   * Get recent stdout only
   */
  getRecentStdout(limit: number = 10): StreamEvent[] {
    return this.streamEvents
      .filter((e) => e.type === "stdout")
      .slice(-limit);
  }

  /**
   * Get recent stderr only
   */
  getRecentStderr(limit: number = 10): StreamEvent[] {
    return this.streamEvents
      .filter((e) => e.type === "stderr")
      .slice(-limit);
  }

  // ============================================================================
  // Error Events
  // ============================================================================

  private addErrorEvent(event: ErrorEvent): void {
    this.errorEvents.push(event);
    
    // Trim to max size
    if (this.errorEvents.length > this.config.maxErrors) {
      this.errorEvents = this.errorEvents.slice(-this.config.maxErrors);
    }
    
    // Invalidate variable cache on errors (state may have changed)
    this.invalidateStaleVariables();
    
    this.notifyListeners();
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit?: number): ErrorEvent[] {
    const n = limit || this.config.maxErrors;
    return this.errorEvents.slice(-n);
  }

  /**
   * Get the most recent error (if any)
   */
  getLastError(): ErrorEvent | null {
    return this.errorEvents.length > 0
      ? this.errorEvents[this.errorEvents.length - 1]
      : null;
  }

  /**
   * Get errors from a specific execution
   */
  getErrorsForExecution(executionCount: number): ErrorEvent[] {
    return this.errorEvents.filter((e) => e.executionCount === executionCount);
  }

  // ============================================================================
  // Execution Results
  // ============================================================================

  private addExecutionResult(result: ExecutionResult): void {
    this.executionResults.push(result);
    
    // Trim to max size
    if (this.executionResults.length > this.config.maxResults) {
      this.executionResults = this.executionResults.slice(-this.config.maxResults);
    }
    
    this.notifyListeners();
  }

  /**
   * Get recent execution results
   */
  getRecentResults(limit?: number): ExecutionResult[] {
    const n = limit || this.config.maxResults;
    return this.executionResults.slice(-n);
  }

  // ============================================================================
  // Variable Cache
  // ============================================================================

  /**
   * Cache a variable summary
   */
  cacheVariableSummary(summary: VariableSummary): void {
    const name = summary.name;
    
    // Update or add to cache
    this.variableCache.set(name, summary);
    
    // Update LRU order
    const idx = this.variableAccessOrder.indexOf(name);
    if (idx !== -1) {
      this.variableAccessOrder.splice(idx, 1);
    }
    this.variableAccessOrder.push(name);
    
    // Evict if over limit
    while (this.variableCache.size > this.config.maxVariableCacheSize) {
      const oldest = this.variableAccessOrder.shift();
      if (oldest) {
        this.variableCache.delete(oldest);
      }
    }
    
    this.notifyListeners();
  }

  /**
   * Get a cached variable summary
   * Returns null if not cached or stale
   */
  getVariableSummary(name: string): VariableSummary | null {
    const summary = this.variableCache.get(name);
    if (!summary) {
      return null;
    }
    
    // Check staleness
    const age = Date.now() - summary.timestamp;
    if (age > this.config.variableCacheTTL) {
      return null; // Stale
    }
    
    // Check if execution count has advanced significantly
    // (variable may have been modified)
    if (
      summary.executionCount !== undefined &&
      this.lastExecutionCount - summary.executionCount > 5
    ) {
      return null; // Potentially stale due to many executions
    }
    
    // Update LRU order on access
    const idx = this.variableAccessOrder.indexOf(name);
    if (idx !== -1) {
      this.variableAccessOrder.splice(idx, 1);
      this.variableAccessOrder.push(name);
    }
    
    return summary;
  }

  /**
   * Get all cached variable summaries
   */
  getAllVariableSummaries(): VariableSummary[] {
    const now = Date.now();
    const results: VariableSummary[] = [];
    
    for (const [name, summary] of this.variableCache) {
      const age = now - summary.timestamp;
      if (age <= this.config.variableCacheTTL) {
        results.push(summary);
      }
    }
    
    return results;
  }

  /**
   * Invalidate a specific variable
   */
  invalidateVariable(name: string): void {
    this.variableCache.delete(name);
    const idx = this.variableAccessOrder.indexOf(name);
    if (idx !== -1) {
      this.variableAccessOrder.splice(idx, 1);
    }
  }

  /**
   * Invalidate all stale variables
   */
  invalidateStaleVariables(): void {
    const now = Date.now();
    const toRemove: string[] = [];
    
    for (const [name, summary] of this.variableCache) {
      const age = now - summary.timestamp;
      if (age > this.config.variableCacheTTL) {
        toRemove.push(name);
      }
    }
    
    toRemove.forEach((name) => this.invalidateVariable(name));
  }

  /**
   * Clear entire variable cache
   */
  clearVariableCache(): void {
    this.variableCache.clear();
    this.variableAccessOrder = [];
  }

  // ============================================================================
  // Snapshot & Listeners
  // ============================================================================

  /**
   * Get a complete snapshot of the runtime context
   */
  getSnapshot(): RuntimeSnapshot {
    return {
      variables: new Map(this.variableCache),
      recentErrors: [...this.errorEvents],
      recentOutputs: [...this.streamEvents],
      recentResults: [...this.executionResults],
      lastExecutionCount: this.lastExecutionCount,
      kernelStatus: this.kernelStatus,
    };
  }

  /**
   * Subscribe to store changes
   */
  onChange(callback: (snapshot: RuntimeSnapshot) => void): () => void {
    this.changeListeners.add(callback);
    return () => {
      this.changeListeners.delete(callback);
    };
  }

  private notifyListeners(): void {
    const snapshot = this.getSnapshot();
    this.changeListeners.forEach((cb) => {
      try {
        cb(snapshot);
      } catch (e) {
        console.error("[RuntimeContextStore] Error in change listener:", e);
      }
    });
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  /**
   * Get last execution count
   */
  getLastExecutionCount(): number {
    return this.lastExecutionCount;
  }

  /**
   * Get current kernel status
   */
  getKernelStatus(): string {
    return this.kernelStatus;
  }

  /**
   * Reset the store (e.g., on kernel restart)
   */
  reset(): void {
    this.variableCache.clear();
    this.variableAccessOrder = [];
    this.streamEvents = [];
    this.errorEvents = [];
    this.executionResults = [];
    this.lastExecutionCount = 0;
    this.kernelStatus = "unknown";
    this.notifyListeners();
  }

  /**
   * Get a text summary suitable for LLM context injection
   */
  getContextSummary(): string {
    const parts: string[] = [];
    
    // Recent errors
    const errors = this.getRecentErrors(3);
    if (errors.length > 0) {
      parts.push("## Recent Errors");
      errors.forEach((err, i) => {
        parts.push(`### Error ${i + 1}: ${err.ename}`);
        parts.push(`Message: ${err.evalue}`);
        if (err.traceback.length > 0) {
          // Only include last few lines of traceback
          const tb = err.traceback.slice(-5).join("\n");
          parts.push("```");
          parts.push(tb);
          parts.push("```");
        }
      });
    }
    
    // Cached variable summaries
    const vars = this.getAllVariableSummaries();
    if (vars.length > 0) {
      parts.push("## Active Variables");
      vars.forEach((v) => {
        let line = `- \`${v.name}\`: ${v.type}`;
        if (v.shape) {
          line += ` shape=${JSON.stringify(v.shape)}`;
        }
        if (v.dtype) {
          line += ` dtype=${v.dtype}`;
        }
        if (v.columns && v.columns.length > 0) {
          const colNames = v.columns.slice(0, 5).map((c) => c.name).join(", ");
          line += ` columns=[${colNames}${v.columns.length > 5 ? ", ..." : ""}]`;
        }
        parts.push(line);
      });
    }
    
    // Recent outputs (stderr)
    const stderr = this.getRecentStderr(3);
    if (stderr.length > 0) {
      parts.push("## Recent Warnings/Stderr");
      stderr.forEach((s) => {
        parts.push("```");
        parts.push(s.text.trim().slice(0, 500));
        parts.push("```");
      });
    }
    
    return parts.join("\n");
  }
}

// ============================================================================
// Singleton factory
// ============================================================================

let _instance: RuntimeContextStore | null = null;

/**
 * Get or create the singleton RuntimeContextStore instance
 */
export function getRuntimeContextStore(): RuntimeContextStore {
  if (!_instance) {
    _instance = new RuntimeContextStore();
  }
  return _instance;
}

/**
 * Reset the singleton instance (for testing or kernel restart)
 */
export function resetRuntimeContextStore(): void {
  if (_instance) {
    _instance.reset();
  }
  _instance = null;
}
