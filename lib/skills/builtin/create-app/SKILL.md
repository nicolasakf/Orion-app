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
    "css": ".metric-card { border-color: hsl(var(--primary)); }",
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

Only use the built-in registry in v1. Do not write custom primitive paths or inline `style`.
Use `props.className` only as a semantic hook for CSS defined in `metadata.orion.appView.css`; do not rely on arbitrary Tailwind runtime class strings.
Legacy `appView.grid`, `appView.layout`, and `cell.metadata.orion.app` metadata are ignored by the renderer and should not be authored.

## Built-in primitives

Layout and containers:

- `Page`: top-level container. Useful props: `gap`, `padding`.
- `Stack`: vertical layout. Useful props: `gap`, `align`.
- `Grid`: responsive grid. Useful props: `columns` (`1`-`4`), `gap`.
- `Section`: titled grouping. Useful props: `title`, `description`, `gap`, `padding`.
- `Card`: framed grouping. Useful props: `title`, `description`, `gap`.
- `Tabs`: tabbed grouping. Children become tab panels; child props may include `label`, `title`, or `value`.
- `Accordion`: expandable grouping. Children become items; child props may include `label`, `title`, or `value`. Useful props: `defaultValue`, `multiple`.
- `Collapsible`: single expandable section. Useful props: `label`, `title`, `defaultOpen`.
- `Carousel`: slide container. Children become slides. Useful props: `orientation`, `showControls`.
- `Separator`: horizontal separator.

Notebook display:

- `MarkdownCell`: render markdown from `cellId`, or inline `source`/`text`.
- `Output`: render a code output with `cellId` and `outputIndex`.

Static/local UI primitives:

- `Input`, `Textarea`, `Select`, `Slider`, `Checkbox`, `Switch`, `RadioGroup`, `Toggle`, `ToggleGroup`, `Calendar`, `DatePicker`, `Button`, `Label`, `Badge`, `Alert`, `Progress`, `Avatar`.
- Overlay/display helpers: `Popover`, `HoverCard`, `Tooltip`.
- Controls in App View metadata are static/local-only compatibility primitives. Do not use them for real notebook behavior.
- Controls may use `stateKey` and `defaultValue`; this state is renderer-local only and is not Python runtime state.
- `Select`, `RadioGroup`, and `ToggleGroup` `options` may be strings or `{ "label": "...", "value": "..." }` objects.
- `Calendar` and `DatePicker` store ISO-like `YYYY-MM-DD` strings.
- `Button` is display-only in v1; do not imply it runs notebook code.
- `Popover`, `HoverCard`, and `Tooltip` use `label`, `trigger`, or `text` for the trigger and children or `content`/`description` for body text.

Constrained styling props:

- `gap`: `none`, `xs`, `sm`, `md`, `lg`
- `padding`: `none`, `sm`, `md`, `lg`
- `align`: `start`, `center`, `end`, `stretch`
- `variant` and `size`: only use values supported by the primitive.
- `className`: optional semantic CSS hook; define matching selectors in `appView.css`.

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

- Prefer one notebook-level merge at path `["appView"]`, `["appView", "schema"]`, or `["appView", "css"]`.
- Ignore legacy `appView.grid`, `appView.layout`, and `cell.metadata.orion.app`; App View renders `appView.schema` plus optional scoped `appView.css`.
- Do not edit `cells[i].metadata.orion.id`.
- Do not write App View inclusion metadata under `cell.metadata.orion.app`; declarative schema references do not require `app.enabled`.
- If a requested feature needs cell execution, parameter binding, or runtime interactivity, implement it in a Python code cell with `orion_ui` and reference that output from App View.
- If a requested layout needs custom React, inline `style`, arbitrary Tailwind runtime classes, or custom primitive imports, explain that v1 App View metadata intentionally does not support those escape hatches yet.

## Validation checklist

- Schema has `version: 1`.
- `primitiveRegistry.source` is `"builtin"`.
- Every node has a supported `type`.
- `props` is an object when present.
- `children` is an array when present.
- All `cellId` references exist in `cells[i].metadata.orion.id`.
- Every `Output.outputIndex` exists on the referenced code cell.
- No node uses inline `style`, custom imports, or action/run-cell props.
- Any `className` values are semantic hooks with matching CSS in `metadata.orion.appView.css`.
- Interactive controls are implemented in `orion_ui` code cells, not authored directly in App View metadata.
