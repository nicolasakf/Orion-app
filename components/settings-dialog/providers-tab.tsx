"use client";

import * as React from "react";
import { useState, useCallback, useEffect, useRef } from "react";
import {
  Eye,
  EyeOff,
  Check,
  X,
  Loader2,
  ExternalLink,
  Copy,
  CheckCheck,
  Globe2,
  RefreshCw,
  Plus,
} from "lucide-react";
import { OpenAI, Anthropic, Google, XAI, Ollama, LmStudio, Apple } from "@lobehub/icons";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useSettingsContext } from "@/components/settings/settings-provider";
import type { ProviderCredential } from "@/lib/settings/schema";
import { getLocalModelLabel } from "@/lib/agent/local-model-labels";
import {
  type LocalEndpointModel,
  isLocalProvider,
  normalizeLocalEndpointModels,
} from "@/lib/agent/local-provider-models";
import type { SupportedProvider } from "@/lib/agent/model-gateway-types";

// ── Provider metadata ─────────────────────────────────────────────────────────

interface ProviderMeta {
  id: SupportedProvider;
  name: string;
  icon: React.ElementType;
  credentialKind: "api_key" | "local_endpoint";
  keyPlaceholder: string;
  keyHint: string;
  supportsOAuth: boolean;
  defaultBaseUrl?: string;
  defaultModelId?: string;
  endpointHint?: string;
}

interface LocalEndpointDraft {
  baseUrl: string;
  modelId: string;
  label?: string;
  apiKey?: string;
  models?: LocalEndpointModel[];
}

const PROVIDERS: ProviderMeta[] = [
  {
    id: "openai",
    name: "OpenAI",
    icon: OpenAI,
    credentialKind: "api_key",
    keyPlaceholder: "sk-...",
    keyHint: "Starts with sk-",
    supportsOAuth: true,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    icon: Anthropic,
    credentialKind: "api_key",
    keyPlaceholder: "sk-ant-...",
    keyHint: "Starts with sk-ant-",
    supportsOAuth: false,
  },
  {
    id: "google",
    name: "Google",
    icon: Google,
    credentialKind: "api_key",
    keyPlaceholder: "AIza...",
    keyHint: "Google AI Studio API key",
    supportsOAuth: false,
  },
  {
    id: "xai",
    name: "xAI",
    icon: XAI,
    credentialKind: "api_key",
    keyPlaceholder: "xai-...",
    keyHint: "Starts with xai-",
    supportsOAuth: false,
  },
  {
    id: "ollama",
    name: "Ollama",
    icon: Ollama,
    credentialKind: "local_endpoint",
    keyPlaceholder: "Optional bearer token",
    keyHint: "Optional API key",
    supportsOAuth: false,
    defaultBaseUrl: "http://localhost:11434/v1",
    defaultModelId: "llama3.2",
    endpointHint: "Use the model name from ollama list.",
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    icon: LmStudio,
    credentialKind: "local_endpoint",
    keyPlaceholder: "Optional bearer token",
    keyHint: "Optional API key",
    supportsOAuth: false,
    defaultBaseUrl: "http://localhost:1234/v1",
    defaultModelId: "local-model",
    endpointHint: "Use the model ID returned by LM Studio's local server.",
  },
  {
    id: "mlx",
    name: "MLX",
    icon: Apple,
    credentialKind: "local_endpoint",
    keyPlaceholder: "Optional bearer token",
    keyHint: "Optional API key",
    supportsOAuth: false,
    defaultBaseUrl: "http://localhost:8080/v1",
    defaultModelId: "mlx-community/qwen3-8b-4bit",
    endpointHint: "Use the model ID served by your MLX OpenAI-compatible server.",
  },
  {
    id: "custom",
    name: "Custom Endpoint",
    icon: Globe2,
    credentialKind: "local_endpoint",
    keyPlaceholder: "Optional bearer token",
    keyHint: "Optional API key",
    supportsOAuth: false,
    defaultBaseUrl: "http://localhost:8080/v1",
    defaultModelId: "local-model",
    endpointHint: "Use any OpenAI-compatible local or LAN endpoint.",
  },
];

