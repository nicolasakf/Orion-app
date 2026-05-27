/**
 * KernelSidecar - Runtime introspection layer for the AI Assistant
 *
 * This module extends kernel connectivity with:
 * - Global message tap via kernel.iopubMessage signal
 * - Comm-based variable inspection protocol
 * - Traffic light state management (idle/busy/blocked)
 *
 * All communication uses @jupyterlab/services APIs rather than
 * directly accessing KernelService internals.
 */

import type { KernelService } from "@/lib/kernel/kernel-service";
import type { Kernel } from "@jupyterlab/services";

// ============================================================================
// Types
// ============================================================================

export type TrafficLightState = "green" | "yellow" | "red";

export interface ColumnInfo {
  name: string;
  dtype: string;
  nullCount?: number;
  uniqueCount?: number;
  topValues?: string[];
  min?: number | string;
  max?: number | string;
  mean?: number;
  std?: number;
}

/** JSON-serializable cell value from a pandas DataFrame preview. */
export type DataFrameCell = string | number | boolean | null;

/** Tabular preview of a DataFrame for the variable detail dialog. */
export interface DataFramePreview {
  columnNames: string[];
  rows: DataFrameCell[][];
  totalRows: number;
  totalColumns: number;
  truncatedRows?: boolean;
  truncatedColumns?: boolean;
}

export interface VariableSummary {
  name: string;
  type: string;
  shape?: [number, number] | number[];
  dtype?: string;
  memoryUsage?: number;
  columns?: ColumnInfo[];
  sample?: unknown;
  stats?: Record<string, unknown>;
  repr?: string;
  device?: string; // For torch tensors
  length?: number;
  dataframePreview?: DataFramePreview;
  error?: string;
  timestamp: number;
  executionCount?: number;
}

export interface KernelMessage {
  header: {
    msg_id: string;
    msg_type: string;
    username: string;
    session: string;
    date: string;
    version: string;
  };
  parent_header: Record<string, any>;
  metadata: Record<string, any>;
  content: Record<string, any>;
  channel?: string;
  buffers?: ArrayBuffer[];
}

export interface IOPubEvent {
  type: "stream" | "error" | "execute_result" | "display_data" | "status";
  content: any;
  timestamp: number;
  executionCount?: number;
}

type MessageCallback = (msg: KernelMessage) => void;

// ============================================================================
// Inspector Python Code (injected into kernel)
// ============================================================================

