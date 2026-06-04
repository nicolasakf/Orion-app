---
name: orion-settings
description: Operates Orion user and workspace settings safely. Use when reading, creating, validating, or changing `~/.orion/settings.json` or `<workspace>/.orion/settings.json`, settings overrides, model pins, provider config, or workspace-level settings.
---

# Orion settings

## Full documentation

For extended user guides, merge precedence, and workspace override examples beyond this skill file, read:
https://docs.orion-agent.ai/ai-assistant/builtin-skills/orion-settings

Also see:
https://docs.orion-agent.ai/configuration/workspace-settings

Use this skill when a task involves Orion settings files or settings behavior.

## Storage and precedence

Settings merge in this order:

1. Built-in defaults from Orion (below).
2. User settings: `~/.orion/settings.json`.
3. Workspace settings: `<workspace>/.orion/settings.json`.

Workspace settings override user-level settings. A workspace settings file is read through Jupyter's ContentsManager at `.orion/settings.json` relative to the active workspace.

Provider credentials are browser-only. Do not write API keys, ChatGPT OAuth tokens, local endpoint bearer tokens, or Jupyter tokens into user or workspace settings files. If a settings file contains `providers.credentials`, remove or ignore it.

Partial JSON is merged with built-in defaults on load. Workspace overrides may be **deep partial** (only changed keys).

## Editing workflow

1. Decide whether the change is user-level or workspace-level.
2. Read the existing file if it exists.
3. Preserve unrelated keys.
4. Validate types and allowed values using the **field reference** below; match the default document shape.
5. For user settings, write `~/.orion/settings.json` only when filesystem access to the Orion host is available.
6. For workspace settings, write `<workspace>/.orion/settings.json` as a workspace override file. Prefer the `{ version, overrides }` shape for workspace files.
7. Never store secrets.

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

```json
{
  "version": 1,
  "settings": {
    "appearance": { "theme": "system" },
    "chat": {
      "titleGenerationModelId": "gemini-3.1-flash-lite",
      "toolApprovalMode": "always_ask",
      "pinnedModelIds": [],
      "fontSize": 12,
      "communicationStyle": "default"
    },
    "fileTree": { "fontSize": 12 },
    "editor": {
      "fontSize": 12,
      "wordWrap": "off",
      "minimapEnabled": false,
      "tabSize": 2,
      "insertSpaces": true
    },
    "notebook": {
      "scrollbarVisible": true,
      "presentationHideAllCellInputs": false,
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
    "workspace": { "pinnedDirectoryPaths": [] },
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
    "providers": { "credentials": {} }
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
| `fontSize` | integer | 10–20 (px) | `12` | Chat message stream and composer font size. |
| `communicationStyle` | string | `default`, `narrative`, `friendly`, `pragmatic` | `default` | Agent tone preset in system prompt. `default` = minimal tool narration; `narrative` = step-by-step; `friendly` = warm; `pragmatic` = minimal prose. |

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

### `notebook`

| Field | Type | Allowed values | Default | Description |
| --- | --- | --- | --- | --- |
| `scrollbarVisible` | boolean | `true`, `false` | `true` | Show notebook vertical scrollbar (`false` = overlay scroll, bar hidden). |
| `presentationHideAllCellInputs` | boolean | `true`, `false` | `false` | Hide code cell inputs in UI (presentation mode); does not change `.ipynb` files. |

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
| `credentials` | object | Map of provider ID → credential object | `{}` | **Do not write to JSON files.** Browser-only BYOK/OAuth/local endpoint secrets. Keys: `openai`, `anthropic`, `google`, `xai`, `ollama`, `lmstudio`, `mlx`, `custom`. Credential shapes: `api_key` (`apiKey`), `chatgpt_oauth` (`accessToken`, `refreshToken`, `expiresAt`, optional `accountId`), `local_endpoint` (`baseUrl`, `modelId`, optional `label`, `models[]`, optional `apiKey`). |

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
    "credentials": {
      "openai": { "type": "api_key", "apiKey": "..." }
    }
  }
}
```
