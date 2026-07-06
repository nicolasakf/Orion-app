---
name: orion-settings
description: Operates Orion user and workspace settings safely. Use when reading, creating, validating, or changing `~/.orion/settings.json` or `<workspace>/.orion/settings.json`, settings overrides, model pins, provider config, workspace-level settings, or recovering user settings from automatic backups in `~/.orion/settings-backup`.
---

# Orion settings

## Full documentation

For extended user guides, merge precedence, and workspace override examples beyond this skill file, read:
https://docs.orion-agent.ai/ai-assistant/builtin-skills/orion-settings.html

For end-user backup and restore steps (including Windows), read:
https://docs.orion-agent.ai/troubleshooting/restore-user-settings-from-backup.html

Also see:
https://docs.orion-agent.ai/configuration/workspace-settings.html

Use this skill when a task involves Orion settings files or settings behavior.

## Storage and precedence

Settings merge in this order:

1. Built-in defaults from Orion (below).
2. User settings: `~/.orion/settings.json`.
3. Workspace settings: `<workspace>/.orion/settings.json`.

Workspace settings override user-level settings. A workspace settings file is read through Jupyter's ContentsManager at `.orion/settings.json` relative to the active workspace.

Provider credentials live in `~/.orion/credentials.json` (or under `ORION_HOME_DIR`). Do not inspect, print, expose, or copy that file. Do not write API keys, ChatGPT OAuth tokens, local endpoint bearer tokens, or Jupyter tokens into user or workspace settings files. If a settings file contains `providers.credentials`, remove or ignore it.

Partial JSON is merged with built-in defaults on load. Workspace overrides may be **deep partial** (only changed keys).

## Editing workflow

1. Decide whether the change is user-level or workspace-level.
2. Read the existing file if it exists.
3. Preserve unrelated keys.
4. Validate types and allowed values using the **field reference** below; match the default document shape.
5. For user settings, write `~/.orion/settings.json` only when filesystem access to the Orion host is available.
6. For workspace settings, write `<workspace>/.orion/settings.json` as a workspace override file. Prefer the `{ version, overrides }` shape for workspace files.
7. Never store secrets.
8. After successfully changing any settings file, call `reload_page` when that tool is available so the running Orion UI picks up the new settings.

## User settings backup and recovery

Orion keeps **automatic backups of user settings only** (`~/.orion/settings.json`). Workspace overrides in `<workspace>/.orion/settings.json` are **not** backed up.

### Where backups live

| Item | Path |
| --- | --- |
| Backup directory | `~/.orion/settings-backup/` (or `$ORION_HOME_DIR/settings-backup` when `ORION_HOME_DIR` is set) |
| Active user settings | `~/.orion/settings.json` |

Backup filenames look like `settings-2026-06-06T13-00-45Z.json` (UTC timestamp; colons replaced with hyphens). Only files matching `settings-*.json` in that directory are valid backups.

Orion creates a backup **before overwriting** `settings.json` through the normal save path (Settings UI, Settings JSON editor save, or API persist). Direct filesystem copies do **not** trigger a backup.

Orion keeps up to **30** backups; older files are deleted automatically.

Backups follow the same rules as settings exports: they must remain **credential-free**. Do not copy secrets into backup files.

### When to use recovery

Use this workflow when the user wants to **undo**, **revert**, or **restore** user settings — for example after a bad edit, accidental overwrite, or broken JSON.

### Recovery workflow

1. Resolve the Orion home directory:

```bash
ORION_HOME="${ORION_HOME_DIR:-$HOME/.orion}"
```

2. List available backups (newest first):

```bash
ls -lt "$ORION_HOME/settings-backup"/settings-*.json 2>/dev/null || echo "No backups found"
```

3. If the user did not name a target time, inspect candidate files (timestamps, or diff key sections) and confirm which backup to restore.

4. **Optional but recommended:** copy the current `settings.json` aside before overwriting, so the user can undo the restore:

```bash
cp "$ORION_HOME/settings.json" \
  "$ORION_HOME/settings-backup/settings-manual-$(date -u +%Y-%m-%dT%H-%M-%SZ).json"
```

Skip this step only when the current file is missing or the user explicitly does not need a rollback point.

5. Restore by copying the chosen backup over the active user settings file:

