"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  ChevronDown,
  X,
  Server,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { KernelService } from "@/lib/kernel/kernel-service";
import { ErrorCard } from "@/components/common/error-card";
import {
  getStoredKernelConnections,
  removeKernelConnection,
} from "@/lib/kernel/kernel-storage";
import { cn } from "@/lib/utils";

interface KernelSpec {
  name: string;
  displayName: string;
  language: string;
}

interface RunningKernel {
  id: string;
  name: string;
  last_activity?: string;
  execution_state?: string;
}

interface KernelSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableKernels: KernelSpec[];
  onKernelSelect: (kernel: KernelSpec) => void;
}

interface KernelConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnect: (url: string, token?: string) => void;
  error?: string;
}

interface RunningKernelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnect: (kernelId: string) => void;
  kernelService: KernelService | null;
}

export function KernelSelectionDialog({
  open,
  onOpenChange,
  availableKernels,
  onKernelSelect,
}: KernelSelectionDialogProps) {
  const [selectedKernel, setSelectedKernel] = useState<string>("");

  const handleConnect = () => {
    const kernel = availableKernels.find((k) => k.name === selectedKernel);
    if (kernel) {
      onKernelSelect(kernel);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start New Kernel</DialogTitle>
          <DialogDescription>
            Select a kernel specification to start a new kernel.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {availableKernels.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No kernel specifications found. Make sure Jupyter server is
                running and accessible.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="kernel-select">Kernel Specification</Label>
              <Select value={selectedKernel} onValueChange={setSelectedKernel}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a kernel..." />
                </SelectTrigger>
                <SelectContent>
                  {availableKernels.map((kernel) => (
                    <SelectItem key={kernel.name} value={kernel.name}>
                      {kernel.displayName} ({kernel.language})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConnect}
            disabled={!selectedKernel || availableKernels.length === 0}
          >
            Start Kernel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function KernelConnectionDialog({
  open,
  onOpenChange,
  onConnect,
  error,
}: KernelConnectionDialogProps) {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [urlDropdownOpen, setUrlDropdownOpen] = useState(false);
  const [storedConnections, setStoredConnections] = useState<
    Array<{
      id: string;
      baseUrl: string;
      token?: string;
      createdAt: Date;
      lastConnectedAt: Date;
      displayName?: string;
    }>
  >([]);

  // Load stored connections when dialog opens
  useEffect(() => {
    if (open) {
      const connections = getStoredKernelConnections();
      setStoredConnections(connections);

      // Auto-populate with most recent connection if available
      if (connections.length > 0) {
        const mostRecent = connections[0];
        setUrl(mostRecent.baseUrl);
        setToken(mostRecent.token || "");
      }
    }
  }, [open]);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      await onConnect(url, token || undefined);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const handleDeleteConnection = (
    connectionId: string,
    event: React.MouseEvent
  ) => {
    event.stopPropagation(); // Prevent the command item from being selected
    removeKernelConnection(connectionId);
    // Refresh the stored connections
    const updatedConnections = getStoredKernelConnections();
    setStoredConnections(updatedConnections);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-[380px] gap-0 p-0 overflow-hidden">
        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Server className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-base">Jupyter Server</DialogTitle>
            <DialogDescription className="text-xs mt-0.5">
              Connect to run notebooks and use the terminal
            </DialogDescription>
          </div>
        </div>

        <div className="space-y-3 px-5 pb-5">
          <div className="space-y-1.5">
            <Label htmlFor="jupyter-url" className="text-xs">
              Server URL
            </Label>
            <div className="flex">
              <Input
                id="jupyter-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://127.0.0.1:8888"
                className="rounded-r-none border-r-0 h-9 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleConnect();
                }}
              />
              <Popover
                open={urlDropdownOpen}
                onOpenChange={setUrlDropdownOpen}
                modal={false}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-l-none border-l-0 px-2.5 shrink-0 h-9"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="end">
                  <Command>
                    <CommandInput placeholder="Saved connections..." className="h-8" />
                    <CommandEmpty>
                      {storedConnections.length === 0
                        ? "No saved connections"
                        : "No matches"}
                    </CommandEmpty>
                    <CommandList className="max-h-48">
                      <CommandGroup>
                        {storedConnections.map((connection) => (
                          <CommandItem
                            key={connection.id}
                            value={connection.displayName || connection.baseUrl}
                            onSelect={() => {
                              setUrl(connection.baseUrl);
                              setToken(connection.token || "");
                              setUrlDropdownOpen(false);
                            }}
                            className="flex items-center justify-between gap-2 py-1.5"
                          >
                            <span className="truncate text-sm">
                              {connection.displayName || connection.baseUrl}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 shrink-0 opacity-60 hover:opacity-100"
                              onClick={(e) =>
                                handleDeleteConnection(connection.id, e)
                              }
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className={cn("space-y-1.5", url.includes("?token=") && "hidden")}>
            <Label htmlFor="jupyter-token" className="text-xs">
              Token (optional)
            </Label>
            <Input
              id="jupyter-token"
              type="password"
              value={token}
              className="h-9 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
              onChange={(e) => setToken(e.target.value)}
              placeholder="If your server requires auth"
              disabled={url.includes("?token=")}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConnect();
              }}
            />
          </div>

          <ErrorCard message={error} />

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConnect}
              disabled={!url || isConnecting}
            >
              {isConnecting ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Connecting
                </>
              ) : (
                "Connect"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RunningKernelDialog({
  open,
  onOpenChange,
  onConnect,
  kernelService,
}: RunningKernelDialogProps) {
  const [runningKernels, setRunningKernels] = useState<RunningKernel[]>([]);
  const [selectedKernel, setSelectedKernel] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    if (open && kernelService) {
      loadRunningKernels();
    }
  }, [open, kernelService]);

  const loadRunningKernels = async () => {
    if (!kernelService) return;

    setIsLoading(true);
    try {
      const kernels = await kernelService.getRunningKernels();
      setRunningKernels(
        kernels.map((k) => ({
          id: k.id,
          name: k.name,
          last_activity: k.last_activity,
          execution_state: k.execution_state,
        }))
      );
    } catch (error) {
      console.error("Failed to load running kernels:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async () => {
    if (!selectedKernel) return;

    setIsConnecting(true);
    try {
      await onConnect(selectedKernel);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect to Running Kernel</DialogTitle>
          <DialogDescription>
            Select a running kernel to connect to.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="ml-2">Loading running kernels...</span>
            </div>
          ) : runningKernels.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No running kernels found. Start a new kernel first.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-2">
              <Label>Running Kernels</Label>
              <RadioGroup
                value={selectedKernel}
                onValueChange={setSelectedKernel}
              >
                {runningKernels.map((kernel) => (
                  <div key={kernel.id} className="flex items-center space-x-2">
                    <RadioGroupItem value={kernel.id} id={kernel.id} />
                    <Label
                      htmlFor={kernel.id}
                      className="flex-1 cursor-pointer"
                    >
                      <div className="flex justify-between items-center">
                        <span>{kernel.name}</span>
                        <span className="text-sm text-muted-foreground">
                          {kernel.execution_state || "unknown"}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        ID: {kernel.id}
                      </div>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConnect}
            disabled={
              !selectedKernel || isConnecting || runningKernels.length === 0
            }
          >
            {isConnecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              "Connect"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
