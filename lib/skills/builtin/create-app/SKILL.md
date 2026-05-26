---
name: create-app
description: Creates or edits Orion notebook App View layouts using notebook metadata. Use when the user asks to make a notebook app, dashboard, report UI, or declarative app layout from notebook cells and outputs.
---

# Creating Orion notebook apps

Use this skill when the deliverable is an Orion App View inside a notebook, not a separate web app.

App View metadata is the layout and composition layer. It should arrange notebook cells and outputs into a polished interface, add headings/sections/tabs/labels, and control high-level presentation. It should not be the source of truth for interactive runtime behavior.

For sliders, selects, forms, action buttons, interactive tables, and other runtime controls, prefer writing a Python code cell with `orion_ui` and then reference that cell output from App View. Load or consult the `orion-ui` skill for those controls.

## Core workflow

1. Inspect the active notebook with Orion metadata included.
2. Identify stable cell ids from `cells[i].metadata.orion.id`; never invent or edit them.
3. Decide which notebook content should appear in App View:
   - Markdown cells render through `MarkdownCell`.
   - Code outputs render through `Output` with `cellId` and zero-based `outputIndex`.
   - Interactive UI should usually be an `orion_ui` output produced by a code cell, then included with `Output`.
4. Write notebook-level `metadata.orion.appView.schema` with `edit_orion_metadata`.
5. Preserve unrelated `metadata.orion` siblings and existing cell metadata.
6. If editing an existing app, make the smallest schema change that satisfies the request.

Before writing metadata, load or consult `orion-metadata` for the current supported field shapes. That skill is the source of truth for `metadata.orion`.

## App schema shape

V1 App View schema is inline notebook metadata:

```json
{
  "appView": {
    "schema": {
      "version": 1,
      "primitiveRegistry": { "source": "builtin" },
      "root": {
        "type": "Page",
        "props": { "gap": "md", "padding": "md" },
        "children": []
      }
    }
  }
}
```

Only use the built-in registry in v1. Do not write custom primitive paths, `className`, or `style`.

## Built-in primitives

Layout and containers:

- `Page`: top-level container. Useful props: `gap`, `padding`.
- `Stack`: vertical layout. Useful props: `gap`, `align`.
- `Grid`: responsive grid. Useful props: `columns` (`1`-`4`), `gap`.
- `Section`: titled grouping. Useful props: `title`, `description`, `gap`, `padding`.
- `Card`: framed grouping. Useful props: `title`, `description`, `gap`.
- `Tabs`: tabbed grouping. Children become tab panels; child props may include `label`, `title`, or `value`.
- `Separator`: horizontal separator.

Notebook display:

- `MarkdownCell`: render markdown from `cellId`, or inline `source`/`text`.
- `Output`: render a code output with `cellId` and `outputIndex`.

Static/local UI primitives:

- `Input`, `Textarea`, `Select`, `Slider`, `Checkbox`, `Switch`, `Button`, `Label`, `Badge`.
- Controls in App View metadata are static/local-only compatibility primitives. Do not use them for real notebook behavior.
- Controls may use `stateKey` and `defaultValue`; this state is renderer-local only and is not Python runtime state.
- `Select.options` may be strings or `{ "label": "...", "value": "..." }` objects.
- `Button` is display-only in v1; do not imply it runs notebook code.

Constrained styling props:

- `gap`: `none`, `xs`, `sm`, `md`, `lg`
- `padding`: `none`, `sm`, `md`, `lg`
- `align`: `start`, `center`, `end`, `stretch`
- `variant` and `size`: only use values supported by the primitive.

## Authoring patterns

Prefer simple, readable trees. A good dashboard starts with:

- `Page`
- one or more `Section` blocks
- `Grid` for comparable cards
- `Card` around dense outputs or `orion_ui` control outputs
- direct `MarkdownCell` for narrative text

Example:

```json
{
  "version": 1,
  "primitiveRegistry": { "source": "builtin" },
  "root": {
    "type": "Page",
    "props": { "gap": "lg", "padding": "md" },
    "children": [
      {
        "type": "Section",
        "props": { "title": "Overview", "gap": "md" },
        "children": [
          { "type": "MarkdownCell", "props": { "cellId": "intro" } },
          {
            "type": "Grid",
            "props": { "columns": 2, "gap": "md" },
            "children": [
              {
                "type": "Card",
                "props": { "title": "Chart" },
                "children": [
                  { "type": "Output", "props": { "cellId": "plot-cell", "outputIndex": 0 } }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
}
```

## Metadata editing guidance

- Prefer one notebook-level merge at path `["appView"]` or `["appView", "schema"]`.
- Keep legacy `appView.grid` and `appView.layout` unless the user asks to remove them; the declarative schema takes precedence when valid.
- Do not edit `cells[i].metadata.orion.id`.
- For App View inclusion metadata (`cell.metadata.orion.app`) only use it when maintaining the legacy grid App View. Declarative schema references do not require `app.enabled`.
- If a requested feature needs cell execution, parameter binding, or runtime interactivity, implement it in a Python code cell with `orion_ui` and reference that output from App View.
- If a requested layout needs custom React, arbitrary CSS, `className`, `style`, or custom primitive imports, explain that v1 App View metadata intentionally does not support those escape hatches yet.

## Validation checklist

- Schema has `version: 1`.
- `primitiveRegistry.source` is `"builtin"`.
- Every node has a supported `type`.
- `props` is an object when present.
- `children` is an array when present.
- All `cellId` references exist in `cells[i].metadata.orion.id`.
- Every `Output.outputIndex` exists on the referenced code cell.
- No node uses `className`, `style`, custom imports, or action/run-cell props.
- Interactive controls are implemented in `orion_ui` code cells, not authored directly in App View metadata.