```bash
cp "$ORION_HOME/settings-backup/settings-2026-06-06T13-00-45Z.json" \
  "$ORION_HOME/settings.json"
```

To restore the **most recent** backup:

```bash
latest="$(ls -t "$ORION_HOME/settings-backup"/settings-*.json 2>/dev/null | head -1)"
test -n "$latest" && cp "$latest" "$ORION_HOME/settings.json"
```

6. Call `reload_page` when that tool is available; otherwise tell the user to **reload Orion** (refresh the app window) so the running UI picks up the restored file. Filesystem-only restores do not notify the live session automatically.

7. If the restored file fails to load, pick an older backup or fix JSON syntax before retrying.

### Recovery limits

- Only **user-level** settings are covered. To revert workspace overrides, edit or delete `<workspace>/.orion/settings.json` directly.
- Backups exist only when a prior save created them. If `settings-backup` is empty, suggest Settings → export (if the user still has a good copy) or reconstruct from defaults plus the field reference below.
- Never read or restore from `~/.orion/credentials.json` when fixing settings.

## Accepted document shapes

**User settings** — full `settings` object:

```json
{ "version": 1, "settings": { } }
```

`version`: integer, minimum `1`. Use `1` today.

**Workspace settings** — partial overrides:

```json
{ "version": 1, "overrides": { } }
```

Workspace files may also use `{ "version": 1, "settings": { ... } }`; Orion treats `settings` as overrides for compatibility. Prefer `overrides` when authoring.

## Default user settings document

Copy this structure for a full user file. Omitted keys are backfilled from these defaults on load.
For `chat.interactionModes`, `[]` is accepted in authored JSON and is normalized to Orion's built-in modes on load.