const REMOTE_PROVIDERS = PROVIDERS.filter((p) => p.credentialKind === "api_key");
const LOCAL_PROVIDERS = PROVIDERS.filter((p) => p.credentialKind === "local_endpoint");

// ── Helper: mask an API key for display ──────────────────────────────────────

function maskApiKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 6) + "••••••••" + key.slice(-4);
}

interface LocalModelDraftRow {
  id: string;
  modelId: string;
  label: string;
}

function createLocalModelDraftRow(
  provider: SupportedProvider,
  modelId = "",
  label?: string
): LocalModelDraftRow {
  const trimmedModelId = modelId.trim();
  return {
    id: crypto.randomUUID(),
    modelId: trimmedModelId,
    label: label?.trim() || getLocalModelLabel(provider, trimmedModelId) || trimmedModelId,
  };
}

/** Deduplicates local model rows while preserving row order and labels. */
function normalizeLocalModelDraftRows(rows: LocalModelDraftRow[]): LocalModelDraftRow[] {
  const seen = new Set<string>();
  const normalized: LocalModelDraftRow[] = [];

  for (const row of rows) {
    const modelId = row.modelId.trim();
    if (!modelId || seen.has(modelId)) continue;
    seen.add(modelId);
    normalized.push({
      ...row,
      modelId,
      label: row.label.trim(),
    });
  }

  return normalized;
}

// ── Device Flow State ─────────────────────────────────────────────────────────

interface DeviceFlowState {
  phase: "idle" | "starting" | "awaiting" | "success" | "failed";
  userCode?: string;
  deviceAuthId?: string;
  verificationUrl?: string;
  intervalSecs?: number;
}

// ── ChatGPT OAuth Device Flow UI ──────────────────────────────────────────────

interface DeviceFlowPanelProps {
  onCredential: (credential: ProviderCredential) => void;
  onCancel: () => void;
}