const INSPECTOR_BOOTSTRAP_CODE = `
# AI Assistant Inspector Bootstrap v1
import json
import sys
from IPython import get_ipython

_AI_INSPECTOR_VERSION = 1
_AI_INSPECTOR_TARGET = "ai.assistant.inspector"

def _ai_inspector_handler(comm, open_msg):
    """Handle incoming inspection requests from the AI assistant."""
    
    @comm.on_msg
    def _handle_msg(msg):
        data = msg['content']['data']
        action = data.get('action', '')
        response = {'action': action, 'success': False}
        
        try:
            if action == 'inspect':
                var_name = data.get('var', '')
                response = _inspect_variable(var_name)
            elif action == 'list_vars':
                response = _list_variables()
            elif action == 'ping':
                response = {'action': 'pong', 'success': True, 'version': _AI_INSPECTOR_VERSION}
            else:
                response = {'action': action, 'success': False, 'error': f'Unknown action: {action}'}
        except Exception as e:
            response = {'action': action, 'success': False, 'error': str(e)}
        
        comm.send(response)

def _inspect_variable(var_name):
    """Generate a token-efficient summary of a variable."""
    ip = get_ipython()
    if ip is None:
        return {'success': False, 'error': 'IPython not available'}
    
    user_ns = ip.user_ns
    if var_name not in user_ns:
        return {'success': False, 'error': f'Variable "{var_name}" not found'}
    
    obj = user_ns[var_name]
    result = {
        'success': True,
        'name': var_name,
        'type': type(obj).__module__ + '.' + type(obj).__name__,
    }
    
    # Handle pandas DataFrame
    if _is_dataframe(obj):
        result.update(_summarize_dataframe(obj))
    # Handle pandas Series
    elif _is_series(obj):
        result.update(_summarize_series(obj))
    # Handle numpy array
    elif _is_numpy_array(obj):
        result.update(_summarize_numpy(obj))
    # Handle torch tensor
    elif _is_torch_tensor(obj):
        result.update(_summarize_torch(obj))
    # Handle lists/tuples
    elif isinstance(obj, (list, tuple)):
        result.update(_summarize_sequence(obj))
    # Handle dicts
    elif isinstance(obj, dict):
        result.update(_summarize_dict(obj))
    # Generic fallback
    else:
        result.update(_summarize_generic(obj))
    
    return result

def _is_dataframe(obj):
    try:
        import pandas as pd
        return isinstance(obj, pd.DataFrame)
    except ImportError:
        return False

def _is_series(obj):
    try:
        import pandas as pd
        return isinstance(obj, pd.Series)
    except ImportError:
        return False

def _is_numpy_array(obj):
    try:
        import numpy as np
        return isinstance(obj, np.ndarray)
    except ImportError:
        return False

def _is_torch_tensor(obj):
    try:
        import torch
        return isinstance(obj, torch.Tensor)
    except ImportError:
        return False

def _summarize_dataframe(df):
    """Summarize a pandas DataFrame."""
    import pandas as pd
    
    summary = {
        'shape': list(df.shape),
        'memoryUsage': int(df.memory_usage(deep=True).sum()),
        'columns': [],
        'dataframePreview': _serialize_dataframe_preview(df),
    }
    
    for col in df.columns[:50]:  # Limit to 50 columns
        col_info = {
            'name': str(col),
            'dtype': str(df[col].dtype),
            'nullCount': int(df[col].isnull().sum()),
            'uniqueCount': min(int(df[col].nunique()), 100),
        }
        
        # Add stats for numeric columns
        if pd.api.types.is_numeric_dtype(df[col]):
            try:
                col_info['min'] = float(df[col].min()) if not pd.isna(df[col].min()) else None
                col_info['max'] = float(df[col].max()) if not pd.isna(df[col].max()) else None
                col_info['mean'] = float(df[col].mean()) if not pd.isna(df[col].mean()) else None
                col_info['std'] = float(df[col].std()) if not pd.isna(df[col].std()) else None
            except:
                pass
        else:
            # Top values for categorical/string columns
            try:
                top_vals = df[col].value_counts().head(3).index.tolist()
                col_info['topValues'] = [str(v)[:50] for v in top_vals]
            except:
                pass
        
        summary['columns'].append(col_info)
    
    return summary

def _serialize_cell(val):
    """Convert a DataFrame cell to a JSON-friendly scalar."""
    import pandas as pd
    import numpy as np

    if val is None:
        return None
    if isinstance(val, (float, np.floating)):
        if pd.isna(val):
            return None
        f = float(val)
        if np.isinf(f):
            return 'inf' if f > 0 else '-inf'
        return f
    if isinstance(val, (int, np.integer)):
        if pd.isna(val):
            return None
        return int(val)
    if isinstance(val, (bool, np.bool_)):
        return bool(val)
    if isinstance(val, str):
        return val[:200] + ('…' if len(val) > 200 else '')
    try:
        if pd.isna(val):
            return None
    except Exception:
        pass
    try:
        s = str(val)
        return s[:200] + ('…' if len(s) > 200 else '')
    except Exception:
        return '<?>'

def _serialize_dataframe_preview(df, max_rows=1000, max_cols=100):
    """Serialize DataFrame rows/columns for the variable detail dialog."""
    total_rows, total_cols = df.shape
    preview = df.iloc[:max_rows, :max_cols]
    column_names = [str(c) for c in preview.columns.tolist()]

    rows = []
    for row_vals in preview.itertuples(index=False, name=None):
        if not isinstance(row_vals, tuple):
            row_vals = (row_vals,)
        rows.append([_serialize_cell(v) for v in row_vals])

    return {
        'columnNames': column_names,
        'rows': rows,
        'totalRows': int(total_rows),
        'totalColumns': int(total_cols),
        'truncatedRows': total_rows > max_rows,
        'truncatedColumns': total_cols > max_cols,
    }

def _summarize_series(series):
    """Summarize a pandas Series."""
    import pandas as pd
    
    summary = {
        'shape': [len(series)],
        'dtype': str(series.dtype),
        'nullCount': int(series.isnull().sum()),
        'uniqueCount': min(int(series.nunique()), 100),
    }
    
    if pd.api.types.is_numeric_dtype(series):
        try:
            summary['stats'] = {
                'min': float(series.min()) if not pd.isna(series.min()) else None,
                'max': float(series.max()) if not pd.isna(series.max()) else None,
                'mean': float(series.mean()) if not pd.isna(series.mean()) else None,
                'std': float(series.std()) if not pd.isna(series.std()) else None,
            }
        except:
            pass
    else:
        try:
            top_vals = series.value_counts().head(5).index.tolist()
            summary['topValues'] = [str(v)[:50] for v in top_vals]
        except:
            pass
    
    return summary

def _summarize_numpy(arr):
    """Summarize a numpy array."""
    import numpy as np
    
    summary = {
        'shape': list(arr.shape),
        'dtype': str(arr.dtype),
        'memoryUsage': int(arr.nbytes),
    }
    
    if np.issubdtype(arr.dtype, np.number):
        try:
            # Sample if large
            sample = arr.flatten()[:10000] if arr.size > 10000 else arr.flatten()
            summary['stats'] = {
                'min': float(np.nanmin(sample)),
                'max': float(np.nanmax(sample)),
                'mean': float(np.nanmean(sample)),
                'std': float(np.nanstd(sample)),
            }
        except:
            pass
    
    return summary

def _summarize_torch(tensor):
    """Summarize a PyTorch tensor."""
    summary = {
        'shape': list(tensor.shape),
        'dtype': str(tensor.dtype),
        'device': str(tensor.device),
        'requiresGrad': tensor.requires_grad,
    }
    
    try:
        # Move to CPU for stats if needed
        t = tensor.detach()
        if t.is_cuda:
            t = t.cpu()
        t = t.float()
        
        # Sample if large
        flat = t.flatten()
        sample = flat[:10000] if flat.numel() > 10000 else flat
        
        summary['stats'] = {
            'min': float(sample.min().item()),
            'max': float(sample.max().item()),
            'mean': float(sample.mean().item()),
            'std': float(sample.std().item()),
        }
    except:
        pass
    
    return summary

def _summarize_sequence(seq):
    """Summarize a list or tuple."""
    summary = {
        'length': len(seq),
        'repr': _truncated_sequence_repr(seq, 50000),
    }
    
    if len(seq) > 0:
        # Sample element types
        type_counts = {}
        for item in seq[:100]:
            t = type(item).__name__
            type_counts[t] = type_counts.get(t, 0) + 1
        summary['elementTypes'] = type_counts
        
        # Preview first few elements
        preview = []
        for item in seq[:5]:
            r = repr(item)
            preview.append(r[:100] if len(r) > 100 else r)
        summary['preview'] = preview
    
    return summary

def _summarize_dict(d):
    """Summarize a dictionary."""
    summary = {
        'length': len(d),
        'repr': _truncated_dict_repr(d, 50000),
    }
    
    # Sample keys
    keys = list(d.keys())[:20]
    summary['sampleKeys'] = [str(k)[:50] for k in keys]
    
    # Value types
    type_counts = {}
    for v in list(d.values())[:100]:
        t = type(v).__name__
        type_counts[t] = type_counts.get(t, 0) + 1
    summary['valueTypes'] = type_counts
    
    return summary

def _truncated_item_repr(item, max_item_len):
    """repr() for one nested value, capped per item."""
    try:
        r = repr(item)
    except Exception:
        return '<?>'
    if len(r) > max_item_len:
        return r[: max_item_len - 1] + '…'
    return r

def _truncated_sequence_repr(seq, max_len):
    """Build a bracketed preview of list/tuple contents up to max_len characters."""
    open_b = '[' if isinstance(seq, list) else '('
    close_b = ']' if isinstance(seq, list) else ')'
    n = len(seq)
    if n == 0:
        return open_b + close_b

    parts = []
    for item in seq:
        parts.append(_truncated_item_repr(item, 80))
        body = ', '.join(parts)
        remaining = n - len(parts)
        candidate = (
            f"{open_b}{body}, …{close_b}" if remaining > 0 else f"{open_b}{body}{close_b}"
        )
        if len(candidate) > max_len:
            if len(parts) == 1:
                budget = max_len - len(open_b) - len(close_b) - 1
                inner = body[:budget] if budget > 0 else ''
                return f"{open_b}{inner}…{close_b}"
            parts.pop()
            return f"{open_b}{', '.join(parts)}, …{close_b}"

    return f"{open_b}{', '.join(parts)}{close_b}"

def _truncated_dict_repr(d, max_len):
    """Build a brace preview of dict contents up to max_len characters."""
    if len(d) == 0:
        return '{}'

    parts = []
    n = len(d)
    for k, v in d.items():
        rk = _truncated_item_repr(k, 40)
        rv = _truncated_item_repr(v, 80)
        parts.append(f"{rk}: {rv}")
        remaining = n - len(parts)
        candidate = (
            '{' + ', '.join(parts) + ', …}' if remaining > 0 else '{' + ', '.join(parts) + '}'
        )
        if len(candidate) > max_len:
            if len(parts) == 1:
                budget = max_len - 3
                inner = ', '.join(parts)[:budget] if budget > 0 else ''
                return '{' + inner + '…}'
            parts.pop()
            return '{' + ', '.join(parts) + ', …}'

    return '{' + ', '.join(parts) + '}'

def _summarize_generic(obj):
    """Generic object summary."""
    summary = {}
    
    # Truncated repr
    try:
        r = repr(obj)
        summary['repr'] = r[:500] if len(r) > 500 else r
    except:
        summary['repr'] = '<repr failed>'
    
    # Key attributes
    try:
        attrs = [a for a in dir(obj) if not a.startswith('_')][:20]
        summary['attributes'] = attrs
    except:
        pass
    
    return summary

def _preview_repr(obj):
    """Short string for variable list hover (avoid heavy repr() for large objects)."""
    try:
        if _is_dataframe(obj):
            return "DataFrame(shape=%s)" % (tuple(obj.shape),)
        if _is_series(obj):
            return "Series(len=%s, dtype=%s)" % (len(obj), obj.dtype)
        if _is_numpy_array(obj):
            return "ndarray(shape=%s, dtype=%s)" % (tuple(obj.shape), obj.dtype)
        if _is_torch_tensor(obj):
            return "Tensor(shape=%s, dtype=%s, device=%s)" % (tuple(obj.shape), obj.dtype, obj.device)
        if isinstance(obj, (list, tuple)):
            return _truncated_sequence_repr(obj, 240)
        if isinstance(obj, dict):
            return _truncated_dict_repr(obj, 240)
        r = repr(obj)
        max_len = 240
        if len(r) > max_len:
            return r[: max_len - 1] + "…"
        return r
    except Exception:
        return "<preview unavailable>"

def _list_variables():
    """List all user-defined variables with basic type info."""
    ip = get_ipython()
    if ip is None:
        return {'success': False, 'error': 'IPython not available'}
    
    user_ns = ip.user_ns
    variables = []
    
    # Filter out internal IPython variables
    skip_prefixes = ('_', 'In', 'Out', 'get_ipython', 'exit', 'quit')
    skip_types = (type, type(lambda: None), type(sys))
    
    for name, obj in user_ns.items():
        if name.startswith(skip_prefixes):
            continue
        if isinstance(obj, skip_types):
            continue
        if name in ('_ai_inspector_handler', '_inspect_variable', '_list_variables',
                    '_summarize_dataframe', '_summarize_series', '_summarize_numpy',
                    '_summarize_torch', '_summarize_sequence', '_summarize_dict',
                    '_summarize_generic', '_preview_repr', '_truncated_item_repr',
                    '_truncated_sequence_repr', '_truncated_dict_repr', '_serialize_cell',
                    '_serialize_dataframe_preview', '_is_dataframe', '_is_series',
                    '_is_numpy_array', '_is_torch_tensor', '_AI_INSPECTOR_VERSION',
                    '_AI_INSPECTOR_TARGET'):
            continue
        
        var_info = {
            'name': name,
            'type': type(obj).__name__,
        }
        
        # Add shape/length where applicable
        if hasattr(obj, 'shape'):
            try:
                var_info['shape'] = list(obj.shape)
            except:
                pass
        elif hasattr(obj, '__len__'):
            try:
                var_info['length'] = len(obj)
            except:
                pass
        
        var_info['repr'] = _preview_repr(obj)
        variables.append(var_info)
    
    return {'success': True, 'variables': variables}

# Register the comm target
try:
    ip = get_ipython()
    if ip is not None:
        ip.kernel.comm_manager.register_target(_AI_INSPECTOR_TARGET, _ai_inspector_handler)
        print(f"[AI Inspector] Registered target: {_AI_INSPECTOR_TARGET} (v{_AI_INSPECTOR_VERSION})")
except Exception as e:
    print(f"[AI Inspector] Failed to register: {e}")
`;