```json
{
  "version": 1,
  "settings": {
    "appearance": { "theme": "system" },
    "chat": {
      "titleGenerationModelId": "gemini-3.1-flash-lite",
      "toolApprovalMode": "always_ask",
      "pinnedModelIds": [],
      "modelLabels": {},
      "fontSize": 12,
      "communicationStyle": "default",
      "customCommunicationStyle": "",
      "interactionModes": []
    },
    "fileTree": { "fontSize": 12 },
    "editor": {
      "fontSize": 12,
      "wordWrap": "off",
      "minimapEnabled": false,
      "tabSize": 2,
      "insertSpaces": true,
      "autosaveEnabled": false,
      "autosaveIntervalMs": 1000,
      "unopenableFileAction": "mention_in_chat",
      "emptyEditor": {
        "leftCard": "recent_files",
        "rightCard": "pinned_files",
        "maxItems": 5
      }
    },
    "notebook": {
      "scrollbarVisible": true,
      "output": {
        "textOutputAutoCollapseThreshold": 2000,
        "collapsedHeightDefaultPx": 192,
        "collapsedHeightMinPx": 64,
        "defaultPlotHeightPx": 360,
        "plotMinResizeWidthPx": 160,
        "plotMinResizeHeightPx": 120,
        "plotlyHoverCornerRatio": 0.15,
        "minimapOutputPreviewMaxLines": 4,
        "minimapHeadingNavigateDelayMs": 220,
        "chartColors": ["#8884d8", "#83a6ed", "#8dd1e1", "#82ca9d", "#a4de6c", "#d0ed57", "#ffc658", "#ff8042", "#ff6361", "#bc5090"]
      },
      "export": { "sansFontFamily": "'Saira', sans-serif" },
      "editor": { "doublePressTimeoutMs": 400 }
    },
    "workspace": { "pinnedDirectoryPaths": [], "pinnedFilePaths": [] },
    "agent": {
      "context": {
        "compactionAutoThreshold": 0.92,
        "compactionRetentionTurns": 4,
        "optimizerRetentionTurns": 6
      },
      "toolOutput": {
        "textCharBudget": 40000,
        "imageBase64CharBudget": 100000,
        "maxOmittedRatio": 0.3333333333333333
      },
      "terminal": {
        "pollIntervalMs": 150,
        "foregroundBudgetMs": 5000,
        "awaitBudgetMs": 30000,
        "maxBlockMs": 600000,
        "outputSpillThresholdChars": 200000,
        "outputPreviewHeadChars": 6000,
        "outputPreviewTailChars": 6000,
        "executorTimeoutMs": 15000,
        "executorAvailabilityTimeoutMs": 3000,
        "executorPollIntervalMs": 300,
        "poolIdleTimeoutMs": 3600000,
        "poolSystemSize": 2,
        "poolReaperIntervalMs": 60000
      },
      "search": {
        "maxMatches": 100,
        "maxLineLength": 200,
        "globTerminalMaxResults": 500,
        "globMaxDisplayResults": 100,
        "grepTimeoutMs": 15000,
        "whichTimeoutMs": 3000
      },
      "filesystem": {
        "ignoreDirs": ["node_modules", ".git", "__pycache__", ".ipynb_checkpoints", ".mypy_cache", ".pytest_cache", ".ruff_cache", ".tox", ".nox", ".venv", "venv", "env", ".env", "dist", "build", "out", "target", "coverage", ".next", ".nuxt", ".cache", ".parcel-cache", ".DS_Store"],
        "binaryExtensions": [".png", ".jpg", ".jpeg", ".gif", ".ico", ".bmp", ".svg", ".pdf", ".zip", ".tar", ".gz", ".bz2", ".xz", ".7z", ".rar", ".parquet", ".pickle", ".pkl", ".h5", ".hdf5", ".nc", ".npy", ".npz", ".sqlite", ".db", ".woff", ".woff2", ".ttf", ".eot", ".pyc", ".pyo", ".exe", ".dll", ".so", ".dylib", ".bin"],
        "blockedBashCommandPatterns": ["\\brm\\b", "\\bmv\\b", "\\bcp\\b", "\\bmkdir\\b", "\\btouch\\b", "\\bchmod\\b", "\\bchown\\b", "\\bpip\\s+install\\b", "\\bpip3\\s+install\\b", "\\bconda\\s+install\\b", "\\bnpm\\s+install\\b", "\\bnpm\\s+ci\\b", "\\byarn\\s+add\\b", "\\bgit\\s+(commit|push|add|reset|checkout|merge|rebase|tag)\\b", ">\\s*\\S+", "\\bdd\\b", "\\btruncate\\b", "\\bwget\\b.*-[Oo]", "\\bcurl\\b.*-[Oo]"]
      },
      "web": {
        "toolTimeoutMs": 30000,
        "fetchMaxResponseBytes": 5242880,
        "fetchMaxRedirects": 5,
        "searchDefaultNumResults": 8,
        "exaMcpUrl": "https://mcp.exa.ai/mcp"
      }
    },
    "shell": {
      "panelVisibility": {
        "leftCollapsed": false,
        "rightCollapsed": false,
        "bottomCollapsed": true,
        "isFocusMode": false
      },
      "panelLayout": { "horizontal": [15, 50, 20], "vertical": [70, 30] },
      "sidebar": {
        "activeViews": ["files"],
        "openAccordionItems": ["files", "toc"],
        "showHiddenFiles": true,
        "showMinimapOutputs": true,
        "minimapPreviewMode": "compact",
        "isSearchCaseSensitive": false
      },
      "chat": {
        "maxHighlightChars": 15000,
        "maxInlineLines": 24,
        "codeBlockInlineMaxHeightClass": "max-h-40",
        "markdownTableMaxHeightClass": "max-h-80",
        "awaitCommandCountdownSeconds": 30
      },
      "mobileBreakpointPx": 768,
      "minRefreshSpinMs": 500,
      "toastLimit": 1
    },
    "providers": { "credentials": {}, "addedProviderIds": [] }
  }
}
```

## Field reference

Paths are under `settings` for user files, or under `overrides` for workspace files (same keys, partial tree allowed).

### `appearance`

| Field | Type | Allowed values | Default | Description |
| --- | --- | --- | --- | --- |
| `theme` | string | `light`, `dark`, `system` | `system` | UI color scheme. `system` follows OS preference. |

### `chat`

