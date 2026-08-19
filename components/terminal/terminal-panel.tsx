"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, X, TerminalSquare, ChevronDown, RefreshCw } from "lucide-react";
import {
  scheduleAfterMinDuration,
  MIN_REFRESH_SPIN_MS,
} from "@/lib/utils";
import type { Terminal as JupyterTerminal } from "@jupyterlab/services";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { NoKernelPrompt } from "@/components/common/no-kernel-prompt";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { XTermTerminal } from "./xterm-terminal";
import type { KernelService } from "@/lib/kernel/kernel-service";
import { useJupyterShellReady } from "@/hooks/use-jupyter-shell-ready";
import { useOrionSettings } from "@/hooks/use-orion-settings";
import { useAssistantChatOptional } from "@/lib/agent/assistant-provider";
import { resolveUserTerminalCwd } from "@/lib/shell/user-terminal-cwd";
import { TerminalType } from "@/lib/shell/types";

interface TerminalInfo {
  name: string;
  createdBy: "user" | "agent";
  connection: JupyterTerminal.ITerminalConnection;
}

/** Matches the floating editor toolbar shell (squircle, border, shadow-md). */
const TERMINAL_PANEL_SHELL =
  "flex h-full w-full min-w-0 flex-col bg-sidebar pb-2 pt-0";
const TERMINAL_PANEL_CARD =
  "corner-squircle mx-1 flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-md border bg-background shadow-md";

export interface TerminalPanelProps {
  /** The kernel service instance — null means no server configured. */
  kernelService: KernelService | null;
  /** Callback to open the kernel connection dropdown. */
  onOpenKernelDropdown: () => void;
  /** Jupyter-relative workspace path used when new user terminals start in the workspace. */
  workspaceDirectory?: string | null;
}

/**
 * Bottom panel that provides a tabbed terminal UI backed by Jupyter terminals.
 *
 * Terminals are independent of the notebook kernel session. They only require
 * a reachable Jupyter server (via kernelService). Switching notebook files or
 * changing kernel status does NOT affect running terminals.
 */
