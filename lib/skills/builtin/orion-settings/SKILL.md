---
name: orion-settings
description: Operates Orion user and workspace settings safely. Use when reading, creating, validating, or changing `~/.orion/settings.json` or `<workspace>/.orion/settings.json`, settings overrides, model pins, provider config, or workspace-level settings.
---

# Orion settings

Use this skill when a task involves Orion settings files or settings behavior.

## Storage and precedence

Settings merge in this order:

1. Built-in defaults from Orion.
2. User settings: `~/.orion/settings.json`.
3. Workspace settings: `<workspace>/.orion/settings.json`.

Workspace settings override user-level settings. A workspace settings file is read through Jupyter's ContentsManager at `.orion/settings.json` relative to the active workspace.

Provider credentials are browser-only. Do not write API keys, ChatGPT OAuth tokens, local endpoint bearer tokens, or Jupyter tokens into user or workspace settings files. If a settings file contains `providers.credentials`, remove or ignore it.

## Editing workflow

1. Decide whether the change is user-level or workspace-level.
2. Read the existing file if it exists.
3. Preserve unrelated keys.
4. Validate the final document with the Zod schema below or the checked-in source at `lib/settings/schema.ts`.
5. For user settings, write `~/.orion/settings.json` only when filesystem access to the Orion host is available.
6. For workspace settings, write `<workspace>/.orion/settings.json` as a workspace override file. Prefer the `{ version, overrides }` shape for workspace files.
7. Never store secrets.

## Accepted document shapes

User settings must be:

```json
{
  "version": 1,
  "settings": { "...": "full settings object" }
}
```

Workspace settings should be:

```json
{
  "version": 1,
  "overrides": { "...": "partial settings object" }
}
```

Workspace files may also use `{ "version": 1, "settings": { ...full settings... } }`; Orion treats `settings` as overrides for compatibility. Prefer `overrides` when authoring.

## Validation schema

Use this schema before writing user or workspace settings. For workspace settings, validate with `WorkspaceSettingsDocumentSchema`; for user settings, validate with `UserSettingsDocumentSchema`.

```ts
import { z } from "zod";

const SETTINGS_SCHEMA_VERSION = 1;
const MAX_PINNED_WORKSPACE_DIRECTORY_PATHS = 50;

const ThemeSettingSchema = z.enum(["light", "dark", "system"]);
const InteractionModeSchema = z.enum(["Agent", "Ask", "Edit"]).catch("Agent");
const ToolApprovalModeSchema = z.enum(["always_ask", "auto_run"]);
const WordWrapSchema = z.enum(["off", "on", "wordWrapColumn", "bounded"]);

const ProviderCredentialSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("api_key"), apiKey: z.string() }),
  z.object({
    type: z.literal("chatgpt_oauth"),
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresAt: z.number(),
    accountId: z.string().optional(),
  }),
  z.object({
    type: z.literal("local_endpoint"),
    baseUrl: z.string().min(1),
    modelId: z.string().min(1),
    label: z.string().optional(),
    apiKey: z.string().optional(),
  }),
]);

const SettingsDataSchema = z.object({
  appearance: z.object({
    theme: ThemeSettingSchema,
  }),
  chat: z.object({
    toolApprovalMode: ToolApprovalModeSchema,
    pinnedModelIds: z.array(z.string()),
    fontSize: z.number().int().min(10).max(20),
  }),
  fileTree: z.object({
    fontSize: z.number().int().min(10).max(20),
  }),
  editor: z.object({
    fontSize: z.number().int().min(10).max(28),
    wordWrap: WordWrapSchema,
    minimapEnabled: z.boolean(),
    tabSize: z.number().int().min(1).max(8),
    insertSpaces: z.boolean(),
  }),
  notebook: z.object({
    scrollbarVisible: z.boolean(),
    presentationHideAllCellInputs: z.boolean(),
  }),
  workspace: z.object({
    pinnedDirectoryPaths: z
      .array(z.string().min(1))
      .max(MAX_PINNED_WORKSPACE_DIRECTORY_PATHS),
  }),
  providers: z
    .object({
      credentials: z.record(ProviderCredentialSchema).default({}),
    })
    .default({ credentials: {} }),
});

export const UserSettingsDocumentSchema = z.object({
  version: z.number().int().min(1),
  settings: SettingsDataSchema,
});

export const WorkspaceSettingsDocumentSchema = z.object({
  version: z.number().int().min(1),
  overrides: SettingsDataSchema.deepPartial(),
});
```

## Common examples

Set workspace chat font size:

```json
{
  "version": 1,
  "overrides": {
    "chat": {
      "fontSize": 14
    }
  }
}
```

Set workspace model pins:

```json
{
  "version": 1,
  "overrides": {
    "chat": {
      "pinnedModelIds": ["gpt-5.4", "claude-sonnet-4-5"]
    }
  }
}
```

Do not include:

```json
{
  "providers": {
    "credentials": {
      "openai": { "type": "api_key", "apiKey": "..." }
    }
  }
}
```