| Field | Type | Allowed values | Default | Description |
| --- | --- | --- | --- | --- |
| `titleGenerationModelId` | string | Non-empty model ID from Orion catalog | `gemini-3.1-flash-lite` | Model used for short chat title generation. |
| `toolApprovalMode` | string | `always_ask`, `auto_run` (aliases like `Always Ask` normalized on load) | `always_ask` | Whether destructive tools require approval before run. |
| `pinnedModelIds` | string[] | Model IDs; order preserved | `[]` | Models pinned to top of model selector. |
| `modelLabels` | object | Map of `providerId/modelId` → display label | `{}` | User-defined labels for model picker and cost display. |
| `fontSize` | integer | 10–20 (px) | `12` | Chat message stream and composer font size. |
| `communicationStyle` | string | `default`, `narrative`, `friendly`, `pragmatic` | `default` | Agent tone preset in system prompt. `default` = minimal tool narration; `narrative` = step-by-step; `friendly` = warm; `pragmatic` = minimal prose. |
| `customCommunicationStyle` | string | Any string | `""` | Optional custom communication instructions. When non-empty, overrides `communicationStyle`. |
| `interactionModes` | object[] | Interaction mode objects (see below) | Built-in `Agent`, `Research`, `Edit`, `Ask` modes | Configurable built-in and custom chat modes shown in Settings → Interaction Modes. Missing or empty built-ins are repaired on load. |

#### `chat.interactionModes[]`

| Field | Type | Allowed values | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | string | Non-empty; custom IDs must not duplicate built-ins | Built-in mode ID | Stable mode identifier. |
| `label` | string | Non-empty | Built-in mode label | Display name in settings and selector. |
| `description` | string | Any string | Built-in description or `""` | Description shown in settings. |
| `baseMode` | string | `Agent`, `Research`, `Edit`, `Ask` | Same as built-in mode | Base behavior to inherit for prompts and defaults. |
| `toolNames` | string[] | Orion tool names | Built-in tool list | Tools enabled for the mode. Invalid names are removed during normalization. |
| `customSystemPrompt` | string | Any string | `""` | Mode-specific custom system prompt text. |
| `builtIn` | boolean | `true`, `false` | `true` for built-ins, `false` for custom modes | Whether this is a protected built-in mode. |
| `bashPolicy` | string | `read_only`, `full` | `full` except built-in `Ask` = `read_only` | Bash capability policy for the mode. |
| `hiddenInSelector` | boolean | `true`, `false` | `false` except built-in `Research` = `true` | Whether the mode is editable in settings but hidden from the chat selector. |
| `beta` | boolean | `true`, `false` | `false` except built-in `Research` = `true` | Marks experimental built-in modes in settings. |

### `fileTree`

| Field | Type | Allowed values | Default | Description |
| --- | --- | --- | --- | --- |
| `fontSize` | integer | 10–20 (px) | `12` | Left sidebar file list font size. |

### `editor`

| Field | Type | Allowed values | Default | Description |
| --- | --- | --- | --- | --- |
| `fontSize` | integer | 10–28 (px) | `12` | Monaco editor font size for code/markdown. |
| `wordWrap` | string | `off`, `on`, `wordWrapColumn`, `bounded` | `off` | Monaco word wrap mode. |
| `minimapEnabled` | boolean | `true`, `false` | `false` | Show editor minimap. |
| `tabSize` | integer | 1–8 | `2` | Tab width in spaces. |
| `insertSpaces` | boolean | `true`, `false` | `true` | Use spaces instead of tab characters. |
| `autosaveEnabled` | boolean | `true`, `false` | `false` | Periodically save dirty editor files. |
| `autosaveIntervalMs` | integer | > 0 (ms) | `1000` | Autosave interval for dirty editor files. |
| `unopenableFileAction` | string | `mention_in_chat`, `open_externally` | `mention_in_chat` | Action when a selected file cannot be opened inside Orion. |
| `emptyEditor` | object | Empty editor card settings (see below) | See default JSON | Left/right shortcut card contents shown when no editor file is open. |

#### `editor.emptyEditor`

| Field | Type | Allowed values | Default | Description |
| --- | --- | --- | --- | --- |
| `leftCard` | string | `recent_files`, `pinned_files`, `pinned_workspaces` | `recent_files` | Content shown in the left empty-editor shortcut card. |
| `rightCard` | string | `recent_files`, `pinned_files`, `pinned_workspaces` | `pinned_files` | Content shown in the right empty-editor shortcut card. |
| `maxItems` | integer | 1–20 | `5` | Max rows shown in each empty-editor card. |

### `notebook`

| Field | Type | Allowed values | Default | Description |
| --- | --- | --- | --- | --- |
| `scrollbarVisible` | boolean | `true`, `false` | `true` | Show notebook vertical scrollbar (`false` = overlay scroll, bar hidden). |

#### `notebook.output`

