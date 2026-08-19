import {
  ServerConnection,
  KernelManager,
  SessionManager,
  KernelSpecManager,
  ContentsManager,
  TerminalManager,
  type Kernel,
  type Session,
  type Terminal,
} from "@jupyterlab/services";
import { PageConfig } from "@jupyterlab/coreutils";
import stripAnsi from "strip-ansi";

/**
 * Strip ANSI/VT100 escape sequences and clean terminal output for the LLM.
 *
 * Uses strip-ansi for comprehensive ANSI removal (CSI, OSC, DCS, etc.).
 * Also removes C0 control chars and normalizes CR/CRLF line endings.
 */
function stripTerminalOutput(text: string): string {
  const ansiStripped = stripAnsi(text)
    // C0 control chars except tab, newline, carriage return
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // Some terminals emit bare CR (`\r`) line endings; dropping those lines can
  // erase real command output. Normalize all line endings to LF instead.
  return ansiStripped
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

export interface KernelServiceOptions {
  baseUrl?: string;
  token?: string;
}

interface NormalizedConnectionConfig {
  baseUrl: string;
  token: string;
}

interface KernelModel {
  id: string;
  name: string;
  last_activity?: string;
  execution_state?: string;
  connections?: number;
}

interface ExecutionFuture {
  done: Promise<void>;
}

export interface KernelExecuteOptions {
  /** Do not add the request to kernel history. Useful for UI state sync. */
  storeHistory?: boolean;
  /** Execute silently so the kernel does not emit user-visible outputs. */
  silent?: boolean;
}

/** Summary of a tracked kernel session, returned by listActiveSessions(). */
export interface KernelSessionInfo {
  /** Notebook path used as the session key. */
  path: string;
  /** Kernel ID on the Jupyter server. */
  kernelId: string;
  /** Kernel spec name (e.g. "python3"). */
  kernelName: string;
  /** Kernel execution state (idle, busy, etc.). */
  status: string;
  /** Whether this is the currently active session. */
  isActive: boolean;
}

/**
 * Basic environment information retrieved from the Jupyter server on connect.
 * Injected into the agent system prompt so the LLM is aware of the execution
 * environment without needing to run any code.
 */
export interface JupyterServerInfo {
  /** OS family: "posix" (Linux/macOS) or "nt" (Windows). */
  os: string;
  /** Detailed platform string, e.g. "Linux-6.1.0 x86_64 with glibc2.35". */
  platform: string;
  /** Python version, e.g. "3.11.4". */
  pythonVersion: string;
  /** Jupyter server version, e.g. "2.14.5". */
  jupyterVersion: string;
}

/** Server-side running kernel row used by the left sidebar. */
export interface RunningKernelSidebarInfo {
  /** Kernel ID on the Jupyter server. */
  kernelId: string;
  /** Kernel spec name (for example, "python3"). */
  kernelName: string;
  /** Human-friendly kernel name from kernelspec metadata. */
  displayName: string;
  /** Kernel language from kernelspec metadata. */
  language: string;
  /** Kernel execution state from the running session model. */
  state: string;
  /** Number of connected clients, stringified for display parity. */
  connections: string;
  /** Last activity in YYYY-MM-DD HH:mm:ss UTC, or "unknown". */
  lastActivity: string;
  /** Session path reported by the Jupyter server, or "unknown". */
  sessionPath: string;
  /** Basename extracted from sessionPath for compact display. */
  fileName: string;
  /** Whether this kernel is currently active in Orion. */
  isActive: boolean;
}

/** Tracks a single notebook-path → session mapping. */
interface SessionEntry {
  connection: Session.ISessionConnection;
  /** True if this service created the session (and should shut it down on cleanup). */
  owned: boolean;
}

/**
 * Service for managing Jupyter kernels.
 *
 * Thin wrapper around @jupyterlab/services that preserves the original
 * public API while delegating all protocol work (WebSocket management,
 * message routing, reconnection, heartbeat, binary buffers, Comm support)
 * to the battle-tested JupyterLab library.
 *
 * Supports multiple concurrent sessions — one per notebook path — so that
 * each .ipynb file gets its own independent kernel.
 */
export class KernelService {
  private static readonly UI_ROUTE_SEGMENTS = new Set([
    "lab",
    "tree",
    "notebooks",
    "consoles",
  ]);

  private serverSettings: ServerConnection.ISettings;
  private kernelManager: KernelManager;
  private sessionManager: SessionManager;
  private kernelSpecManager: KernelSpecManager;
  private contentsManager: ContentsManager;
  private terminalManager: TerminalManager;

  /** Map of notebook path → session entry. Each notebook has its own kernel. */
  private sessions: Map<string, SessionEntry> = new Map();

  /** Map of terminal name → active terminal connection. */
  private terminalConnections: Map<string, Terminal.ITerminalConnection> = new Map();
  /** Map of terminal name → buffered unread stdout lines. */
  private terminalBuffers: Map<string, string[]> = new Map();
  /** Which notebook path is currently "active" (for status, execute, etc.). */
  private activePath: string | null = null;

  private statusCallbacks: Set<(status: string) => void> = new Set();
  private currentStatus: string = "unknown";
  private statusListenerKernel: Kernel.IKernelConnection | null = null;
  private disposed = false;

  /** Callbacks invoked when sessions are added/removed/changed. */
  private sessionsChangedCallbacks: Set<() => void> = new Set();

  /** Callbacks invoked when terminals are added/removed. */
  private terminalsChangedCallbacks: Set<() => void> = new Set();

  constructor(options: KernelServiceOptions = {}) {
    const configuredBaseUrl =
      options.baseUrl ||
      process.env.NEXT_PUBLIC_JUPYTER_URL ||
      "http://localhost:8888";
    const configuredToken =
      options.token || process.env.NEXT_PUBLIC_JUPYTER_TOKEN || "";

    const { baseUrl, token } = KernelService.normalizeConnectionConfig(
      configuredBaseUrl,
      configuredToken
    );

    this.serverSettings = ServerConnection.makeSettings({
      baseUrl,
      token,
      appendToken: true,
    });

    this.kernelManager = new KernelManager({
      serverSettings: this.serverSettings,
    });
    this.sessionManager = new SessionManager({
      kernelManager: this.kernelManager,
      serverSettings: this.serverSettings,
    });
    this.kernelSpecManager = new KernelSpecManager({
      serverSettings: this.serverSettings,
    });
    this.contentsManager = new ContentsManager({
      serverSettings: this.serverSettings,
    });
    // TerminalManager checks PageConfig.getOption('terminalsAvailable') on
    // construction and rejects its ready promise with "Terminals unavailable"
    // when the flag is not set. Outside of a full JupyterLab page load this
    // option is never populated, so we enable it explicitly.
    PageConfig.setOption("terminalsAvailable", "true");

    this.terminalManager = new TerminalManager({
      serverSettings: this.serverSettings,
    });

    // Subscribe to session changes on the server to detect external shutdowns
    this.sessionManager.runningChanged.connect(this.handleServerSessionsChanged, this);
  }

  /**
   * Called when the Jupyter server's session list changes (sessions added/removed).
   * Validates our local sessions map against the server and cleans up dead sessions.
   */
  private handleServerSessionsChanged = async () => {
    try {
      await this.sessionManager.refreshRunning();
      const runningOnServer = new Set(
        Array.from(this.sessionManager.running()).map((s) => s.kernel?.id).filter(Boolean)
      );

      // Check each local session — if its kernel isn't on the server, remove it
      let changed = false;
      for (const [path, entry] of Array.from(this.sessions.entries())) {
        const kernel = entry.connection.kernel;
        if (!kernel || kernel.isDisposed || !runningOnServer.has(kernel.id)) {
          console.log(`KernelService: Removing dead session for ${path}`);
          entry.connection.dispose();
          this.sessions.delete(path);
          changed = true;

          // If this was the active session, clear it
          if (this.activePath === path) {
            this.detachStatusListener();
            this.activePath = null;
            this.updateStatus("dead");
          }
        }
      }

      if (changed) {
        this.notifySessionsChanged();
      }
    } catch (error) {
      console.warn("KernelService: Failed to sync sessions with server", error);
    }
  };

  /**
   * Normalize user-provided connection settings into a Jupyter API-ready shape.
   *
   * Accepts pasted UI URLs such as `/tree?...` or `/lab?...`, extracts token
   * from the URL query, strips UI route suffixes, and guarantees a trailing slash.
   */
  static normalizeConnectionConfig(
    rawBaseUrl: string,
    rawToken?: string
  ): NormalizedConnectionConfig {
    let baseUrl = rawBaseUrl.trim();
    let token = rawToken?.trim() || "";

    if (!/^[a-z][a-z\d+\-.]*:\/\//i.test(baseUrl)) {
      baseUrl = `http://${baseUrl}`;
    }

    try {
      const parsed = new URL(baseUrl);
      const urlToken = parsed.searchParams.get("token")?.trim();

      // If a token is embedded in the pasted URL, trust it over stale form values.
      if (urlToken) {
        token = urlToken;
      }

      // Normalize localhost → 127.0.0.1 to avoid IPv6 ambiguity on Windows,
      // where localhost can resolve to ::1 while the server listens on IPv4 only.
      if (parsed.hostname === "localhost") {
        parsed.hostname = "127.0.0.1";
      }

      parsed.search = "";
      parsed.hash = "";
      parsed.pathname = KernelService.normalizeBasePath(parsed.pathname);

      let normalizedBaseUrl = parsed.toString();
      if (!normalizedBaseUrl.endsWith("/")) {
        normalizedBaseUrl += "/";
      }

      return { baseUrl: normalizedBaseUrl, token };
    } catch {
      // Fallback for malformed URLs: keep backward-compatible behavior.
      if (baseUrl.includes("?token=")) {
        const tokenMatch = baseUrl.match(/[?&]token=([^&]+)/);
        if (tokenMatch?.[1]) {
          token = decodeURIComponent(tokenMatch[1]);
        }
      }

      const strippedBaseUrl = baseUrl.replace(/[?#].*$/, "").replace(/\/?$/, "/");
      return { baseUrl: strippedBaseUrl, token };
    }
  }

  // ==========================================================================
  // New public accessors (for BaseTool, KernelSidecar, etc.)
  // ==========================================================================

  /** Expose server settings so callers can make their own requests without hacks. */
  getServerSettings(): ServerConnection.ISettings {
    return this.serverSettings;
  }

  /** Expose the underlying kernel connection for the active session. */
  getKernelConnection(): Kernel.IKernelConnection | null {
    return this.getActiveEntry()?.connection.kernel ?? null;
  }

  /** Expose the session connection for the active session. */
  getSessionConnection(): Session.ISessionConnection | null {
    return this.getActiveEntry()?.connection ?? null;
  }

  /** Expose the contents manager for file I/O (replaces raw fetch in tools). */
  getContentsManager(): ContentsManager {
    return this.contentsManager;
  }

  /** Expose the kernel manager for kernel listing/management. */
  getKernelManager(): KernelManager {
    return this.kernelManager;
  }

  // ==========================================================================
  // Multi-Session Management
  // ==========================================================================

  /**
   * Switch the active session to the one associated with the given path.
   *
   * @returns true if a live session exists for the path and was activated
   */
  setActivePath(path: string): boolean {
    const entry = this.sessions.get(path);
    if (!entry?.connection.kernel || entry.connection.kernel.isDisposed) {
      return false;
    }

    const previousPath = this.activePath;
    this.activePath = path;
    this.attachStatusListener(entry.connection.kernel);
    this.updateStatus(entry.connection.kernel.status);
    if (previousPath !== path) {
      this.notifySessionsChanged();
    }
    return true;
  }

  /** Get the currently active notebook path. */
  getActivePath(): string | null {
    return this.activePath;
  }

  /**
   * Basename of the notebook file for the active kernel (e.g. `analysis.ipynb`),
   * or null when no session is active.
   */
  getActiveNotebookFileName(): string | null {
    const path = this.activePath;
    if (!path) return null;
    return this.getPathBasename(path);
  }

  /** Check whether a live session exists for the given notebook path. */
  hasSessionForPath(path: string): boolean {
    const entry = this.sessions.get(path);
    return !!entry?.connection.kernel && !entry.connection.kernel.isDisposed;
  }

  /**
   * Re-keys tracked notebook sessions after a file or folder was renamed on the server.
   * Keeps kernel connections aligned with the new paths so the UI does not start a duplicate kernel.
   */
  retargetPathsAfterRename(
    oldPath: string,
    newPath: string,
    itemType: "file" | "folder"
  ): void {
    const rekeys: Array<{ from: string; to: string }> = [];

    if (itemType === "file") {
      if (this.sessions.has(oldPath)) {
        rekeys.push({ from: oldPath, to: newPath });
      }
    } else {
      const prefix = `${oldPath}/`;
      for (const path of this.sessions.keys()) {
        if (path === oldPath) {
          rekeys.push({ from: path, to: newPath });
        } else if (path.startsWith(prefix)) {
          rekeys.push({ from: path, to: newPath + path.slice(oldPath.length) });
        }
      }
    }

    for (const { from, to } of rekeys) {
      const entry = this.sessions.get(from);
      if (!entry) continue;
      this.sessions.delete(from);
      this.sessions.set(to, entry);
      if (this.activePath === from) {
        this.activePath = to;
      }
    }

    if (rekeys.length > 0) {
      this.notifySessionsChanged();
    }
  }

  /**
   * Deactivate the current session so no notebook is targeted for execution.
   *
   * After this call `isReady()` returns false and `execute()` will throw
   * until a session is started or activated via `setActivePath()`.
   */
  clearActivePath(): void {
    const hadActive = this.activePath !== null;
    this.detachStatusListener();
    this.activePath = null;
    this.updateStatus("dead");
    if (hadActive) {
      this.notifySessionsChanged();
    }
  }

  /**
   * List all tracked sessions with their kernel info.
   *
   * Returns only sessions whose kernels are still alive.
   */
  listActiveSessions(): KernelSessionInfo[] {
    const result: KernelSessionInfo[] = [];
    for (const [path, entry] of this.sessions) {
      const kernel = entry.connection.kernel;
      if (kernel && !kernel.isDisposed) {
        result.push({
          path,
          kernelId: kernel.id,
          kernelName: kernel.name,
          status: kernel.status,
          isActive: path === this.activePath,
        });
      }
    }
    return result;
  }

  // ==========================================================================
  // Connection & Configuration
  // ==========================================================================

  /**
   * Fetch basic system information from the Jupyter server.
   *
   * Calls GET /api/sys_info (when present — e.g. some JupyterLab builds) and
   * GET /api (server version) in parallel. Standard Jupyter Server does not
   * document `/api/sys_info`; if it returns non-OK, we still return partial
   * info using the Jupyter version from GET /api and "unknown" for OS/Python.
   * Returns null only if GET /api also fails (no usable server metadata).
   */
  async fetchServerInfo(): Promise<JupyterServerInfo | null> {
    try {
      const base = this.serverSettings.baseUrl;
      // Keep /api usable even if /api/sys_info fails (404, CORS, proxy edge cases).
      const [sysInfoResult, apiResult] = await Promise.allSettled([
        ServerConnection.makeRequest(`${base}api/sys_info`, {}, this.serverSettings),
        ServerConnection.makeRequest(`${base}api`, {}, this.serverSettings),
      ]);

      const sysInfoRes = sysInfoResult.status === "fulfilled" ? sysInfoResult.value : null;
      const apiRes = apiResult.status === "fulfilled" ? apiResult.value : null;

      let jupyterVersion = "unknown";
      if (apiRes?.ok) {
        try {
          const apiData = (await apiRes.json()) as Record<string, unknown>;
          const versionCandidate =
            apiData.version ??
            apiData.server_version ??
            apiData.jupyter_server_version;
          if (typeof versionCandidate === "string" && versionCandidate.trim()) {
            jupyterVersion = versionCandidate.trim();
          } else if (typeof versionCandidate === "number") {
            jupyterVersion = String(versionCandidate);
          }
        } catch (error) {
          console.warn("fetchServerInfo: Failed to parse GET /api response JSON:", error);
        }
      }

      if (sysInfoRes?.ok) {
        try {
          const sysInfo = (await sysInfoRes.json()) as Record<string, unknown>;
          const pythonVersionValue =
            typeof sysInfo.pyversion === "string"
              ? sysInfo.pyversion
              : typeof sysInfo.python_version === "string"
                ? sysInfo.python_version
                : typeof sysInfo.pythonVersion === "string"
                  ? sysInfo.pythonVersion
                  : "unknown";
          return {
            os: typeof sysInfo.os === "string" ? sysInfo.os : "unknown",
            platform: typeof sysInfo.platform === "string" ? sysInfo.platform : "unknown",
            pythonVersion: pythonVersionValue,
            jupyterVersion,
          };
        } catch (error) {
          console.warn("fetchServerInfo: Failed to parse /api/sys_info response JSON:", error);
        }
      }

      if (!apiRes?.ok) {
        console.warn(
          "fetchServerInfo: /api/sys_info returned",
          sysInfoRes?.status ?? "request failed",
          "and GET /api returned",
          apiRes?.status ?? "request failed"
        );
        return null;
      }

      console.warn(
        "fetchServerInfo: /api/sys_info returned",
        sysInfoRes?.status ?? "request failed",
        "(not available on this server — OS/Python left unknown). Jupyter version from GET /api:",
        jupyterVersion
      );
      return {
        os: "unknown",
        platform: "unknown",
        pythonVersion: "unknown",
        jupyterVersion,
      };
    } catch (error) {
      console.warn("fetchServerInfo failed:", error);
      return null;
    }
  }

  /**
   * Test connection to Jupyter server
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log("Testing connection to Jupyter server...");
      await this.kernelSpecManager.ready;
      await this.kernelSpecManager.refreshSpecs();
      const specs = this.kernelSpecManager.specs;
      console.log(
        "Connection test successful, available kernelspecs:",
        specs ? Object.keys(specs.kernelspecs) : []
      );
      return true;
    } catch (error) {
      console.error("Connection test failed:", error);
      console.error("Jupyter server configuration:");
      console.error("- Base URL:", this.serverSettings.baseUrl);
      console.error("- Token configured:", !!this.serverSettings.token);
      return false;
    }
  }

  /**
   * Validate configuration and provide helpful guidance
   */
  validateConfiguration(): {
    isValid: boolean;
    issues: string[];
    suggestions: string[];
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];

    if (!this.serverSettings.baseUrl) {
      issues.push("No base URL configured");
      suggestions.push(
        "Set NEXT_PUBLIC_JUPYTER_URL environment variable or pass baseUrl option"
      );
    } else {
      try {
        new URL(this.serverSettings.baseUrl);
      } catch {
        issues.push("Invalid base URL format");
        suggestions.push(
          "Ensure base URL is a valid URL (e.g., http://localhost:8888)"
        );
      }
    }

    if (!this.serverSettings.token) {
      suggestions.push(
        "No token configured. This is fine for unsecured local servers; provide token if your server requires authentication."
      );
    }

    if (issues.length > 0) {
      suggestions.push(
        "Ensure Jupyter server is running with: jupyter lab --allow-origin='*' --ip=0.0.0.0"
      );
      suggestions.push("Check that the server allows CORS requests");
    }

    return { isValid: issues.length === 0, issues, suggestions };
  }

  // ==========================================================================
  // Kernel Specs & Running Kernels
  // ==========================================================================

  /**
   * Get available kernel specs
   */
  async getAvailableKernels() {
    try {
      await this.kernelSpecManager.ready;
      await this.kernelSpecManager.refreshSpecs();
      const specs = this.kernelSpecManager.specs;
      if (!specs) return [];

      return Object.entries(specs.kernelspecs).map(([name, spec]) => ({
        name,
        displayName: spec?.display_name ?? name,
        language: spec?.language ?? "unknown",
        spec,
      }));
    } catch (error) {
      console.error("Error fetching kernel specs:", error);
      return [];
    }
  }

  /**
   * Get running kernels
   */
  async getRunningKernels(): Promise<KernelModel[]> {
    try {
      await this.sessionManager.ready;
      await this.sessionManager.refreshRunning();

      const kernelsById = new Map<string, KernelModel>();
      for (const sessionModel of this.sessionManager.running()) {
        const kernelModel = sessionModel.kernel;
        if (!kernelModel) {
          continue;
        }

        kernelsById.set(kernelModel.id, {
          id: kernelModel.id,
          name: kernelModel.name,
          last_activity: kernelModel.last_activity,
          execution_state: kernelModel.execution_state,
          connections: kernelModel.connections,
        });
      }

      return Array.from(kernelsById.values());
    } catch (error) {
      console.error("Error fetching running kernels:", error);
      return [];
    }
  }

  /**
   * Get running kernels with sidebar-ready metadata.
   *
   * Uses the same inclusion semantics as getRunningKernels/list-kernels:
   * session-backed kernels from SessionManager.running(), deduplicated by
   * kernel ID.
   */
  async getRunningKernelsForSidebar(): Promise<RunningKernelSidebarInfo[]> {
    try {
      await this.sessionManager.ready;
      await this.sessionManager.refreshRunning();

      const availableKernels = await this.getAvailableKernels();
      const specsByName = new Map(
        availableKernels.map((kernelSpec) => [kernelSpec.name, kernelSpec])
      );
      const activeKernelId = this.getActiveEntry()?.connection.kernel?.id ?? null;

      const kernelsById = new Map<string, RunningKernelSidebarInfo>();
      for (const sessionModel of this.sessionManager.running()) {
        const kernelModel = sessionModel.kernel;
        if (!kernelModel) {
          continue;
        }

        const kernelName = kernelModel.name || "unknown";
        const spec = specsByName.get(kernelName);
        const sessionPath = sessionModel.path || "unknown";

        kernelsById.set(kernelModel.id, {
          kernelId: kernelModel.id || "unknown",
          kernelName,
          displayName: spec?.displayName || kernelName,
          language: spec?.language || "unknown",
          state: kernelModel.execution_state || "unknown",
          connections:
            kernelModel.connections != null
              ? String(kernelModel.connections)
              : "unknown",
          lastActivity: this.formatKernelLastActivity(kernelModel.last_activity),
          sessionPath,
          fileName: this.getPathBasename(sessionPath),
          isActive: activeKernelId === kernelModel.id,
        });
      }

      return Array.from(kernelsById.values());
    } catch (error) {
      console.error("Error fetching running kernels for sidebar:", error);
      return [];
    }
  }

  // ==========================================================================
  // Kernel Lifecycle
  // ==========================================================================

  /**
   * Start a new kernel for the given notebook path.
   *
   * If a live session already exists for the path with the same kernel spec,
   * it is reused (no duplicate kernels). Otherwise a new session is created.
   * Other notebooks' sessions are left untouched.
   */
  async startKernel(spec = "python3", path?: string): Promise<KernelModel> {
    this.assertNotDisposed();
    const sessionPath = path || "notebook.ipynb";

    try {
      // Reuse an existing live session for the same path + spec
      const existing = this.sessions.get(sessionPath);
      if (existing?.connection.kernel && !existing.connection.kernel.isDisposed) {
        if (existing.connection.kernel.name === spec) {
          const previousPath = this.activePath;
          this.activePath = sessionPath;
          this.attachStatusListener(existing.connection.kernel);
          this.updateStatus(existing.connection.kernel.status);
          if (previousPath !== sessionPath) {
            this.notifySessionsChanged();
          }
          return this.toKernelModel(existing.connection.kernel);
        }

        // Different spec requested — shut down the old session for this path
        if (existing.owned) {
          await existing.connection.shutdown();
        } else {
          existing.connection.dispose();
        }
        this.sessions.delete(sessionPath);
      } else if (existing) {
        // Stale entry — clean up
        existing.connection.dispose();
        this.sessions.delete(sessionPath);
      }

      const sessionConnection = await this.sessionManager.startNew({
        path: sessionPath,
        type: "notebook",
        name: "Notebook",
        kernel: { name: spec },
      });

      const kernel = sessionConnection.kernel;
      if (!kernel) {
        sessionConnection.dispose();
        throw new Error("Failed to start kernel");
      }

      this.sessions.set(sessionPath, { connection: sessionConnection, owned: true });
      this.activePath = sessionPath;
      this.attachStatusListener(kernel);
      this.updateStatus(kernel.status);
      this.notifySessionsChanged();

      return this.toKernelModel(kernel);
    } catch (error) {
      console.error("Error starting kernel:", error);
      throw error;
    }
  }

  /**
   * Connect to an existing kernel by ID.
   *
   * Finds the server-side session that owns this kernel and stores it
   * under the session's notebook path. Other sessions are left untouched.
   */
  async connectToKernel(kernelId: string): Promise<KernelModel> {
    this.assertNotDisposed();
    try {
      await this.sessionManager.ready;
      await this.sessionManager.refreshRunning();
      const matchingSessionModel = Array.from(this.sessionManager.running()).find(
        (sessionModel) => sessionModel.kernel?.id === kernelId
      );

      if (!matchingSessionModel) {
        await this.kernelManager.ready;
        const existingKernel = await this.kernelManager.findById(kernelId);
        if (existingKernel) {
          throw new Error(
            `Kernel ${kernelId} exists but has no associated session. Connect to a notebook/console session instead.`
          );
        }
        throw new Error(`Kernel ${kernelId} not found`);
      }

      const sessionPath = matchingSessionModel.path;

      // If we already track this session, just activate it
      const existing = this.sessions.get(sessionPath);
      if (existing?.connection.kernel?.id === kernelId &&
        !existing.connection.kernel.isDisposed) {
        const previousPath = this.activePath;
        this.activePath = sessionPath;
        this.attachStatusListener(existing.connection.kernel);
        this.updateStatus(existing.connection.kernel.status);
        if (previousPath !== sessionPath) {
          this.notifySessionsChanged();
        }
        return this.toKernelModel(existing.connection.kernel);
      }

      const connection = this.sessionManager.connectTo({
        model: matchingSessionModel,
      });

      const kernel = connection.kernel;
      if (!kernel) {
        throw new Error(`Failed to connect to kernel: Kernel ${kernelId} not found`);
      }

      this.sessions.set(sessionPath, { connection, owned: false });
      this.activePath = sessionPath;
      this.attachStatusListener(kernel);
      this.updateStatus(kernel.status);
      this.notifySessionsChanged();

      return this.toKernelModel(kernel);
    } catch (error) {
      console.error(`Error connecting to kernel ${kernelId}:`, error);
      throw error;
    }
  }

  /**
   * Execute code in the active session's kernel.
   */
  async execute(
    code: string,
    onMsg?: (msg: any) => void,
    options: KernelExecuteOptions = {},
  ): Promise<ExecutionFuture> {
    this.assertNotDisposed();
    const entry = this.getActiveEntry();
    const kernel = entry?.connection.kernel;

    if (!kernel) {
      throw new Error("No active kernel session. Please start or select a kernel.");
    }

    if (kernel.isDisposed || kernel.status === "dead") {
      throw new Error(
        `Kernel is no longer active (status: ${kernel.status}). ` +
        `The kernel may have been stopped externally. Please start a new kernel.`
      );
    }

    const future = kernel.requestExecute({
      code,
      silent: options.silent ?? false,
      store_history: options.storeHistory ?? true,
    });

    if (onMsg) {
      future.onIOPub = (msg) => {
        onMsg(msg);
      };
      future.onReply = (msg) => {
        onMsg(msg);
      };
      future.onStdin = (msg) => {
        onMsg(msg);
      };
    }

    const done = future.done.then(() => { });
    return { done };
  }

  /**
   * Interrupt the active session's kernel.
   */
  async interrupt(): Promise<void> {
    this.assertNotDisposed();
    const kernel = this.getActiveEntry()?.connection.kernel;
    if (!kernel) {
      throw new Error("No active kernel session");
    }

    if (kernel.isDisposed || kernel.status === "dead") {
      throw new Error("Kernel is no longer active and cannot be interrupted");
    }

    try {
      await kernel.interrupt();
    } catch (error) {
      console.error("Error interrupting kernel:", error);
      throw error;
    }
  }

  /**
   * Restart the active session's kernel.
   */
  async restart(): Promise<KernelModel> {
    this.assertNotDisposed();
    const kernel = this.getActiveEntry()?.connection.kernel;
    if (!kernel) {
      throw new Error("No active kernel session");
    }

    if (kernel.isDisposed || kernel.status === "dead") {
      throw new Error("Kernel is no longer active and cannot be restarted");
    }

    try {
      await kernel.restart();
      this.updateStatus("idle");
      return this.toKernelModel(kernel);
    } catch (error) {
      console.error("Error restarting kernel:", error);
      throw error;
    }
  }

  /**
   * Shut down any running kernel by ID.
   *
   * Finds all local sessions that use this kernel and shuts them down,
   * then tells the server to delete the kernel. If the shut-down kernel
   * belonged to the active session, another session is activated (if
   * available) or the status resets to "unknown".
   */
  async shutdownKernelById(kernelId: string): Promise<void> {
    this.assertNotDisposed();

    // Find and shut down all local sessions backed by this kernel.
    const affectedPaths: string[] = [];
    for (const [path, entry] of Array.from(this.sessions.entries())) {
      if (entry.connection.kernel?.id === kernelId) {
        affectedPaths.push(path);
      }
    }

    for (const path of affectedPaths) {
      await this.shutdownSession(path);
    }

    // If no local session owned this kernel, shut it down directly via KernelManager.
    if (affectedPaths.length === 0) {
      await this.kernelManager.ready;
      const model = await this.kernelManager.findById(kernelId);
      if (!model) {
        throw new Error(`Kernel ${kernelId} not found`);
      }
      const kernelConnection = this.kernelManager.connectTo({ model });
      try {
        await kernelConnection.shutdown();
      } finally {
        kernelConnection.dispose();
      }
    }
  }

  /**
   * Restart any running kernel by ID using KernelManager APIs.
   */
  async restartKernelById(kernelId: string): Promise<KernelModel> {
    this.assertNotDisposed();
    await this.kernelManager.ready;
    const model = await this.kernelManager.findById(kernelId);
    if (!model) {
      throw new Error(`Kernel ${kernelId} not found`);
    }

    const kernelConnection = this.kernelManager.connectTo({ model });
    try {
      await kernelConnection.restart();
      // Update status if this kernel belongs to the active session
      const activeKernel = this.getActiveEntry()?.connection.kernel;
      if (activeKernel?.id === kernelId) {
        this.updateStatus(activeKernel.status);
      }
      return this.toKernelModel(kernelConnection);
    } finally {
      kernelConnection.dispose();
    }
  }

  /**
   * Shutdown the active session's kernel and remove it from the map.
   *
   * Other notebooks' sessions are left untouched. If additional sessions
   * remain, the most recently added one becomes active.
   */
  async shutdown(): Promise<void> {
    try {
      this.detachStatusListener();

      if (this.activePath) {
        const entry = this.sessions.get(this.activePath);
        this.sessions.delete(this.activePath);

        if (entry) {
          if (entry.owned) {
            await entry.connection.shutdown();
          } else {
            entry.connection.dispose();
          }
        }

        // Activate another session if one is available
        this.activateNextSession();
        this.notifySessionsChanged();
      }
    } catch (error) {
      console.error("Error shutting down kernel:", error);
      throw error;
    }
  }

  /**
   * Shut down the session for a specific notebook path.
   *
   * If the shut-down session was the active one, another session is
   * activated (if available) or the status resets to "unknown".
   */
  async shutdownSession(path: string): Promise<void> {
    const entry = this.sessions.get(path);
    if (!entry) return;

    this.sessions.delete(path);

    try {
      if (entry.owned) {
        await entry.connection.shutdown();
      } else {
        entry.connection.dispose();
      }
    } catch (error) {
      console.warn("KernelService: Failed to shut down session for", path, error);
      entry.connection.dispose();
    }

    if (this.activePath === path) {
      this.detachStatusListener();
      this.activateNextSession();
    }

    this.notifySessionsChanged();
  }

  // ==========================================================================
  // Terminal Management
  // ==========================================================================

  /**
   * Create a new terminal session on the Jupyter server.
   *
   * @param cwd - Optional working directory for the terminal (relative to Jupyter root).
   * @returns The unique terminal name assigned by the server.
   */
  async startTerminal(cwd?: string): Promise<string> {
    this.assertNotDisposed();
    await this.terminalManager.ready;

    const connection = await this.terminalManager.startNew(cwd ? { cwd } : undefined);
    const name = connection.name;

    this.terminalConnections.set(name, connection);
    this.terminalBuffers.set(name, []);

    connection.messageReceived.connect((_sender, msg) => {
      if (msg.type === "stdout" && msg.content) {
        const buffer = this.terminalBuffers.get(name);
        if (buffer) {
          for (const chunk of msg.content) {
            buffer.push(String(chunk));
          }
        }
      }

      if (msg.type === "disconnect") {
        this.terminalConnections.delete(name);
        this.terminalBuffers.delete(name);
        this.notifyTerminalsChanged();
      }
    });

    this.notifyTerminalsChanged();
    return name;
  }

  /**
   * Send text input to a running terminal.
   *
   * @param name - Terminal name as returned by startTerminal.
   * @param text - Text to send (include '\r' to submit a command, e.g. "ls -la\r").
   */
  sendToTerminal(name: string, text: string): void {
    this.assertNotDisposed();
    const connection = this.terminalConnections.get(name);
    if (!connection) {
      throw new Error(`Terminal "${name}" not found`);
    }
    connection.send({ type: "stdin", content: [text] });
  }

  /**
   * Read and flush the pending output buffer for a terminal.
   *
   * @param name - Terminal name as returned by startTerminal.
   * @returns Buffered stdout output since the last read, then clears the buffer.
   */
  readTerminalBuffer(name: string): string {
    this.assertNotDisposed();
    const buffer = this.terminalBuffers.get(name);
    if (buffer === undefined) {
      throw new Error(`Terminal "${name}" not found`);
    }
    const raw = buffer.join("");
    buffer.length = 0;
    return stripTerminalOutput(raw);
  }

  /**
   * Shut down a terminal session and remove it from tracking.
   *
   * @param name - Terminal name as returned by startTerminal.
   */
  async closeTerminal(name: string): Promise<void> {
    this.assertNotDisposed();
    const connection = this.terminalConnections.get(name);
    if (!connection) {
      throw new Error(`Terminal "${name}" not found`);
    }

    this.terminalConnections.delete(name);
    this.terminalBuffers.delete(name);

    try {
      await connection.shutdown();
    } catch (error) {
      console.warn(`KernelService: Failed to shut down terminal "${name}":`, error);
      connection.dispose();
    }

    this.notifyTerminalsChanged();
  }

  /**
   * Refresh terminal list from the Jupyter server and reconcile local tracking.
   *
   * Detects terminals created outside this app (for example from JupyterLab UI),
   * creates live connections for newly discovered terminals, and removes stale
   * local references for terminals that no longer exist on the server.
   *
   * @returns Current terminal names reported by the server after refresh.
   */
  async refreshTerminalsFromServer(): Promise<string[]> {
    this.assertNotDisposed();
    await this.terminalManager.ready;
    await this.terminalManager.refreshRunning();

    const runningModels = Array.from(this.terminalManager.running());
    const runningNames = new Set(runningModels.map((model) => model.name));
    let changed = false;

    // Remove local connections that no longer exist on the server.
    for (const [name, connection] of Array.from(this.terminalConnections.entries())) {
      if (!runningNames.has(name) || connection.isDisposed) {
        connection.dispose();
        this.terminalConnections.delete(name);
        this.terminalBuffers.delete(name);
        changed = true;
      }
    }

    // Create local connections for terminals discovered on the server.
    for (const model of runningModels) {
      const existing = this.terminalConnections.get(model.name);
      if (existing && !existing.isDisposed) {
        continue;
      }

      const shouldBufferOutput = this.terminalBuffers.has(model.name);
      const connection = this.terminalManager.connectTo({ model });
      this.terminalConnections.set(model.name, connection);

      connection.messageReceived.connect((_sender, msg) => {
        if (shouldBufferOutput && msg.type === "stdout" && msg.content) {
          const buffer = this.terminalBuffers.get(model.name);
          if (buffer) {
            for (const chunk of msg.content) {
              buffer.push(String(chunk));
            }
          }
        }

        if (msg.type === "disconnect") {
          this.terminalConnections.delete(model.name);
          this.terminalBuffers.delete(model.name);
          this.notifyTerminalsChanged();
        }
      });

      changed = true;
    }

    if (changed) {
      this.notifyTerminalsChanged();
    }

    return Array.from(runningNames);
  }

  /**
   * List all currently tracked terminal names.
   */
  listTerminals(): string[] {
    return Array.from(this.terminalConnections.keys());
  }

  /**
   * Get the raw terminal connection for a given terminal name.
   *
   * Useful for binding xterm.js directly to the terminal's messageReceived signal.
   */
  getTerminalConnection(name: string): Terminal.ITerminalConnection | undefined {
    return this.terminalConnections.get(name);
  }

  /**
   * Create a new terminal without output buffering.
   *
   * For UI-created terminals where xterm.js handles all rendering directly.
   * The terminal is still tracked in the connections map so closeTerminal()
   * and listTerminals() work.
   *
   * @param cwd - Optional working directory for the terminal (relative to Jupyter root).
   * @returns The terminal connection (name + send/messageReceived).
   */
  async startTerminalRaw(cwd?: string): Promise<Terminal.ITerminalConnection> {
    this.assertNotDisposed();
    await this.terminalManager.ready;

    const connection = await this.terminalManager.startNew(cwd ? { cwd } : undefined);
    this.terminalConnections.set(connection.name, connection);

    connection.messageReceived.connect((_sender, msg) => {
      if (msg.type === "disconnect") {
        this.terminalConnections.delete(connection.name);
        this.notifyTerminalsChanged();
      }
    });

    this.notifyTerminalsChanged();
    return connection;
  }

  /**
   * Subscribe to terminal list changes (terminals added/removed).
   *
   * @returns An unsubscribe function.
   */
  onTerminalsChanged(callback: () => void): () => void {
    this.terminalsChangedCallbacks.add(callback);
    return () => {
      this.terminalsChangedCallbacks.delete(callback);
    };
  }

  /**
   * Dispose ALL sessions and Jupyter service managers.
   *
   * Use when replacing a KernelService instance (for example after failed
   * auto-connect attempts) to prevent stale unauthorized API polling.
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.detachStatusListener();

    // Disconnect from server session changes
    this.sessionManager.runningChanged.disconnect(this.handleServerSessionsChanged, this);

    for (const [, entry] of this.sessions) {
      entry.connection.dispose();
    }
    this.sessions.clear();
    this.activePath = null;

    for (const connection of this.terminalConnections.values()) {
      connection.dispose();
    }
    this.terminalConnections.clear();
    this.terminalBuffers.clear();

    this.kernelSpecManager.dispose();
    this.sessionManager.dispose();
    this.kernelManager.dispose();
    this.contentsManager.dispose();
    this.terminalManager.dispose();
    this.currentStatus = "unknown";
    this.disposed = true;
  }

  // ==========================================================================
  // Status & Info
  // ==========================================================================

  /**
   * Get kernel status
   */
  getStatus(): string {
    return this.currentStatus;
  }

  /**
   * Get kernel info for the active session.
   */
  getInfo() {
    const kernel = this.getActiveEntry()?.connection.kernel;
    if (!kernel) return null;

    return {
      id: kernel.id,
      name: kernel.name,
      status: this.currentStatus,
      info: this.toKernelModel(kernel),
    };
  }

  /**
   * Subscribe to kernel status changes
   */
  onStatusChanged(callback: (status: string) => void) {
    this.statusCallbacks.add(callback);
    return () => {
      this.statusCallbacks.delete(callback);
    };
  }

  /**
   * Subscribe to session map changes (sessions added/removed/died).
   *
   * Useful for updating UI that shows the list of running kernels.
   */
  onSessionsChanged(callback: () => void) {
    this.sessionsChangedCallbacks.add(callback);
    return () => {
      this.sessionsChangedCallbacks.delete(callback);
    };
  }

  /**
   * Check if kernel is ready
   */
  isReady(): boolean {
    return this.currentStatus === "idle";
  }

  /**
   * Get the current kernel model for the active session.
   */
  getKernel(): KernelModel | null {
    const kernel = this.getActiveEntry()?.connection.kernel;
    if (!kernel) return null;
    return this.toKernelModel(kernel);
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private toKernelModel(kernel: Kernel.IKernelConnection): KernelModel {
    return {
      id: kernel.id,
      name: kernel.name,
      execution_state: kernel.status,
    };
  }

  /**
   * Convert Jupyter last_activity to YYYY-MM-DD HH:mm:ss in UTC.
   */
  private formatKernelLastActivity(lastActivity?: string): string {
    if (!lastActivity) return "unknown";

    try {
      const dt = new Date(lastActivity);
      return dt.toISOString().replace("T", " ").substring(0, 19);
    } catch {
      return String(lastActivity);
    }
  }

  /**
   * Extract the basename from a Jupyter path for compact sidebar display.
   */
  private getPathBasename(path: string): string {
    if (!path) {
      return "unknown";
    }
    const segments = path.split("/").filter(Boolean);
    return segments[segments.length - 1] || path;
  }

  private attachStatusListener(kernel: Kernel.IKernelConnection): void {
    if (this.statusListenerKernel === kernel) {
      return;
    }
    this.detachStatusListener();
    kernel.statusChanged.connect(this.handleStatusChanged, this);
    this.statusListenerKernel = kernel;
  }

  private detachStatusListener(): void {
    if (this.statusListenerKernel) {
      this.statusListenerKernel.statusChanged.disconnect(this.handleStatusChanged, this);
      this.statusListenerKernel = null;
    }
  }

  private handleStatusChanged = (
    _sender: Kernel.IKernelConnection,
    status: Kernel.Status
  ): void => {
    this.updateStatus(status);
  };

  private updateStatus(status: string): void {
    this.currentStatus = status;
    this.statusCallbacks.forEach((callback) => callback(status));
  }

  /** Notify all sessions-changed callbacks. */
  private notifySessionsChanged(): void {
    this.sessionsChangedCallbacks.forEach((callback) => callback());
  }

  /** Notify all terminals-changed callbacks. */
  private notifyTerminalsChanged(): void {
    this.terminalsChangedCallbacks.forEach((callback) => callback());
  }

  /** Look up the SessionEntry for the currently active notebook path. */
  private getActiveEntry(): SessionEntry | null {
    if (!this.activePath) return null;
    return this.sessions.get(this.activePath) ?? null;
  }

  /** Switch to the first remaining session, or reset to "unknown" if none left. */
  private activateNextSession(): void {
    const first = this.sessions.entries().next();
    if (!first.done) {
      const [nextPath, nextEntry] = first.value;
      this.activePath = nextPath;
      if (nextEntry.connection.kernel) {
        this.attachStatusListener(nextEntry.connection.kernel);
        this.updateStatus(nextEntry.connection.kernel.status);
      }
    } else {
      this.activePath = null;
      this.updateStatus("unknown");
    }
  }

  /**
   * Guard against use-after-dispose.
   */
  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error("KernelService has been disposed");
    }
  }

  /**
   * Remove UI-specific URL path segments to reach the Jupyter API base path.
   */
  private static normalizeBasePath(pathname: string): string {
    const segments = pathname.split("/").filter(Boolean);

    const uiSegmentIndex = segments.findIndex((segment) =>
      KernelService.UI_ROUTE_SEGMENTS.has(segment.toLowerCase())
    );

    const baseSegments =
      uiSegmentIndex >= 0 ? segments.slice(0, uiSegmentIndex) : segments;

    return baseSegments.length > 0 ? `/${baseSegments.join("/")}/` : "/";
  }
}