function DeviceFlowPanel({ onCredential, onCancel }: DeviceFlowPanelProps) {
  const [flow, setFlow] = useState<DeviceFlowState>({ phase: "idle" });
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  // Start the device flow on mount
  useEffect(() => {
    cancelledRef.current = false;

    async function start() {
      setFlow({ phase: "starting" });
      try {
        const res = await fetch("/api/credentials/oauth/device/start", { method: "POST" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({})) as { message?: string };
          throw new Error(data.message ?? "Failed to start device authorization.");
        }
        const data = await res.json() as {
          userCode: string;
          deviceAuthId: string;
          verificationUrl: string;
          interval: number;
        };

        if (cancelledRef.current) return;

        setFlow({
          phase: "awaiting",
          userCode: data.userCode,
          deviceAuthId: data.deviceAuthId,
          verificationUrl: data.verificationUrl,
          intervalSecs: data.interval,
        });
      } catch (err) {
        if (cancelledRef.current) return;
        const message = err instanceof Error ? err.message : "Failed to start device authorization.";
        toast.error(message);
        setFlow({ phase: "failed" });
      }
    }

    void start();

    return () => {
      cancelledRef.current = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  // Begin polling once we have the device auth details
  useEffect(() => {
    if (flow.phase !== "awaiting" || !flow.deviceAuthId || !flow.userCode) return;

    const { deviceAuthId, userCode, intervalSecs = 5 } = flow;

    async function poll() {
      if (cancelledRef.current) return;

      try {
        const res = await fetch("/api/credentials/oauth/device/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceAuthId, userCode }),
        });

        const data = await res.json() as {
          status: "pending" | "success" | "failed";
          credential?: ProviderCredential;
          message?: string;
        };

        if (cancelledRef.current) return;

        if (data.status === "pending") {
          pollRef.current = setTimeout(() => void poll(), intervalSecs * 1000);
          return;
        }

        if (data.status === "success" && data.credential) {
          setFlow((prev) => ({ ...prev, phase: "success" }));
          onCredential(data.credential);
          return;
        }

        // failed
        setFlow((prev) => ({ ...prev, phase: "failed" }));
        toast.error(data.message ?? "Device authorization failed. Please try again.");
      } catch {
        if (cancelledRef.current) return;
        // Network error — retry after interval
        pollRef.current = setTimeout(() => void poll(), intervalSecs * 1000);
      }
    }

    pollRef.current = setTimeout(() => void poll(), intervalSecs * 1000);

    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [flow.phase, flow.deviceAuthId, flow.userCode, flow.intervalSecs, onCredential]);

  const handleCopyCode = useCallback(async () => {
    if (!flow.userCode) return;
    try {
      await navigator.clipboard.writeText(flow.userCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — ignore
    }
  }, [flow.userCode]);

  if (flow.phase === "starting") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Starting device authorization…
      </div>
    );
  }

  if (flow.phase === "awaiting") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Enter this code at the verification URL to connect your ChatGPT account:
        </p>

        {/* User code display */}
        <div className="flex items-center gap-2">
          <div className="corner-squircle font-mono text-lg font-semibold tracking-widest border border-border rounded-md px-3 py-1.5 bg-muted select-all">
            {flow.userCode}
          </div>
          <Button variant="ghost" size="sm" onClick={handleCopyCode} className="shrink-0">
            {copied ? (
              <CheckCheck className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>

        {/* Open verification URL */}
        <Button
          variant="outline"
          size="sm"
          className="text-xs gap-1.5"
          asChild
        >
          <a href={flow.verificationUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3 w-3" />
            Open {flow.verificationUrl}
          </a>
        </Button>

        {/* Waiting indicator */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Waiting for you to approve in the browser…
        </div>

        <Button variant="ghost" size="sm" onClick={onCancel} className="text-xs">
          Cancel
        </Button>
      </div>
    );
  }

  if (flow.phase === "failed") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">Authorization failed. Please try again.</p>
        <Button variant="outline" size="sm" onClick={onCancel} className="text-xs">
          Close
        </Button>
      </div>
    );
  }

  // idle / success — parent handles success state
  return null;
}

// ── ProviderRow ───────────────────────────────────────────────────────────────

interface ProviderRowProps {
  provider: ProviderMeta;
  credential: ProviderCredential | undefined;
  onSaveKey: (provider: SupportedProvider, key: string) => Promise<void>;
  onSaveLocalEndpoint: (
    provider: SupportedProvider,
    endpoint: LocalEndpointDraft
  ) => Promise<void>;
  onRemove: (provider: SupportedProvider) => void;
  onSaveOAuthCredential: (provider: SupportedProvider, credential: ProviderCredential) => void;
}

interface ProviderGroupSectionProps {
  title: string;
  description?: string;
  providers: ProviderMeta[];
  credentials: Partial<Record<SupportedProvider, ProviderCredential>>;
  onSaveKey: (provider: SupportedProvider, key: string) => Promise<void>;
  onSaveLocalEndpoint: (
    provider: SupportedProvider,
    endpoint: LocalEndpointDraft
  ) => Promise<void>;
  onRemove: (provider: SupportedProvider) => void;
  onSaveOAuthCredential: (provider: SupportedProvider, credential: ProviderCredential) => void;
}

/** Renders a heading plus provider rows with separators between rows. */
function ProviderGroupSection({
  title,
  description,
  providers,
  credentials,
  onSaveKey,
  onSaveLocalEndpoint,
  onRemove,
  onSaveOAuthCredential,
}: ProviderGroupSectionProps) {
  if (providers.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">{title}</h3>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="space-y-6">
        {providers.map((provider, idx) => (
          <React.Fragment key={provider.id}>
            <ProviderRow
              provider={provider}
              credential={credentials[provider.id]}
              onSaveKey={onSaveKey}
              onSaveLocalEndpoint={onSaveLocalEndpoint}
              onRemove={onRemove}
              onSaveOAuthCredential={onSaveOAuthCredential}
            />
            {idx < providers.length - 1 && <Separator />}
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}

function ProviderRow({
  provider,
  credential,
  onSaveKey,
  onSaveLocalEndpoint,
  onRemove,
  onSaveOAuthCredential,
}: ProviderRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [baseUrlInput, setBaseUrlInput] = useState("");
  const [modelRows, setModelRows] = useState<LocalModelDraftRow[]>(() => [
    createLocalModelDraftRow(provider.id, provider.defaultModelId ?? ""),
  ]);
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [showDeviceFlow, setShowDeviceFlow] = useState(false);

  const Icon = provider.icon;
  const hasApiKey = credential?.type === "api_key";
  const hasOAuth = credential?.type === "chatgpt_oauth";
  const hasLocalEndpoint = credential?.type === "local_endpoint";

  const handleSave = useCallback(async () => {
    if (provider.credentialKind === "local_endpoint") {
      const baseUrl = baseUrlInput.trim();
      const normalizedRows = normalizeLocalModelDraftRows(modelRows);
      const apiKey = keyInput.trim();

      if (!baseUrl) {
        toast.error("Please enter a base URL.");
        return;
      }
      if (normalizedRows.length === 0) {
        toast.error("Please enter at least one model ID.");
        return;
      }

      setIsSaving(true);
      try {
        const [defaultRow] = normalizedRows;
        await onSaveLocalEndpoint(provider.id, {
          baseUrl,
          modelId: defaultRow.modelId,
          ...(defaultRow.label && { label: defaultRow.label }),
          models: normalizedRows.map((row) => ({
            modelId: row.modelId,
            label: row.label || getLocalModelLabel(provider.id, row.modelId) || row.modelId,
            enabled: true,
          })),
          ...(apiKey && { apiKey }),
        });
        setIsEditing(false);
        setKeyInput("");
      } finally {
        setIsSaving(false);
      }
      return;
    }

    const trimmed = keyInput.trim();
    if (!trimmed) {
      toast.error("Please enter an API key.");
      return;
    }
    setIsSaving(true);
    try {
      await onSaveKey(provider.id, trimmed);
      setIsEditing(false);
      setKeyInput("");
    } finally {
      setIsSaving(false);
    }
  }, [
    baseUrlInput,
    keyInput,
    modelRows,
    onSaveKey,
    onSaveLocalEndpoint,
    provider.credentialKind,
    provider.id,
  ]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setKeyInput("");
    setBaseUrlInput("");
    setModelRows([createLocalModelDraftRow(provider.id, provider.defaultModelId ?? "")]);
  }, [provider.defaultModelId, provider.id]);

  const handleAddModelRow = useCallback(() => {
    setModelRows((rows) => [...rows, createLocalModelDraftRow(provider.id)]);
  }, [provider.id]);

  const handleRemoveModelRow = useCallback((rowId: string) => {
    setModelRows((rows) => {
      const nextRows = rows.filter((row) => row.id !== rowId);
      return nextRows.length > 0 ? nextRows : [createLocalModelDraftRow(provider.id)];
    });
  }, [provider.id]);

  const handleModelRowChange = useCallback((
    rowId: string,
    patch: Partial<Pick<LocalModelDraftRow, "modelId" | "label">>
  ) => {
    setModelRows((rows) =>
      rows.map((row) => {
        if (row.id !== rowId) return row;

        const nextModelId = patch.modelId ?? row.modelId;
        const modelIdChanged = patch.modelId !== undefined && patch.modelId !== row.modelId;
        return {
          ...row,
          ...patch,
          label: modelIdChanged && row.label === ""
            ? getLocalModelLabel(provider.id, nextModelId) ?? nextModelId
            : patch.label ?? row.label,
        };
      })
    );
  }, [provider.id]);

  /** Reads `/v1/models` from a local endpoint and fills the model list. */
  const handleDiscoverModels = useCallback(async () => {
    const baseUrl = baseUrlInput.trim();
    if (!baseUrl) {
      toast.error("Please enter a base URL first.");
      return;
    }

    setIsDiscovering(true);
    try {
      const res = await fetch("/api/credentials/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: provider.id,
          baseUrl,
          apiKey: keyInput.trim() || undefined,
        }),
      });
      const data = await res.json() as {
        valid?: boolean;
        error?: string;
        models?: string[];
      };

      if (!res.ok || !data.valid) {
        toast.error(`Could not list models: ${data.error ?? "Endpoint rejected the request."}`);
        return;
      }

      const discovered = data.models ?? [];
      if (discovered.length === 0) {
        toast.error("No models were returned by this endpoint.");
        return;
      }

      setModelRows((rows) => {
        const existingByModelId = new Map(
          normalizeLocalModelDraftRows(rows).map((row) => [row.modelId, row])
        );
        return discovered.map((modelId) => {
          const existing = existingByModelId.get(modelId);
          return existing ?? createLocalModelDraftRow(provider.id, modelId);
        });
      });
      toast.success(`Found ${discovered.length} model${discovered.length === 1 ? "" : "s"}.`);
    } catch {
      toast.error("Could not reach the local endpoint.");
    } finally {
      setIsDiscovering(false);
    }
  }, [baseUrlInput, keyInput, provider.id]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") void handleSave();
      if (e.key === "Escape") handleCancel();
    },
    [handleSave, handleCancel]
  );

  const handleDeviceCredential = useCallback(
    (cred: ProviderCredential) => {
      onSaveOAuthCredential(provider.id, cred);
      setShowDeviceFlow(false);
      toast.success("ChatGPT account connected successfully.");
    },
    [onSaveOAuthCredential, provider.id]
  );

  return (
    <div className="space-y-3">
      {/* Provider header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Icon size={20} className="shrink-0 text-foreground" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{provider.name}</span>
              {hasApiKey && (
                <Badge variant="secondary" className="text-xs shrink-0">
                  Your Key
                </Badge>
              )}
              {hasOAuth && (
                <Badge variant="secondary" className="text-xs shrink-0 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                  ChatGPT
                </Badge>
              )}
              {hasLocalEndpoint && (
                <Badge variant="secondary" className="text-xs shrink-0">
                  Local
                </Badge>
              )}
              {!credential && (
                <Badge variant="outline" className="text-xs shrink-0 text-muted-foreground">
                  {provider.credentialKind === "local_endpoint" ? "Not configured" : "Platform"}
                </Badge>
              )}
            </div>
            {hasApiKey && credential.type === "api_key" && (
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                {maskApiKey(credential.apiKey)}
              </p>
            )}
            {hasOAuth && credential.type === "chatgpt_oauth" && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Connected via ChatGPT subscription
              </p>
            )}
            {hasLocalEndpoint && credential.type === "local_endpoint" && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {(() => {
                  if (!isLocalProvider(provider.id)) return null;
                  const configuredModels = normalizeLocalEndpointModels(provider.id, credential);
                  const firstModel = configuredModels[0];
                  const firstLabel = firstModel?.label ?? firstModel?.modelId ?? credential.modelId;
                  const extraCount = Math.max(0, configuredModels.length - 1);
                  return `${firstLabel}${extraCount > 0 ? ` + ${extraCount} more` : ""} at ${credential.baseUrl}`;
                })()}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {!credential && !isEditing && !showDeviceFlow && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setKeyInput("");
                  setBaseUrlInput(provider.defaultBaseUrl ?? "");
                  const defaultModelId = provider.defaultModelId ?? "";
                  setModelRows([createLocalModelDraftRow(provider.id, defaultModelId)]);
                  setIsEditing(true);
                }}
                className="text-xs"
              >
                {provider.credentialKind === "local_endpoint" ? "Configure" : "Add Key"}
              </Button>
          )}
          {(hasApiKey || hasLocalEndpoint) && !isEditing && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setKeyInput(hasApiKey ? "" : credential?.apiKey ?? "");
                  setBaseUrlInput(
                    hasLocalEndpoint
                      ? credential.baseUrl
                      : provider.defaultBaseUrl ?? ""
                  );
                  const configuredModels = hasLocalEndpoint
                    && isLocalProvider(provider.id)
                    ? normalizeLocalEndpointModels(provider.id, credential)
                    : [];
                  setModelRows(
                    configuredModels.length > 0
                      ? configuredModels.map((model) =>
                          createLocalModelDraftRow(provider.id, model.modelId, model.label)
                        )
                      : [createLocalModelDraftRow(provider.id, provider.defaultModelId ?? "")]
                  );
                  setIsEditing(true);
                }}
                className="text-xs"
              >
                {hasLocalEndpoint ? "Edit" : "Replace"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRemove(provider.id)}
                className="text-xs text-destructive hover:text-destructive"
              >
                Remove
              </Button>
            </>
          )}
          {hasOAuth && !showDeviceFlow && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemove(provider.id)}
              className="text-xs text-destructive hover:text-destructive"
            >
              Disconnect
            </Button>
          )}
        </div>
      </div>

      {/* Inline key input */}
      {isEditing && (
        <div className="space-y-2 pl-8">
          {provider.credentialKind === "local_endpoint" ? (
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Base URL</Label>
                <Input
                  value={baseUrlInput}
                  onChange={(e) => setBaseUrlInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={provider.defaultBaseUrl}
                  className="font-mono text-sm"
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs text-muted-foreground">Models</Label>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={handleAddModelRow}
                    >
                      <Plus className="h-3 w-3" />
                      Add
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={() => void handleDiscoverModels()}
                      disabled={isDiscovering || !baseUrlInput.trim()}
                    >
                      {isDiscovering ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      Refresh
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {modelRows.map((row, index) => (
                    <div
                      key={row.id}
                      className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_auto] items-center gap-2"
                    >
                      <Input
                        value={row.modelId}
                        onChange={(e) =>
                          handleModelRowChange(row.id, { modelId: e.target.value })
                        }
                        onKeyDown={handleKeyDown}
                        placeholder={index === 0 ? provider.defaultModelId : "model-id"}
                        className="font-mono text-sm"
                        aria-label="Model ID"
                      />
                      <Input
                        value={row.label}
                        onChange={(e) =>
                          handleModelRowChange(row.id, { label: e.target.value })
                        }
                        onKeyDown={handleKeyDown}
                        placeholder="Label"
                        className="text-sm"
                        aria-label="Model label"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveModelRow(row.id)}
                        aria-label="Remove model"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
                {provider.endpointHint && (
                  <p className="text-xs text-muted-foreground">
                    {provider.endpointHint}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{provider.keyHint}</Label>
                <div className="relative">
                  <Input
                    type={showKey ? "text" : "password"}
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={provider.keyPlaceholder}
                    className="pr-9 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => void handleSave()}
                  disabled={
                    isSaving ||
                    !baseUrlInput.trim() ||
                    normalizeLocalModelDraftRows(modelRows).length === 0
                  }
                >
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancel}
                  disabled={isSaving}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Label className="text-xs text-muted-foreground">{provider.keyHint}</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showKey ? "text" : "password"}
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={provider.keyPlaceholder}
                    className="pr-9 font-mono text-sm"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <Button
                  size="sm"
                  onClick={() => void handleSave()}
                  disabled={isSaving || !keyInput.trim()}
                >
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancel}
                  disabled={isSaving}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ChatGPT OAuth — device flow trigger or panel */}
      {provider.supportsOAuth && !hasOAuth && !isEditing && (
        <div className="pl-8">
          {!showDeviceFlow ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5"
                onClick={() => setShowDeviceFlow(true)}
              >
                <ExternalLink className="h-3 w-3" />
                Connect ChatGPT Plus / Pro
              </Button>
              <p className="text-xs text-muted-foreground mt-1">
                Use your ChatGPT subscription to access Codex models.
              </p>
            </>
          ) : (
            <DeviceFlowPanel
              onCredential={handleDeviceCredential}
              onCancel={() => setShowDeviceFlow(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── ProvidersTab ──────────────────────────────────────────────────────────────

/** Settings tab for managing per-provider API keys and ChatGPT OAuth. */
export function ProvidersTab() {
  const { effectiveSettings, setUserSettings } = useSettingsContext();
  const credentials = effectiveSettings.providers?.credentials ?? {};

  /** Save a BYOK API key for a provider — validates the key before persisting. */
  const handleSaveKey = useCallback(
    async (provider: SupportedProvider, apiKey: string) => {
      // Validate the key server-side before saving.
      let validationFailed = false;
      try {
        const res = await fetch("/api/credentials/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, apiKey }),
        });
        if (res.ok) {
          const data = await res.json() as { valid: boolean; error?: string };
          if (!data.valid) {
            toast.error(`Invalid API key: ${data.error ?? "Key rejected by provider."}`);
            validationFailed = true;
          }
        }
        // If the validation endpoint itself errors (network, server), still allow saving.
      } catch {
        // Network error — allow saving anyway, errors will surface on first chat request.
      }

      if (validationFailed) return;

      await setUserSettings((current) => ({
        ...current,
        providers: {
          ...current.providers,
          credentials: {
            ...current.providers?.credentials,
            [provider]: { type: "api_key" as const, apiKey },
          },
        },
      }));

      toast.success(`${provider} API key saved.`);
    },
    [setUserSettings]
  );

  /** Save and validate a local OpenAI-compatible provider endpoint. */
  const handleSaveLocalEndpoint = useCallback(
    async (
      provider: SupportedProvider,
      endpoint: LocalEndpointDraft
    ) => {
      let validationFailed = false;
      try {
        const res = await fetch("/api/credentials/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            baseUrl: endpoint.baseUrl,
            modelId: endpoint.modelId,
            apiKey: endpoint.apiKey,
          }),
        });
        if (res.ok) {
          const data = await res.json() as { valid: boolean; error?: string; models?: string[] };
          if (!data.valid) {
            toast.error(`Local endpoint unavailable: ${data.error ?? "Endpoint rejected the request."}`);
            validationFailed = true;
          } else if (data.models && data.models.length > 0) {
            const availableModels = new Set(data.models);
            const missingModel = (endpoint.models ?? [{ modelId: endpoint.modelId }]).find(
              (model) => !availableModels.has(model.modelId)
            );
            if (missingModel) {
              toast.error(`Local endpoint unavailable: model "${missingModel.modelId}" was not found.`);
              validationFailed = true;
            }
          }
        }
      } catch {
        // If the validation route itself is unavailable, chat will surface hard failures.
      }

      if (validationFailed) return;

      await setUserSettings((current) => ({
        ...current,
        providers: {
          ...current.providers,
          credentials: {
            ...current.providers?.credentials,
            [provider]: {
              type: "local_endpoint" as const,
              baseUrl: endpoint.baseUrl,
              modelId: endpoint.modelId,
              label: endpoint.label ?? getLocalModelLabel(provider, endpoint.modelId) ?? endpoint.modelId,
              models: endpoint.models,
              ...(endpoint.apiKey && { apiKey: endpoint.apiKey }),
            },
          },
        },
      }));

      toast.success(`${provider} local endpoint saved.`);
    },
    [setUserSettings]
  );

  /** Remove a credential for a provider. */
  const handleRemove = useCallback(
    (provider: SupportedProvider) => {
      setUserSettings((current) => {
        const next = { ...current.providers?.credentials };
        delete next[provider];
        return { ...current, providers: { ...current.providers, credentials: next } };
      });
      toast.success(`${provider} credential removed.`);
    },
    [setUserSettings]
  );

  /** Save an OAuth credential returned from the device flow. */
  const handleSaveOAuthCredential = useCallback(
    (provider: SupportedProvider, credential: ProviderCredential) => {
      setUserSettings((current) => ({
        ...current,
        providers: {
          ...current.providers,
          credentials: {
            ...current.providers?.credentials,
            [provider]: credential,
          },
        },
      }));
    },
    [setUserSettings]
  );

  return (
    <div className="flex flex-col gap-8 p-6">
      {/* Header */}
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold">Providers</h2>
      </div>

      {/* Remote vs local provider groups */}
      <div className="space-y-10">
        <ProviderGroupSection
          title="Remote"
          description="Cloud APIs and platform credentials for hosted models."
          providers={REMOTE_PROVIDERS}
          credentials={credentials}
          onSaveKey={handleSaveKey}
          onSaveLocalEndpoint={handleSaveLocalEndpoint}
          onRemove={handleRemove}
          onSaveOAuthCredential={handleSaveOAuthCredential}
        />
        {REMOTE_PROVIDERS.length > 0 && LOCAL_PROVIDERS.length > 0 ? (
          <Separator />
        ) : null}
        <ProviderGroupSection
          title="Local"
          description="OpenAI-compatible endpoints on your machine (Ollama, LM Studio, etc.)."
          providers={LOCAL_PROVIDERS}
          credentials={credentials}
          onSaveKey={handleSaveKey}
          onSaveLocalEndpoint={handleSaveLocalEndpoint}
          onRemove={handleRemove}
          onSaveOAuthCredential={handleSaveOAuthCredential}
        />
      </div>
    </div>
  );
}