| Field | Type | Allowed values | Default | Description |
| --- | --- | --- | --- | --- |
| `textOutputAutoCollapseThreshold` | integer | > 0 (characters) | `2000` | Auto-collapse long text outputs on first render. |
| `collapsedHeightDefaultPx` | integer | > 0 (px) | `192` | Default collapsed output height. |
| `collapsedHeightMinPx` | integer | > 0 (px) | `64` | Minimum collapsed output height when resizing. |
| `defaultPlotHeightPx` | integer | > 0 (px) | `360` | Default Plotly output height. |
| `plotMinResizeWidthPx` | integer | > 0 (px) | `160` | Minimum Plotly width when resizing. |
| `plotMinResizeHeightPx` | integer | > 0 (px) | `120` | Minimum Plotly height when resizing. |
| `plotlyHoverCornerRatio` | number | 0–1 | `0.15` | Plotly hover label corner rounding ratio. |
| `minimapOutputPreviewMaxLines` | integer | ≥ 1 | `4` | Max lines in minimap output preview. |
| `minimapHeadingNavigateDelayMs` | integer | > 0 (ms) | `220` | Delay before minimap heading navigation. |
| `chartColors` | string[] | ≥ 1 color strings (typically `#RRGGBB`) | 10 hex colors (see default JSON) | Palette for Recharts table charts. |

#### `notebook.export`

| Field | Type | Allowed values | Default | Description |
| --- | --- | --- | --- | --- |
| `sansFontFamily` | string | Non-empty CSS font-family | `'Saira', sans-serif` | Font stack for HTML/PDF notebook export. |

#### `notebook.editor`

| Field | Type | Allowed values | Default | Description |
| --- | --- | --- | --- | --- |
| `doublePressTimeoutMs` | integer | > 0 (ms) | `400` | Window for double-key notebook shortcuts (e.g. `d d`). |

### `workspace`

| Field | Type | Allowed values | Default | Description |
| --- | --- | --- | --- | --- |
| `pinnedDirectoryPaths` | string[] | Non-empty Jupyter-relative paths; max **50** entries | `[]` | Directories pinned in workspace picker (order preserved). Do not pin server root `""`. |
| `pinnedFilePaths` | string[] | Non-empty Jupyter-relative paths; max **50** entries | `[]` | Files pinned in the recent-files picker and file tree (order preserved). Do not pin server root `""`. |

### `agent.context`

| Field | Type | Allowed values | Default | Description |
| --- | --- | --- | --- | --- |
| `compactionAutoThreshold` | number | 0–1 | `0.92` | Fraction of context cap that triggers auto-compaction before send. |
| `compactionRetentionTurns` | integer | ≥ 1 | `4` | Recent user-turn pairs kept verbatim after compaction. |
| `optimizerRetentionTurns` | integer | ≥ 1 | `6` | Recent user-turn pairs kept verbatim in wire payload optimizer. |

### `agent.toolOutput`

| Field | Type | Allowed values | Default | Description |
| --- | --- | --- | --- | --- |
| `textCharBudget` | integer | > 0 | `40000` | Max characters returned from text tool outputs (~10k tokens × 4). |
| `imageBase64CharBudget` | integer | > 0 | `100000` | Max base64 characters for image tool outputs. |
| `maxOmittedRatio` | number | 0–1 | `≈0.333` (1/3) | Max fraction of content that may be omitted when truncating. |

### `agent.terminal`

| Field | Type | Allowed values | Default | Description |
| --- | --- | --- | --- | --- |
| `pollIntervalMs` | integer | > 0 (ms) | `150` | Poll interval for bash / await_command loops. |
| `foregroundBudgetMs` | integer | > 0 (ms) | `5000` | Foreground wait before bash returns `running`. |
| `awaitBudgetMs` | integer | > 0 (ms) | `30000` | Wait budget for await_command. |
| `maxBlockMs` | integer | > 0 (ms) | `600000` | Max block wait for terminal tools (10 min). |
| `outputSpillThresholdChars` | integer | > 0 | `200000` | Bash output size above which spill-to-file is used. |
| `outputPreviewHeadChars` | integer | > 0 | `6000` | Head preview size when output is spilled. |
| `outputPreviewTailChars` | integer | > 0 | `6000` | Tail preview size when output is spilled. |
| `executorTimeoutMs` | integer | > 0 (ms) | `15000` | System command executor timeout. |
| `executorAvailabilityTimeoutMs` | integer | > 0 (ms) | `3000` | Availability-check probe timeout. |
| `executorPollIntervalMs` | integer | > 0 (ms) | `300` | Executor poll interval. |
| `poolIdleTimeoutMs` | integer | > 0 (ms) | `3600000` | Idle terminal pool reclaim (1 h). |
| `poolSystemSize` | integer | ≥ 1 | `2` | Warm system terminals in pool. |
| `poolReaperIntervalMs` | integer | > 0 (ms) | `60000` | Terminal pool reaper interval. |