export function TerminalPanel({
  kernelService,
  onOpenKernelDropdown,
  workspaceDirectory = null,
}: TerminalPanelProps) {
  const assistantCtx = useAssistantChatOptional();
  const pool = assistantCtx?.terminalPool ?? null;
  const { effectiveSettings } = useOrionSettings();
  const userTerminalCwd = resolveUserTerminalCwd({
    preference: effectiveSettings.shell.userTerminalWorkingDirectory,
    workspaceDirectory,
  });

  const [terminals, setTerminals] = useState<TerminalInfo[]>([]);
  const [activeTerminalName, setActiveTerminalName] = useState<string | null>(null);
  const [isAgentDropdownOpen, setIsAgentDropdownOpen] = useState(false);
  const [isReloadingTerminals, setIsReloadingTerminals] = useState(false);
  const { serverAvailable: jupyterShellReady } = useJupyterShellReady(kernelService);
  const prevServiceRef = useRef<KernelService | null>(null);

  /**
   * Reconcile panel state with terminals currently tracked by KernelService.
   *
   * Only used when no TerminalPool is available. When the pool is present,
   * pool.onStateChanged drives terminal state instead.
   *
   * Unknown terminals are treated as agent-created by default. User-created
   * labels are preserved when already known in local state.
   */
  const syncTerminalsFromService = useCallback(() => {
    if (!kernelService) {
      setTerminals([]);
      setActiveTerminalName(null);
      return;
    }

    const serverNames = new Set(kernelService.listTerminals());

    setTerminals((prev) => {
      const previousByName = new Map(prev.map((terminal) => [terminal.name, terminal]));
      const updated: TerminalInfo[] = [];

      for (const name of serverNames) {
        const existing = previousByName.get(name);
        const connection = kernelService.getTerminalConnection(name) || existing?.connection;
        if (!connection) continue;

        updated.push({
          name,
          createdBy: existing?.createdBy ?? "agent",
          connection,
        });
      }

      setActiveTerminalName((current) => {
        if (updated.length === 0) return null;
        if (current && updated.some((terminal) => terminal.name === current)) {
          return current;
        }
        return updated[0].name;
      });

      return updated;
    });
  }, [kernelService]);

  /**
   * Force refresh terminal state from the Jupyter server.
   *
   * When a pool is available, delegates to pool.syncFromServer() which
   * reconciles pool metadata as well as the server-side terminal list.
   * Falls back to direct KernelService refresh otherwise.
   */
  const handleReloadTerminals = useCallback(async () => {
    if (!kernelService) return;
    setIsReloadingTerminals(true);
    const start = Date.now();
    try {
      if (pool) {
        await pool.syncFromServer();
        // Pool's onStateChanged will update terminal state via the subscription below
      } else {
        await kernelService.refreshTerminalsFromServer();
        syncTerminalsFromService();
      }
    } catch (error) {
      console.error("Failed to refresh terminals from server:", error);
    } finally {
      scheduleAfterMinDuration(start, MIN_REFRESH_SPIN_MS, () =>
        setIsReloadingTerminals(false)
      );
    }
  }, [kernelService, pool, syncTerminalsFromService]);

  // Clear terminals when kernelService is missing or the instance is replaced (reconnect).
  useEffect(() => {
    if (!kernelService) {
      setTerminals([]);
      setActiveTerminalName(null);
      prevServiceRef.current = null;
      return;
    }

    if (prevServiceRef.current && prevServiceRef.current !== kernelService) {
      setTerminals([]);
      setActiveTerminalName(null);
    }
    prevServiceRef.current = kernelService;
  }, [kernelService]);

  // When a pool is available, subscribe to pool state changes instead of
  // KernelService terminal events. The pool already listens to KernelService
  // internally and enriches each terminal with type metadata.
  useEffect(() => {
    if (!pool) return;

    const syncFromPool = () => {
      const { terminals: poolTerminals } = pool.getState();
      const visible = poolTerminals
        .map((t): TerminalInfo => ({
          name: t.name,
          createdBy: t.type === TerminalType.User ? "user" : "agent",
          connection: t.connection,
        }));

      setTerminals(visible);
      setActiveTerminalName((current) => {
        if (visible.length === 0) return null;
        if (current && visible.some((t) => t.name === current)) return current;
        return visible[0].name;
      });
    };

    syncFromPool();
    return pool.onStateChanged(syncFromPool);
  }, [pool]);

  // When no pool is available, fall back to direct KernelService subscription.
  useEffect(() => {
    if (!kernelService || pool) return;

    void handleReloadTerminals();
    const unsubscribe = kernelService.onTerminalsChanged(syncTerminalsFromService);

    return unsubscribe;
  }, [kernelService, pool, syncTerminalsFromService, handleReloadTerminals]);

  /** Create a new user terminal (no output buffering). */
  const handleCreateTerminal = useCallback(async () => {
    if (!kernelService) return;
    try {
      if (pool) {
        // Pool registers the terminal as User type and fires onStateChanged,
        // which updates panel state via the pool subscription above.
        const terminal = await pool.createUserTerminal(userTerminalCwd);
        setActiveTerminalName(terminal.name);
        return;
      }

      const connection = await kernelService.startTerminalRaw(userTerminalCwd);
      setTerminals((prev) => {
        const existingIndex = prev.findIndex((terminal) => terminal.name === connection.name);
        if (existingIndex === -1) {
          return [
            ...prev,
            { name: connection.name, createdBy: "user", connection },
          ];
        }

        // Terminal may already be present from onTerminalsChanged callback.
        return prev.map((terminal) =>
          terminal.name === connection.name
            ? { ...terminal, createdBy: "user", connection }
            : terminal
        );
      });
      setActiveTerminalName(connection.name);
    } catch (error) {
      console.error("Failed to create terminal:", error);
    }
  }, [kernelService, pool, userTerminalCwd]);

  /**
   * Stable ref holding the latest send-to-terminal implementation.
   * Registered once so the window event listener is not torn down on every render.
   */
  const sendToTerminalRef = useRef<
    (code: string, preLaunch?: string) => Promise<void>
  >(async () => { });

  // Keep the ref up-to-date with current state/callbacks on every render
  sendToTerminalRef.current = async (code: string, preLaunch?: string) => {
    if (!kernelService) return;

    let connection: JupyterTerminal.ITerminalConnection | undefined;
    let isNew = false;

    const activeTerminal = terminals.find((t) => t.name === activeTerminalName);

    if (activeTerminal) {
      connection = activeTerminal.connection;
    } else {
      // No active terminal — create a new user one
      isNew = true;
      try {
        if (pool) {
          const terminal = await pool.createUserTerminal(userTerminalCwd);
          connection = terminal.connection;
          setActiveTerminalName(terminal.name);
          // Pool's onStateChanged fires and updates the terminals list
        } else {
          connection = await kernelService.startTerminalRaw(userTerminalCwd);
          setTerminals((prev) => {
            const existingIndex = prev.findIndex(
              (t) => t.name === connection!.name
            );
            if (existingIndex === -1) {
              return [
                ...prev,
                { name: connection!.name, createdBy: "user", connection: connection! },
              ];
            }
            return prev.map((t) =>
              t.name === connection!.name
                ? { ...t, createdBy: "user", connection: connection! }
                : t
            );
          });
          setActiveTerminalName(connection.name);
        }
      } catch (error) {
        console.error("Failed to create terminal for run-in-terminal:", error);
        return;
      }
    }

    if (!connection) return;

    if (isNew) {
      // Give the shell a moment to initialise before sending input
      await new Promise<void>((r) => setTimeout(r, 600));
    }

    if (isNew && preLaunch) {
      // Start the REPL (R / python) and wait for it to be ready
      connection.send({ type: "stdin", content: [preLaunch + "\r"] });
      await new Promise<void>((r) => setTimeout(r, 1500));
    }

    connection.send({ type: "stdin", content: [code + "\r"] });
  };

  // Register a single, stable window event listener for "orion:run-in-terminal"
  useEffect(() => {
    const handler = (e: Event) => {
      const { code, preLaunch } = (e as CustomEvent<{ code: string; preLaunch?: string }>).detail;
      void sendToTerminalRef.current(code, preLaunch);
    };
    window.addEventListener("orion:run-in-terminal", handler);
    return () => window.removeEventListener("orion:run-in-terminal", handler);
  }, []);

  /** Close a terminal tab and shut it down on the server. */
  const handleCloseTerminal = useCallback(
    async (name: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (!kernelService) return;

      try {
        if (pool) {
          // Pool fires onStateChanged which removes the terminal from panel state
          await pool.closeTerminal(name);
        } else {
          await kernelService.closeTerminal(name);
          setTerminals((prev) => {
            const updated = prev.filter((t) => t.name !== name);
            setActiveTerminalName((current) => {
              if (current === name) {
                return updated.length > 0 ? updated[0].name : null;
              }
              return current;
            });
            return updated;
          });
        }
      } catch {
        // Terminal may already be gone; update local state anyway
        setTerminals((prev) => {
          const updated = prev.filter((t) => t.name !== name);
          setActiveTerminalName((current) => {
            if (current === name) {
              return updated.length > 0 ? updated[0].name : null;
            }
            return current;
          });
          return updated;
        });
      }
    },
    [kernelService, pool]
  );

  /** Close every agent terminal shown in the agent tabs dropdown. */
  const handleCloseAllAgentTerminals = useCallback(async () => {
    if (!kernelService) return;

    const agentNames = terminals
      .filter((terminal) => terminal.createdBy === "agent")
      .map((terminal) => terminal.name);
    if (agentNames.length === 0) return;

    await Promise.allSettled(
      agentNames.map(async (name) => {
        try {
          if (pool) {
            await pool.closeTerminal(name);
          } else {
            await kernelService.closeTerminal(name);
          }
        } catch {
          // Terminal may already be gone
        }
      })
    );

    if (!pool) {
      setTerminals((prev) => {
        const updated = prev.filter((terminal) => terminal.createdBy !== "agent");
        setActiveTerminalName((current) => {
          if (current && updated.some((terminal) => terminal.name === current)) {
            return current;
          }
          return updated.length > 0 ? updated[0].name : null;
        });
        return updated;
      });
    }

    setIsAgentDropdownOpen(false);
  }, [kernelService, pool, terminals]);

  const userTerminals = terminals.filter((terminal) => terminal.createdBy === "user");
  const agentTerminals = terminals.filter((terminal) => terminal.createdBy === "agent");
  const activeUserTerminalName = userTerminals.some(
    (terminal) => terminal.name === activeTerminalName
  )
    ? (activeTerminalName ?? undefined)
    : undefined;
  const activeIsAgent = agentTerminals.some(
    (terminal) => terminal.name === activeTerminalName
  );

  // No kernel/server available — show prompt
  if (!jupyterShellReady) {
    return (
      <div className={TERMINAL_PANEL_SHELL}>
        <div
          className={cn(
            TERMINAL_PANEL_CARD,
            "items-center justify-center px-6",
          )}
        >
          <NoKernelPrompt
            description="Connect Orion's runtime to use the integrated terminal."
            onConnect={onOpenKernelDropdown}
            className="max-w-md"
          />
        </div>
      </div>
    );
  }

  // Server available but no terminals yet
  if (terminals.length === 0) {
    return (
      <div className={TERMINAL_PANEL_SHELL}>
        <div className={TERMINAL_PANEL_CARD}>
          {/* Tab bar */}
          <div className="flex h-9 shrink-0 items-center gap-1 px-1 outline-none">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 bg-transparent text-muted-foreground hover:bg-transparent hover:text-accent-foreground"
              onClick={handleCreateTerminal}
              title="New terminal"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 bg-transparent text-muted-foreground hover:bg-transparent hover:text-accent-foreground"
              onClick={() => void handleReloadTerminals()}
              title="Reload terminals from server"
            >
              <RefreshCw
                className={cn("h-4 w-4", isReloadingTerminals && "animate-spin")}
              />
            </Button>
          </div>
          {/* Empty state */}
          <div className="flex flex-1 items-center justify-center">
            <button
              onClick={handleCreateTerminal}
              className="corner-squircle flex flex-col items-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 px-8 py-6 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
            >
              <TerminalSquare className="h-8 w-8" />
              <span className="text-sm">Create a new terminal</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Terminals active
  return (
    <div className={TERMINAL_PANEL_SHELL}>
      <div className={TERMINAL_PANEL_CARD}>
        {/* Tab bar */}
        <div className="flex h-9 min-w-0 shrink-0 items-center gap-1 px-1 outline-none">
          {/* User tabs + actions stay grouped on the left; extra width stays between this block and agent */}
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <div className="min-w-0 shrink overflow-x-auto">
              <Tabs
                value={activeUserTerminalName}
                onValueChange={(value) => setActiveTerminalName(value)}
                className="min-w-0"
              >
                <TabsList className="h-7 w-max shrink-0 gap-0 rounded-none border-0 bg-transparent p-0 shadow-none outline-none ring-0">
                  {userTerminals.map((terminal) => (
                    <TabsTrigger
                      key={terminal.name}
                      value={terminal.name}
                      className="corner-squircle group flex h-7 shrink-0 items-center gap-1.5 rounded-sm px-2.5 text-xs font-normal text-muted-foreground shadow-none outline-none ring-0 hover:text-foreground focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-none"
                    >
                      <TerminalSquare className="h-3.5 w-3.5 shrink-0" />
                      <span className="max-w-[120px] truncate">{terminal.name}</span>
                      <span
                        role="button"
                        onClick={(e) => handleCloseTerminal(terminal.name, e)}
                        className="corner-squircle ml-0.5 shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-transparent group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                        aria-label={`Close terminal ${terminal.name}`}
                      >
                        <X className="h-3 w-3" />
                      </span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 bg-transparent text-muted-foreground hover:bg-transparent hover:text-accent-foreground"
              onClick={handleCreateTerminal}
              title="New terminal"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 bg-transparent text-muted-foreground hover:bg-transparent hover:text-accent-foreground"
              onClick={() => void handleReloadTerminals()}
              title="Reload terminals from server"
            >
              <RefreshCw
                className={cn("h-4 w-4", isReloadingTerminals && "animate-spin")}
              />
            </Button>
          </div>

          {agentTerminals.length > 0 && (
            <div className="flex shrink-0 items-center">
              <Popover
                open={isAgentDropdownOpen}
                onOpenChange={setIsAgentDropdownOpen}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    className={cn(
                      "corner-squircle group flex h-7 shrink-0 gap-1 rounded-sm px-2 text-xs font-normal text-muted-foreground",
                      activeIsAgent && "bg-accent text-accent-foreground"
                    )}
                  >
                    {activeIsAgent
                      ? `agent:${activeTerminalName}`
                      : "Agent Tabs"}
                    {activeIsAgent && activeTerminalName && (
                      <span
                        role="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void handleCloseTerminal(activeTerminalName, e);
                        }}
                        className="corner-squircle ml-0.5 rounded p-0.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                        aria-label={`Close terminal ${activeTerminalName}`}
                      >
                        <X className="h-3 w-3" />
                      </span>
                    )}
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-52 p-0" align="start">
                  <Command>
                    <div className="flex items-center border-b [&_[cmdk-input-wrapper]]:border-0">
                      <CommandInput
                        placeholder="Search agent terminals..."
                        className="h-8 flex-1 rounded-none text-xs"
                      />
                      <TooltipProvider delayDuration={250}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="destructive"
                              size="icon"
                              className="mr-1 h-7 w-7 shrink-0 bg-transparent text-muted-foreground hover:bg-transparent hover:text-destructive"
                              onClick={(e) => {
                                e.preventDefault();
                                void handleCloseAllAgentTerminals();
                              }}
                              aria-label="Close all agent terminals"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p>Close all agent terminals</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <CommandEmpty>No agent terminals found.</CommandEmpty>
                    <CommandList className="max-h-[220px] overflow-y-auto">
                      <CommandGroup>
                        {agentTerminals.map((terminal) => (
                          <CommandItem
                            key={terminal.name}
                            value={terminal.name}
                            onSelect={() => {
                              setActiveTerminalName(terminal.name);
                              setIsAgentDropdownOpen(false);
                            }}
                            className="text-xs"
                          >
                            <div className="flex w-full items-center gap-2">
                              <TerminalSquare className="h-3.5 w-3.5 opacity-60" />
                              <span className="truncate">agent:{terminal.name}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>

        {/* Terminal content area */}
        <div className="relative flex-1 overflow-hidden">
          {terminals.map((terminal) => (
            <XTermTerminal
              key={terminal.name}
              connection={terminal.connection}
              isActive={terminal.name === activeTerminalName}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
