---
name: create-app
description: Creates or edits Orion notebook App View selections from notebook cells and outputs. Use when the user asks to make a notebook app, dashboard, report UI, or app view from notebook content.
---

# Creating Orion notebook apps

## Full documentation

For extended user guides, layout patterns, and troubleshooting beyond this skill file, read:
https://docs.orion-agent.ai/ai-assistant/builtin-skills/create-app.html

Also see:
https://docs.orion-agent.ai/notebooks/app-view.html

Use this skill when the deliverable is an Orion App View inside a notebook, not a separate web app.

App View is a filtered presentation of notebook content. It shows markdown cells and code outputs that are explicitly marked for App View, in notebook order. Rich cards, layouts, controls, forms, charts, and runtime behavior should be authored inside notebook cells, usually with `orion_ui`, and then included as selected outputs.

For sliders, selects, forms, action buttons, interactive tables, and other runtime controls, prefer writing a Python code cell with `orion_ui` and marking that output for App View. Load or consult the `orion-ui` skill for those controls.

## Core workflow

1. Inspect the active notebook with Orion metadata included.
2. Decide which notebook content should appear in App View:
   - Markdown cells render when `cells[i].metadata.orion.app.enabled` is `true`.
   - Code outputs render when `cells[i].metadata.orion.app.outputs["<outputIndex>"].enabled` is `true`.
   - Interactive UI should usually be an `orion_ui` output produced by a code cell.
3. If richer layout or cards are needed, edit the markdown/code cell content or add an `orion_ui` output rather than authoring App View layout metadata.
4. Write cell-level `metadata.orion.app` with `edit_orion_metadata`.
5. Preserve unrelated `metadata.orion` siblings and existing cell metadata.

Before writing metadata, load or consult `orion-metadata` for the current supported field shapes. That skill is the source of truth for `metadata.orion`.

## Inclusion metadata

Markdown cell included in App View:

```json
{
  "app": {
    "enabled": true
  }
}
```

Code-cell output included in App View:

```json
{
  "app": {
    "outputs": {
      "0": { "enabled": true }
    }
  }
}
```

When including all outputs for a code cell, mark each existing output index individually. Do not mark a code cell with `app.enabled` unless the cell itself is markdown.

## Authoring patterns

- Use markdown cells for headings, descriptions, section labels, and narrative.
- Use code-cell outputs for charts, tables, images, widgets, and generated UI.
- Use `orion_ui` for app-like cards, grids, tabs, controls, and forms.
- Keep App View metadata limited to selection. App View does not own layout, styling, or runtime behavior.

## Metadata editing guidance

- Prefer cell-level edits at path `["app"]` or `["app", "outputs", "<index>"]`.
- Do not write notebook-level `metadata.orion.appView.schema`, `appView.grid`, or `appView.layout`; App View ignores those fields.
- Do not write `metadata.orion.css` or `metadata.orion.appView.css`; style content in cell source/output code instead.
- Do not edit `cells[i].metadata.orion.id`.
- If a requested feature needs cell execution, parameter binding, or runtime interactivity, implement it in a Python code cell with `orion_ui` and mark that output for App View.

## Validation checklist

- Selected markdown cells have `app.enabled: true`.
- Selected code outputs have `app.outputs["<outputIndex>"].enabled: true`.
- Every selected output index exists on the referenced code cell.
- Complex layouts and controls are implemented in notebook content, usually through `orion_ui`.
- No notebook-level App View schema, grid, layout, or CSS metadata is authored.