### `agent.search`

| Field | Type | Allowed values | Default | Description |
| --- | --- | --- | --- | --- |
| `maxMatches` | integer | > 0 | `100` | Max grep matches returned. |
| `maxLineLength` | integer | > 0 | `200` | Max line length in grep results. |
| `globTerminalMaxResults` | integer | > 0 | `500` | Max paths from glob on disk. |
| `globMaxDisplayResults` | integer | > 0 | `100` | Max glob paths shown to the model. |
| `grepTimeoutMs` | integer | > 0 (ms) | `15000` | Grep command timeout. |
| `whichTimeoutMs` | integer | > 0 (ms) | `3000` | `which` availability check timeout. |

### `agent.filesystem`

| Field | Type | Allowed values | Default | Description |
| --- | --- | --- | --- | --- |
| `ignoreDirs` | string[] | Directory **names** (not paths), non-empty | See default JSON | Directory names skipped in list/glob (e.g. `node_modules`). |
| `binaryExtensions` | string[] | Extensions with leading `.`, non-empty | See default JSON | Extensions excluded from text search. |
| `blockedBashCommandPatterns` | string[] | Valid RegExp **source** strings, non-empty | See default JSON | Patterns blocked in Ask-mode read-only bash. Invalid regex may break the guard at runtime. |

### `agent.web`

| Field | Type | Allowed values | Default | Description |
| --- | --- | --- | --- | --- |
| `toolTimeoutMs` | integer | > 0 (ms) | `30000` | web_fetch / web_search timeout. |
| `fetchMaxResponseBytes` | integer | > 0 | `5242880` (5 MiB) | Max downloaded bytes for web_fetch. |
| `fetchMaxRedirects` | integer | ≥ 0 | `5` | Max HTTP redirects for web_fetch. |
| `searchDefaultNumResults` | integer | ≥ 1 | `8` | Default result count for web_search. |
| `exaMcpUrl` | string | Valid URL | `https://mcp.exa.ai/mcp` | Exa MCP endpoint for web search. |

### `shell.panelVisibility`

| Field | Type | Allowed values | Default | Description |
| --- | --- | --- | --- | --- |
| `leftCollapsed` | boolean | `true`, `false` | `false` | Left sidebar collapsed. |
| `rightCollapsed` | boolean | `true`, `false` | `false` | Right sidebar (chat) collapsed. |
| `bottomCollapsed` | boolean | `true`, `false` | `true` | Bottom panel collapsed. |
| `isFocusMode` | boolean | `true`, `false` | `false` | Focus mode (chrome minimized). |

### `shell.panelLayout`

| Field | Type | Allowed values | Default | Description |
| --- | --- | --- | --- | --- |
| `horizontal` | [number, number, number] | Three positive numbers (relative widths) | `[15, 50, 20]` | Left, center, right panel size weights. |
| `vertical` | [number, number] | Two positive numbers | `[70, 30]` | Main vs bottom panel size weights. |

### `shell.sidebar`

| Field | Type | Allowed values | Default | Description |
| --- | --- | --- | --- | --- |
| `activeViews` | string[] | `files`, `search`, `toc`, `cpu`, `vars`, `dataSources`, `secrets` | `["files"]` | Sidebar tabs shown in tab bar. |
| `openAccordionItems` | string[] | Same enum as `activeViews` | `["files", "toc"]` | Sidebar sections expanded by default. |
| `showHiddenFiles` | boolean | `true`, `false` | `true` | Show dotfiles in file tree. |
| `showMinimapOutputs` | boolean | `true`, `false` | `true` | Show outputs in notebook minimap. |
| `minimapPreviewMode` | string | `miniature`, `compact` | `compact` | Minimap output preview density. |
| `isSearchCaseSensitive` | boolean | `true`, `false` | `false` | Case-sensitive sidebar search. |

