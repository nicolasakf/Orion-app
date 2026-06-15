---
name: orion-metadata
description: Reference for Orion notebook metadata contract. Use when deciding which fields under notebook `metadata.orion` or cell `metadata.orion` are supported, what values they accept, and which keys are legacy/internal-only.
---

# Orion metadata contract reference

## Full documentation

For extended user guides and field summaries beyond this skill file, read:
https://docs.orion-agent.ai/ai-assistant/builtin-skills/orion-metadata.html

Use this skill to choose valid keys and value shapes for Orion metadata.

Keep procedural tool usage minimal here; tool mechanics are defined in tool schemas.

## Scope

Orion metadata in notebooks has two supported locations:

- Notebook-level: `metadata.orion`
- Cell-level: `cells[i].metadata.orion`

Do not treat output metadata (`cells[i].outputs[j].metadata.orion`) as part of this contract; that is separate from notebook/cell Orion metadata.

## Notebook-level fields (`metadata.orion`)

### `subagent` (object)

Used by notebook-defined sub-agents.

- `subagent.model`: non-empty string model id (trimmed)
  - Example: `"gpt-5.3-codex-high"`
  - Empty/whitespace strings should be treated as unset.
- `subagent.disable-model-invocation`: boolean (default `false`)
  - `true`: slash command remains available, but model-driven delegation prompt omits this sub-agent so it is no longer discoverable by the main agent.

Legacy note:

- `subagent.autoDiscover` is legacy and should not be written.

Unsupported note:

- `metadata.orion.css` and `metadata.orion.appView.css` are not supported. If notebook content needs custom styling, put that styling in the cell source/output itself rather than notebook metadata.

Notebook View also exposes JupyterLab-compatible class hooks for portable styling:

- `.jp-Notebook`: rendered notebook content root
- `.jp-Cell`: rendered notebook cell wrapper
- `.jp-MarkdownOutput` and `.jp-RenderedHTMLCommon`: rendered markdown
- `.jp-InputArea-editor`: code or markdown editor/input area
- `.jp-OutputArea-output`: rendered output wrapper

### `appView` (object)

Deprecated notebook-level App View metadata. Orion App View ignores `appView.schema`, `appView.grid`, and `appView.layout`.

Do not author notebook-level App View layout metadata. App View is controlled by cell-level inclusion metadata under `cells[i].metadata.orion.app`; rich layout and runtime behavior belong in notebook content, usually `orion_ui` code-cell outputs.

- `appView.schema`: deprecated and ignored
- `appView.grid`: deprecated and ignored
- `appView.layout`: deprecated and ignored

These keys may exist in older notebooks and should be preserved unless the user explicitly asks to remove them.

## Cell-level fields (`cells[i].metadata.orion`)

### `id` (string, Orion-managed, never edit)

- Stable Orion cell identifier.
- Must be a non-empty string.
- This field is always hands-off for agents: never set, replace, mutate, or delete it.
- Never target `["id"]` and never perform root-level cell `metadata.orion` edits that could remove or alter `id`.
- If asked to change/regenerate/remove this field, refuse and explain it is protected Orion runtime metadata.
- If missing, Orion may generate one during notebook/editor flows; agents should not generate it manually.

### `cellState` (object)

UI/runtime state for notebook rendering and execution status.

Supported boolean flags:

- `cellState.isInputHidden`
- `cellState.isOutputHidden`
- `cellState.isWholeCellHidden`
- `cellState.isMuted`
- `cellState.isInputCollapsed`
- `cellState.isOutputCollapsed`

Supported execution state payload:

- `cellState.executionInfo.status`: one of `"idle" | "running" | "success" | "error"`
- `cellState.executionInfo.startTime`: string or Date-like serialized value
- `cellState.executionInfo.endTime`: string or Date-like serialized value
- `cellState.executionInfo.lastExecuted`: string or Date-like serialized value
- `cellState.executionInfo.duration`: number (milliseconds)
- `cellState.executionInfo.statistics`:
  - `wallTime` (number, ms)
  - optional: `cpuTime`, `memoryUsage`, `peakMemory`, `ioRead`, `ioWrite` (numbers)

### `app` (object)

Controls whether a cell or output appears in App View.

Markdown cell included in App View:

- `app.enabled`: `true`

Code-cell output included in App View:

- `app.outputs["<outputIndex>"].enabled`: `true`

Optional labels such as `app.title` or `app.outputs["<outputIndex>"].title` may be preserved if present, but App View inclusion is controlled by the `enabled` flags. For code cells, mark each selected output index individually.

## Legacy and internal keys

These keys may exist for compatibility or recovery, but should generally not be authored in new metadata updates:

- `cell.metadata.orion.cellType = "raw"` (legacy muted-cell marker)
- old top-level visibility/collapse flags under `cell.metadata.orion` (prefer `cellState.*`)
- `cell.metadata.orion._parseError` (internal recovery marker for corrupted notebooks)

## Authoring guidance

- Prefer additive updates that preserve unrelated sibling keys.
- Never touch `cells[i].metadata.orion.id` under any circumstance.
- Keep Orion metadata small, deterministic, and free of secrets.
- If asked to write an unsupported key, warn that it is outside the current Orion metadata contract.
