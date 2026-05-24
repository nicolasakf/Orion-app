---
name: orion-metadata
description: Reference for Orion notebook metadata contract. Use when deciding which fields under notebook `metadata.orion` or cell `metadata.orion` are supported, what values they accept, and which keys are legacy/internal-only.
---

# Orion metadata contract reference

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

### `appView` (object)

Controls notebook App View layout. Orion supports a legacy grid/canvas layout and a declarative schema layout. When a valid `appView.schema` is present, the declarative renderer takes precedence.

- `appView.grid.cols`: positive integer (`> 0`)
- `appView.grid.rowHeight`: positive integer (`> 0`)
- `appView.grid.margin`: tuple `[x, y]` with non-negative integers
- `appView.grid.containerPadding`: tuple `[x, y]` with non-negative integers
- `appView.layout`: object keyed by app item id
  - key for a cell card: `<cellId>`
  - key for an output card: `<cellId>:output:<outputIndex>`
  - each value has:
    - `x`: non-negative integer
    - `y`: non-negative integer
    - `w`: positive integer (clamped to `grid.cols`)
    - `h`: positive integer

Declarative schema:

- `appView.schema.version`: literal `1`
- `appView.schema.primitiveRegistry.source`: literal `"builtin"` only
- `appView.schema.root`: recursive node object
  - `type`: one of `Page`, `Stack`, `Grid`, `Section`, `Card`, `Tabs`, `MarkdownCell`, `Output`, `Button`, `Input`, `Textarea`, `Select`, `Slider`, `Checkbox`, `Switch`, `Label`, `Badge`, `Separator`
  - `props`: optional object; must not contain `className` or `style`
  - `children`: optional array of child nodes

Common declarative props:

- Layout props: `gap`, `padding`, `columns`, `align`, `title`, `description`, `label`, `value`
- Notebook references: `cellId`, `outputIndex`
- Local controls: `stateKey`, `defaultValue`, `placeholder`, `options`, `min`, `max`, `step`, `variant`, `size`

Declarative schema v1 limitations:

- Only built-in primitives are supported.
- No custom primitive paths, arbitrary React, arbitrary CSS, `className`, or `style`.
- Local controls do not execute notebook cells or persist state.

Normalization behavior:

- Invalid grid/layout values are normalized or ignored by app-view readers.
- Runtime currently emits `appView.version = 1`.
- Invalid declarative schema values render a non-crashing App View error panel.

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

Cell/output inclusion in notebook app view.

- `app.enabled`: boolean (include markdown cell in app view when true)
- `app.title`: optional string display title
- `app.outputs`: object keyed by output index as string:
  - `<outputIndex>.enabled`: boolean
  - `<outputIndex>.title`: optional string

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
