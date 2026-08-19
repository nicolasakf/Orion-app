"use client";

import * as React from "react";
import { Loader2, Plug, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SettingsInfoLabel,
  SettingsInfoSectionTitle,
} from "@/components/settings-dialog/settings-info-label";
import { SettingsSectionLayout } from "@/components/settings-dialog/settings-section-layout";
import { partitionConnectionFields } from "@/lib/connections/kind-fields";
import {
  CONNECTION_KIND_LABELS,
  CONNECTION_KINDS,
  type ConnectionKind,
  type ConnectionSummary,
} from "@/lib/connections/types";
import { searchBusinessTools } from "@/lib/onboarding/business-tools";

/** Derives a kebab-case connection id from a product name. */
function toConnectionId(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

interface DraftState {
  toolQuery: string;
  toolId: string;
  label: string;
  kind: ConnectionKind;
  values: Record<string, string>;
}

const emptyDraft: DraftState = {
  toolQuery: "",
  toolId: "",
  label: "",
  kind: "api_key",
  values: {},
};

/**
 * Settings tab for the user's third-party systems.
 *
 * This is the surface the agent's `connections` tool opens with its `request`
 * action, so the assistant can hand a user somewhere real instead of describing
 * a screen that does not exist.
 */
export function ConnectionsTab() {
  const [connections, setConnections] = React.useState<ConnectionSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState<DraftState>(emptyDraft);

  const refresh = React.useCallback(async () => {
    try {
      const response = await fetch("/api/connections");
      const data = (await response.json()) as {
        connections?: ConnectionSummary[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Could not load connections.");
      setConnections(data.connections ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load connections.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const { secretFields, configFields } = partitionConnectionFields(draft.kind);
  const toolMatches = React.useMemo(
    () => (draft.toolQuery ? searchBusinessTools(draft.toolQuery, { limit: 6 }) : []),
    [draft.toolQuery],
  );

  const setValue = React.useCallback((key: string, value: string) => {
    setDraft((previous) => ({ ...previous, values: { ...previous.values, [key]: value } }));
  }, []);

  const handleSave = React.useCallback(async () => {
    const toolId = draft.toolId || toConnectionId(draft.toolQuery);
    if (!toolId) {
      toast.error("Choose or name the system you are connecting.");
      return;
    }

    const secrets: Record<string, string> = {};
    const config: Record<string, string> = {};
    for (const field of secretFields) {
      if (draft.values[field.key]) secrets[field.key] = draft.values[field.key];
    }
    for (const field of configFields) {
      if (draft.values[field.key]) config[field.key] = draft.values[field.key];
    }

    setSaving(true);
    try {
      const response = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: toConnectionId(draft.label || toolId),
          toolId,
          label: draft.label.trim() || toolId,
          kind: draft.kind,
          secrets,
          config,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not save the connection.");

      toast.success("Connection saved.");
      setDraft(emptyDraft);
      setAdding(false);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the connection.");
    } finally {
      setSaving(false);
    }
  }, [draft, secretFields, configFields, refresh]);

  const handleRemove = React.useCallback(
    async (id: string) => {
      try {
        const response = await fetch(`/api/connections?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(data.error ?? "Could not remove the connection.");
        await refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not remove the connection.",
        );
      }
    },
    [refresh],
  );

  return (
    <SettingsSectionLayout
      title="Connections"
      description="The systems Orion can reach on your behalf. Secrets are stored on this machine only, with owner-only file permissions, and are never shown to the assistant or included in a chat."
    >
      <div className="space-y-3">
        <SettingsInfoSectionTitle
          title="Your connections"
          description={
            'Each connection has an id that notebook code refers to with orion_ui.connections.get("<id>"). ' +
            "The assistant can see the id, the tool, and the non-secret settings — never the secret itself."
          }
        />

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading connections…
          </div>
        ) : connections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing connected yet. Orion will work from local files and manual exports
            until you add one.
          </p>
        ) : (
          <ul className="space-y-2">
            {connections.map((connection) => (
              <li
                key={connection.id}
                className="flex items-start justify-between gap-4 rounded-md border p-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Plug className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm font-medium">{connection.label}</span>
                    <Badge variant="secondary">
                      {CONNECTION_KIND_LABELS[connection.kind]}
                    </Badge>
                    {connection.expired ? (
                      <Badge variant="destructive">Token expired</Badge>
                    ) : null}
                  </div>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {connection.id}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {connection.lastVerifiedAt
                      ? `Last verified ${new Date(connection.lastVerifiedAt).toLocaleString()}`
                      : "Not verified yet"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleRemove(connection.id)}
                  aria-label={`Remove ${connection.label}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Separator />

      {adding ? (
        <div className="space-y-4">
          <SettingsInfoSectionTitle
            title="Add a connection"
            description="Pick the system, choose how it authenticates, then fill in what that method needs. Required fields are enforced before anything is written to disk."
          />

          <div className="space-y-2">
            <SettingsInfoLabel
              htmlFor="connection-tool"
              label="System"
              description="Search Orion's catalog of business tools, or type any product name if yours is not listed."
            />
            <Input
              id="connection-tool"
              value={draft.toolQuery}
              placeholder="Google Sheets, Slack, Postgres…"
              onChange={(event) =>
                setDraft((previous) => ({
                  ...previous,
                  toolQuery: event.target.value,
                  toolId: "",
                }))
              }
            />
            {toolMatches.length > 0 && !draft.toolId ? (
              <div className="flex flex-wrap gap-1.5">
                {toolMatches.map((tool) => (
                  <Button
                    key={tool.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setDraft((previous) => ({
                        ...previous,
                        toolId: tool.id,
                        toolQuery: tool.name,
                        label: previous.label || tool.name,
                      }))
                    }
                  >
                    {tool.name}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <SettingsInfoLabel
              htmlFor="connection-label"
              label="Name"
              description="How this connection appears in the list, and the basis for the id notebook code uses. Useful when you connect the same tool twice, e.g. two Google accounts."
            />
            <Input
              id="connection-label"
              value={draft.label}
              placeholder="Acme finance sheet"
              onChange={(event) =>
                setDraft((previous) => ({ ...previous, label: event.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <SettingsInfoLabel
              label="Authentication"
              description="How this system expects a caller to authenticate. For Google Sheets and Drive, a service account key avoids the OAuth flow entirely — share the sheet with the key's client_email address."
            />
            <Select
              value={draft.kind}
              onValueChange={(kind) =>
                setDraft((previous) => ({
                  ...previous,
                  kind: kind as ConnectionKind,
                  values: {},
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONNECTION_KINDS.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {CONNECTION_KIND_LABELS[kind]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {[...secretFields, ...configFields].map((field) => (
            <div key={field.key} className="space-y-2">
              <SettingsInfoLabel
                htmlFor={`connection-field-${field.key}`}
                label={field.required ? `${field.label} *` : field.label}
                description={field.description}
              />
              {field.multiline ? (
                <Textarea
                  id={`connection-field-${field.key}`}
                  rows={5}
                  className="font-mono text-xs"
                  placeholder={field.placeholder}
                  value={draft.values[field.key] ?? ""}
                  onChange={(event) => setValue(field.key, event.target.value)}
                />
              ) : (
                <Input
                  id={`connection-field-${field.key}`}
                  type={field.secret ? "password" : "text"}
                  autoComplete="off"
                  placeholder={field.placeholder}
                  value={draft.values[field.key] ?? ""}
                  onChange={(event) => setValue(field.key, event.target.value)}
                />
              )}
            </div>
          ))}

          <div className="flex gap-2">
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save connection
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(emptyDraft);
                setAdding(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" className="self-start" onClick={() => setAdding(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add a connection
        </Button>
      )}
    </SettingsSectionLayout>
  );
}
