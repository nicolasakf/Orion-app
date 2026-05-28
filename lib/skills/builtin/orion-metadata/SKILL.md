---
name: orion-metadata
description: Reference for Orion notebook metadata contract. Use when deciding which fields under notebook `metadata.orion` or cell `metadata.orion` are supported, what values they accept, and which keys are legacy/internal-only.
---

# Orion metadata contract reference

## Full documentation

For extended user guides and field summaries beyond this skill file, read:
https://docs.orion-agent.ai/ai-assistant/builtin-skills/orion-metadata

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

Controls notebook App View layout. Orion renders the declarative schema at `appView.schema`.

App View metadata is a composition layer, not the source of truth for runtime behavior. Prefer `orion_ui` code-cell outputs for sliders, selects, forms, action buttons, and other interactive controls, then reference those outputs from App View.

- `appView.schema.version`: literal `1`
- `appView.schema.primitiveRegistry.source`: literal `"builtin"` only
- `appView.schema.root`: recursive node object
  - `type`: one of `Page`, `Stack`, `Grid`, `Section`, `Card`, `Tabs`, `MarkdownCell`, `Output`, `Button`, `Input`, `Textarea`, `Select`, `Slider`, `Checkbox`, `Switch`, `RadioGroup`, `Toggle`, `ToggleGroup`, `Calendar`, `DatePicker`, `Label`, `Badge`, `Separator`, `Alert`, `Progress`, `Avatar`, `Popover`, `HoverCard`, `Tooltip`, `Carousel`, `Collapsible`, `Accordion`
  - `props`: optional object; may contain string `className` hooks and must not contain `style`
  - `children`: optional array of child nodes

Common declarative props:

- Layout props: `gap`, `padding`, `columns`, `align`, `title`, `description`, `label`, `value`
- Notebook references: `cellId`, `outputIndex`
- Static/local controls: `stateKey`, `defaultValue`, `placeholder`, `options`, `min`, `max`, `step`, `variant`, `size`
- Styling hooks: prefer styling in cell source/output code; do not write notebook metadata CSS.

Declarative schema v1 limitations:

- Only built-in primitives are supported.
- No custom primitive paths, arbitrary React, or inline `style`.
- Local controls in metadata do not execute notebook cells, persist Python state, or replace `orion_ui` runtime controls.

Normalization behavior:

- Legacy `appView.grid`, `appView.layout`, and `cell.metadata.orion.app` metadata may exist in old notebooks but is ignored by App View rendering.
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

## Legacy and internal keys

These keys may exist for compatibility or recovery, but should generally not be authored in new metadata updates:

- `cell.metadata.orion.app` (legacy App View inclusion metadata; prefer `appView.schema` references)
- `cell.metadata.orion.cellType = "raw"` (legacy muted-cell marker)
- old top-level visibility/collapse flags under `cell.metadata.orion` (prefer `cellState.*`)
- `cell.metadata.orion._parseError` (internal recovery marker for corrupted notebooks)

## Authoring guidance

- Prefer additive updates that preserve unrelated sibling keys.
- Never touch `cells[i].metadata.orion.id` under any circumstance.
- Keep Orion metadata small, deterministic, and free of secrets.
- If asked to write an unsupported key, warn that it is outside the current Orion metadata contract.