### `shell.chat`

| Field | Type | Allowed values | Default | Description |
| --- | --- | --- | --- | --- |
| `maxHighlightChars` | integer | > 0 | `15000` | Max chars for syntax highlighting in chat code blocks. |
| `maxInlineLines` | integer | > 0 | `24` | Max lines before inline code block scrolls. |
| `codeBlockInlineMaxHeightClass` | string | Non-empty (Tailwind class) | `max-h-40` | Max height class for long inline fenced code. |
| `markdownTableMaxHeightClass` | string | Non-empty (Tailwind class) | `max-h-80` | Max height class for chat markdown tables. |
| `awaitCommandCountdownSeconds` | integer | > 0 | `30` | UI countdown for await_command cards. |

### `shell` (root)

| Field | Type | Allowed values | Default | Description |
| --- | --- | --- | --- | --- |
| `mobileBreakpointPx` | integer | > 0 (px) | `768` | Viewport width at or below which mobile layout applies. |
| `minRefreshSpinMs` | integer | > 0 (ms) | `500` | Minimum spinner duration for refresh buttons. |
| `toastLimit` | integer | ≥ 1 | `1` | Max simultaneous toast notifications. |

### `providers`

| Field | Type | Allowed values | Default | Description |
| --- | --- | --- | --- | --- |
| `credentials` | object | Map of provider ID → credential summary | `{}` | **Do not write secrets to settings JSON.** Runtime secrets live in `~/.orion/credentials.json`; UI state may contain only safe summaries such as configured type, local endpoint base URL/model IDs, OAuth expiry, and account ID. |
| `addedProviderIds` | string[] | Provider IDs | `[]` | Non-secret provider IDs explicitly added in the Providers settings tab. |

#### `providers.credentials[providerId]`

Provider credential entries are client-safe summaries only. Never place raw API keys, OAuth tokens, bearer tokens, or Jupyter tokens here.

| Field | Type | Allowed values | Default | Description |
| --- | --- | --- | --- | --- |
| `type` | string | `api_key`, `chatgpt_oauth`, `local_endpoint` | Required | Credential summary kind. |
| `configured` | boolean | `true`, `false` | `true` for `api_key` and `chatgpt_oauth` | Whether a server-side credential is configured. |
| `baseUrl` | string | URL/string accepted by provider flow | Required for `local_endpoint`; optional for `api_key` | OpenAI-compatible endpoint URL for dynamic or local providers. |
| `expiresAt` | number | Epoch milliseconds | Required for `chatgpt_oauth` | Access token expiry timestamp summary. |
| `accountId` | string | Any string | Optional | ChatGPT account ID extracted from OAuth identity data. |
| `modelId` | string | Non-empty | Required for `local_endpoint` | Default runtime model ID for a local endpoint. |
| `label` | string | Any string | Optional | User-facing label for a local endpoint model. |
| `models` | object[] | Local endpoint model summaries | Optional | Runtime models enabled for a local endpoint. |
| `hasApiKey` | boolean | `true`, `false` | `false` for `local_endpoint` | Whether a local bearer token exists server-side; does not contain the token. |

#### `providers.credentials[providerId].models[]`

| Field | Type | Allowed values | Default | Description |
| --- | --- | --- | --- | --- |
| `modelId` | string | Non-empty | Required | Runtime-specific model ID returned by the local endpoint. |
| `label` | string | Any string | Optional | User-facing model label. |
| `enabled` | boolean | `true`, `false` | Optional | Whether the runtime model appears in model pickers. |

## Common examples

Set workspace chat font size:

```json
{
  "version": 1,
  "overrides": {
    "chat": { "fontSize": 14 }
  }
}
```

Set workspace title generation model and model pins:

```json
{
  "version": 1,
  "overrides": {
    "chat": {
      "titleGenerationModelId": "gemini-3-flash-preview",
      "pinnedModelIds": ["gpt-5.4", "claude-sonnet-4-5"]
    }
  }
}
```

Raise grep match limit for a repo:

```json
{
  "version": 1,
  "overrides": {
    "agent": {
      "search": { "maxMatches": 200 }
    }
  }
}
```

Do not include:

```json
{
  "providers": {
    "credentials": {}
  }
}
```