// ============================================================================
// KernelSidecar Class
// ============================================================================

export class KernelSidecar {
  private kernelService: KernelService;
  private globalMessageCallbacks: Set<MessageCallback> = new Set();
  private trafficLightState: TrafficLightState = "green";
  private trafficLightCallbacks: Set<(state: TrafficLightState) => void> = new Set();
  private inspectorBootstrapped: boolean = false;
  private inspectorComm: Kernel.IComm | null = null;
  private pendingInspections: Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }> = new Map();
  private lastExecutionCount: number = 0;
  private busyTimeout: ReturnType<typeof setTimeout> | null = null;

  // Signal disconnectors
  private iopubDisconnect: (() => void) | null = null;
  private statusDisconnect: (() => void) | null = null;

  // Configuration
  private static readonly INSPECTION_TIMEOUT_MS = 5000;
  private static readonly BUSY_TIMEOUT_MS = 30000;

  constructor(kernelService: KernelService) {
    this.kernelService = kernelService;
    this.setupStatusTracking();
    // IOPub tap is set up lazily when a kernel is available
  }

  // ============================================================================
  // Global Message Tap (via kernel.iopubMessage signal)
  // ============================================================================

  /**
   * Subscribe to all kernel messages (IOPub)
   */
  onMessage(callback: MessageCallback): () => void {
    this.globalMessageCallbacks.add(callback);
    
    // Set up IOPub tap if not already done and kernel is available
    this.ensureIOPubTapSetup();
    
    return () => {
      this.globalMessageCallbacks.delete(callback);
    };
  }

  /**
   * Set up interception of all IOPub messages via the kernel signal.
   * Called lazily when first needed. No monkey-patching needed.
   */
  private ensureIOPubTapSetup(): void {
    if (this.iopubDisconnect) return; // Already set up

    const kernel = this.kernelService.getKernelConnection();
    if (!kernel) return; // No kernel yet, will be set up later

    const handler = (_sender: Kernel.IKernelConnection, msg: any) => {
      this.broadcastMessage(msg as KernelMessage);
    };

    kernel.iopubMessage.connect(handler);
    this.iopubDisconnect = () => {
      kernel.iopubMessage.disconnect(handler);
    };
  }

  /**
   * Set up traffic light state tracking based on kernel status
   */
  private setupStatusTracking(): void {
    this.statusDisconnect = this.kernelService.onStatusChanged((status: string) => {
      this.updateTrafficLight(status);
    });
  }

  private broadcastMessage(msg: KernelMessage): void {
    // Track execution count
    if (msg.content?.execution_count) {
      this.lastExecutionCount = msg.content.execution_count;
    }

    // Handle comm messages for inspector
    if (
      msg.header?.msg_type === "comm_msg" &&
      this.inspectorComm &&
      msg.content?.comm_id === this.inspectorComm.commId
    ) {
      this.handleInspectorResponse(msg);
    }

    // Broadcast to all listeners
    this.globalMessageCallbacks.forEach((callback) => {
      try {
        callback(msg);
      } catch (e) {
        console.error("[KernelSidecar] Error in message callback:", e);
      }
    });
  }

  // ============================================================================
  // Traffic Light State
  // ============================================================================

  /**
   * Get current traffic light state
   * - green: kernel idle, safe to inspect
   * - yellow: kernel busy, limit introspection
   * - red: kernel blocked/dead, avoid inspection
   */
  getTrafficLightState(): TrafficLightState {
    return this.trafficLightState;
  }

  /**
   * Subscribe to traffic light state changes
   */
  onTrafficLightChange(callback: (state: TrafficLightState) => void): () => void {
    this.trafficLightCallbacks.add(callback);
    return () => {
      this.trafficLightCallbacks.delete(callback);
    };
  }

  private updateTrafficLight(status: string): void {
    let newState: TrafficLightState;

    switch (status) {
      case "idle":
        newState = "green";
        this.clearBusyTimeout();
        break;
      case "busy":
        newState = "yellow";
        this.startBusyTimeout();
        break;
      case "dead":
      case "terminating":
      case "restarting":
      case "starting":
        newState = "red";
        this.clearBusyTimeout();
        // Reset inspector state on restart/death so it re-bootstraps on next use.
        // The Python inspector code is wiped from kernel memory; keeping the flag
        // true would cause silent inspection timeouts.
        if (status === "restarting" || status === "dead") {
          this.resetInspectorState();
        }
        break;
      default:
        newState = "yellow";
    }

    if (newState !== this.trafficLightState) {
      this.trafficLightState = newState;
      this.trafficLightCallbacks.forEach((cb) => cb(newState));
    }
  }

  /**
   * Reset only the inspector state after a kernel restart.
   * Unlike reset(), this preserves IOPub and status listeners since the
   * kernel connection object itself is still valid — only the Python-side
   * inspector comm target was wiped by the restart.
   */
  private resetInspectorState(): void {
    this.inspectorBootstrapped = false;

    if (this.inspectorComm) {
      try {
        this.inspectorComm.close();
      } catch {
        // Comm is likely already invalid after kernel restart
      }
      this.inspectorComm = null;
    }

    this.pendingInspections.forEach((pending) => {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Kernel restarted"));
    });
    this.pendingInspections.clear();
    this.lastExecutionCount = 0;
  }

  private startBusyTimeout(): void {
    this.clearBusyTimeout();
    this.busyTimeout = setTimeout(() => {
      if (this.trafficLightState === "yellow") {
        this.trafficLightState = "red";
        this.trafficLightCallbacks.forEach((cb) => cb("red"));
      }
    }, KernelSidecar.BUSY_TIMEOUT_MS);
  }

  private clearBusyTimeout(): void {
    if (this.busyTimeout) {
      clearTimeout(this.busyTimeout);
      this.busyTimeout = null;
    }
  }

  // ============================================================================
  // Inspector Bootstrap
  // ============================================================================

  /**
   * Ensure the inspector comm target is registered in the kernel
   */
  async ensureInspectorBootstrapped(): Promise<boolean> {
    if (this.inspectorBootstrapped) {
      return true;
    }

    const kernel = this.kernelService.getKernelConnection();
    if (!kernel) {
      console.warn("[KernelSidecar] Cannot bootstrap inspector: no kernel connected");
      return false;
    }

    try {
      // Set up IOPub tap now that we have a kernel
      this.ensureIOPubTapSetup();
      
      await this.executeSilent(INSPECTOR_BOOTSTRAP_CODE);
      this.inspectorBootstrapped = true;
      console.log("[KernelSidecar] Inspector bootstrapped successfully");
      return true;
    } catch (error) {
      console.error("[KernelSidecar] Failed to bootstrap inspector:", error);
      return false;
    }
  }

  /**
   * Execute code silently using kernel.requestExecute with silent=true.
   */
  private async executeSilent(code: string): Promise<void> {
    const kernel = this.kernelService.getKernelConnection();
    if (!kernel) {
      throw new Error("Kernel not connected");
    }

    const future = kernel.requestExecute({
      code,
      silent: true,
      store_history: false,
    });

    const reply = await future.done;

    if (reply && reply.content.status !== "ok") {
      const content = reply.content as any;
      throw new Error(content.evalue || "Execution failed");
    }
  }

  // ============================================================================
  // Variable Inspection
  // ============================================================================

  /**
   * Inspect a variable in the kernel namespace
   */
  async inspectVariable(varName: string): Promise<VariableSummary> {
    if (!this.inspectorBootstrapped) {
      const bootstrapped = await this.ensureInspectorBootstrapped();
      if (!bootstrapped) {
        return {
          name: varName,
          type: "unknown",
          error: "Failed to bootstrap inspector",
          timestamp: Date.now(),
        };
      }
    }

    if (this.trafficLightState === "red") {
      return {
        name: varName,
        type: "unknown",
        error: "Kernel unavailable (blocked or dead)",
        timestamp: Date.now(),
      };
    }

    try {
      return await this.sendInspectionRequest(varName);
    } catch (error) {
      return {
        name: varName,
        type: "unknown",
        error: error instanceof Error ? error.message : "Inspection failed",
        timestamp: Date.now(),
      };
    }
  }

  /**
   * List all variables in the kernel namespace
   */
  async listVariables(): Promise<
    { name: string; type: string; shape?: number[]; length?: number; repr?: string }[]
  > {
    if (!this.inspectorBootstrapped) {
      const bootstrapped = await this.ensureInspectorBootstrapped();
      if (!bootstrapped) {
        return [];
      }
    }

    if (this.trafficLightState === "red") {
      return [];
    }

    try {
      const response = await this.sendCommMessage({ action: "list_vars" });
      if (response.success && response.variables) {
        return response.variables;
      }
      return [];
    } catch (error) {
      console.error("[KernelSidecar] Failed to list variables:", error);
      return [];
    }
  }

  private async sendInspectionRequest(varName: string): Promise<VariableSummary> {
    const response = await this.sendCommMessage({ action: "inspect", var: varName });

    if (!response.success) {
      return {
        name: varName,
        type: "unknown",
        error: response.error || "Inspection failed",
        timestamp: Date.now(),
      };
    }

    return {
      name: response.name || varName,
      type: response.type || "unknown",
      shape: response.shape,
      dtype: response.dtype,
      memoryUsage: response.memoryUsage,
      columns: response.columns,
      stats: response.stats,
      repr: response.repr,
      device: response.device,
      length: response.length,
      dataframePreview: response.dataframePreview,
      timestamp: Date.now(),
      executionCount: this.lastExecutionCount,
    };
  }

  /**
   * Send a message through the inspector Comm channel.
   * Opens the comm lazily on first use via kernel.createComm().
   */
  private async sendCommMessage(data: Record<string, any>): Promise<any> {
    const kernel = this.kernelService.getKernelConnection();
    if (!kernel) {
      throw new Error("Kernel not connected");
    }

    // Open comm lazily
    if (!this.inspectorComm) {
      this.inspectorComm = kernel.createComm("ai.assistant.inspector");
      await this.inspectorComm.open().done;
    }

    return new Promise((resolve, reject) => {
      const msgId = `insp_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

      const timeout = setTimeout(() => {
        this.pendingInspections.delete(msgId);
        reject(new Error("Inspection timeout"));
      }, KernelSidecar.INSPECTION_TIMEOUT_MS);

      this.pendingInspections.set(msgId, {
        resolve: (value: any) => {
          clearTimeout(timeout);
          this.pendingInspections.delete(msgId);
          resolve(value);
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          this.pendingInspections.delete(msgId);
          reject(error);
        },
        timeout,
      });

      this.inspectorComm!.send(data);
    });
  }

  private handleInspectorResponse(msg: KernelMessage): void {
    // Resolve the oldest pending inspection
    const pending = this.pendingInspections.entries().next().value;
    if (pending) {
      const [, handler] = pending;
      handler.resolve(msg.content.data ?? msg.content);
    }
  }

  // ============================================================================
  // Public Utilities
  // ============================================================================

  /**
   * Get the last known execution count
   */
  getLastExecutionCount(): number {
    return this.lastExecutionCount;
  }

  /**
   * Check if inspector is ready
   */
  isInspectorReady(): boolean {
    return this.inspectorBootstrapped && this.trafficLightState !== "red";
  }

  /**
   * Reset the inspector state (e.g., after kernel restart)
   */
  reset(): void {
    this.inspectorBootstrapped = false;

    if (this.inspectorComm) {
      try {
        this.inspectorComm.close();
      } catch {
        // Ignore errors during cleanup
      }
      this.inspectorComm = null;
    }

    this.pendingInspections.forEach((pending) => {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Inspector reset"));
    });
    this.pendingInspections.clear();
    this.lastExecutionCount = 0;

    // Disconnect signal handlers
    this.iopubDisconnect?.();
    this.iopubDisconnect = null;
    this.statusDisconnect?.();
    this.statusDisconnect = null;
  }
}
