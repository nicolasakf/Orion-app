---
name: orion-ui
description: Builds Orion-native notebook UI outputs with the Python `orion_ui` package. Auto-loaded for notebook work; use when the user asks for interactive notebook UI features like plotly charts, sliders, selects, buttons, etc.
---

# Orion UI notebook components

## Full documentation

For extended user guides, component workflows, App View integration, and troubleshooting beyond this skill file, read: [Orion UI component reference](https://docs.orion-agent.ai/notebooks/orion-ui-component-reference.html).

Use this skill when the deliverable is a Python-authored UI inside an Orion notebook cell, rendered through Orion's native `application/vnd.orion.ui+json` MIME output.

Runtime interactivity belongs in notebook cells. App View metadata should arrange and label outputs; `orion_ui` cells should own sliders, selects, buttons, forms, and other behaviorful UI.

This is different from App View metadata authoring:

- Use `orion-ui` when writing Python code that imports `orion_ui as ui` and emits a UI output from a code cell.
- Use `create-app` when marking cells or outputs with `metadata.orion.app` so they appear in App View.
- Use both when a notebook should generate an Orion UI output and then include that output in App View.

## Core workflow

1. Prefer `import orion_ui as ui`.
2. Build UI with Python component helpers such as `ui.card`, `ui.stack`, `ui.slider`, and `ui.select`.
3. Put the final component expression as the last expression in a code cell so Jupyter displays its MIME bundle.
4. Read values in later cells with `ui.get("key")` or `ui.state()`.
5. Use explicit run buttons only when the target cells have stable Orion cell ids.

Controls define defaults, not forced values. If a user selects a new value and reruns the UI cell, Orion should preserve the current runtime state instead of resetting to the original default.

Example:

```python
import orion_ui as ui

temperature = ui.slider(
    "temperature",
    label="Temperature",
    min=0,
    max=2,
    default_value=0.7,
    step=0.1,
)

model = ui.select(
    "model",
    ["gpt-4.1", "claude-sonnet"],
    label="Model",
    default_value="gpt-4.1",
)

ui.card(
    ui.stack(model, temperature),
    title="Controls",
)
```

Read state later:

```python
temperature = ui.get("temperature")
model = ui.get("model")
```

## Available Python helpers

Layout and containers:

- `ui.page(*children, gap="md", padding="md")`
- `ui.stack(*children, gap="md", align="stretch")`
- `ui.grid(*children, columns=2, gap="md")`
- `ui.section(*children, title=None, description=None, gap="md", padding="md")`
- `ui.card(*children, title=None, description=None, gap="md")`
- `ui.tabs(*children, default_value=None)`
- `ui.accordion(*children, default_value=None, multiple=False)`
- `ui.collapsible(*children, label=None, title=None, default_open=False, content=None, description=None)`
- `ui.carousel(*children, orientation="horizontal", show_controls=True)`
- `ui.separator()`

Controls:

- `ui.input("key", label=None, default_value="", value=<unset>, placeholder=None, input_type="text")`
- `ui.textarea("key", label=None, default_value="", value=<unset>, placeholder=None)`
- `ui.select("key", options, label=None, default_value=None, value=<unset>, placeholder=None)`
- `ui.slider("key", label=None, min=0, max=100, default_value=0, value=<unset>, step=1)`
- `ui.checkbox("key", label=None, default_value=False, value=<unset>)`
- `ui.switch("key", label=None, default_value=False, value=<unset>)`
- `ui.radio_group("key", options, label=None, default_value=None, value=<unset>)`
- `ui.toggle("key", label=None, default_value=False, value=<unset>, variant=None)`
- `ui.toggle_group("key", options, label=None, default_value=None, value=<unset>, variant=None)`
- `ui.calendar("key", label=None, mode="single", default_value="", value=<unset>, caption_layout=None, from_year=None, to_year=None, number_of_months=None, show_outside_days=False, presets=None)`
- `ui.date_picker("key", label=None, mode="single", default_value="", value=<unset>, placeholder=None, caption_layout=None, from_year=None, to_year=None, number_of_months=None, show_outside_days=False, presets=None)`
- `ui.date_range_slider("key", label=None, default_value=None, value=<unset>, visible_months=4, min_days=1, presets=None)`
- `ui.date_time_picker("key", label=None, default_value="", value=<unset>, start_time_key=None, end_time_key=None, start_time_label="Start time", end_time_label="End time", default_start_time="09:00:00", default_end_time="17:00:00", caption_layout=None, from_year=None, to_year=None, show_outside_days=False, presets=None)`
- `ui.button(label, action=None, variant=None, size=None)`

Display:

- `ui.label(text)`
- `ui.badge(text, variant=None)`
- `ui.alert(*children, title=None, description=None, text=None, variant=None)`
- `ui.progress(key=None, label=None, default_value=0, value=<unset>, max=100)`
- `ui.avatar(src=None, alt=None, fallback=None, label=None, size=None)`
- `ui.popover(*children, label=None, trigger=None, text=None, content=None, description=None)`
- `ui.hover_card(*children, label=None, trigger=None, text=None, content=None, description=None)`
- `ui.tooltip(*children, label=None, trigger=None, text=None, content=None, description=None)`
- `ui.markdown_cell(cell_id=None, text=None)`
- `ui.output(cell_id, output_index=0)`
- `ui.table(df, source="df", mode="paginated", page_size=50, show_index=True, max_cell_chars=200, column_descriptions={"score": "Priority score."})`

All component helpers accept optional `class_name="..."` for semantic hooks inside generated UI. Do not write CSS into notebook metadata. If a notebook needs custom styling, include it in the relevant cell source/output and follow the notebook CSS scoping rule from the system prompt; Orion also exposes JupyterLab-compatible rendered-content selectors such as `.jp-MarkdownOutput`, `.jp-RenderedHTMLCommon`, and `.jp-OutputArea-output` for cell-authored styles.

State:

- `ui.get("key", default=None)`
- `ui.define_default("key", default)`
- `ui.set("key", value)`
- `ui.state()`

Use `ui.define_default("key", default)` when defining state separately from a component. It sets `default` only if no value exists yet and returns the current value:

```python
model = ui.define_default("model", "option A")
```

Component helpers such as `ui.select(..., default_value="option A")` and `ui.slider(..., default_value=0.7)` call this default behavior internally. Do not use `ui.set()` to define component defaults; `ui.set()` is for intentionally replacing state.

Use a component's `value=` argument only when intentionally forcing/resetting the current value on rerun:

```python
ui.select("model", options, default_value="option A", value="option A")
```

Charts:

- Use Plotly, Altair, Vega-Lite, or existing notebook chart libraries for charts.
- **Plotly theme (required):** Call `ui.theme.plotly()` once per kernel session (for example in a setup cell) before creating Plotly figures. It registers the Orion template and sets it as Plotly's default, so all later figures in that session inherit Orion styling automatically. Skip this only when the user explicitly asks for a different Plotly theme or custom styling.
- **Plotly mode bar:** Do not set `displayModeBar=True` in Plotly figure `config` (for example in `fig.show(config=...)` or the figure's `config` dict) unless the user explicitly asks for the Plotly toolbar (zoom, pan, download, etc.). Omit `displayModeBar` by default.
- Do not build a custom charting system with Orion UI primitives.

Example:

```python
import orion_ui as ui
import plotly.express as px

ui.theme.plotly()

px.line(df, x="date", y="value")
```

## Button actions

Buttons may explicitly run existing notebook cells:

```python
ui.button(
    "Run analysis",
    action={"type": "execute_cells", "cellIds": ["stable-orion-cell-id"]},
)
```

Only use this action when the target cell ids already exist in `cells[i].metadata.orion.id`. Never invent or edit Orion-managed cell ids. If you need to inspect ids or write App View metadata, consult `orion-metadata`.

## V1 behavior and limitations

- Orion renders `application/vnd.orion.ui+json`; other notebook frontends see static HTML/plain-text fallbacks.
- Control changes update Python-side `orion_ui` runtime state through Orion's silent kernel bridge.
- Rerunning a UI cell preserves existing control state when using `default_value`.
- Component `value` arguments intentionally force/reset current state on rerun.
- Control changes do not automatically rerun dependent cells.
- Users should rerun dependent cells manually or use an explicit `ui.button(..., action={"type": "execute_cells", ...})`.
- Components accept JSON-serializable props only.
- `Calendar`, `DatePicker`, and `DateTimePicker` use ISO-like `YYYY-MM-DD` strings in Python state for single dates.
- `Calendar` and `DatePicker` support `mode="range"`; range state is a JSON string such as `{"from":"2026-06-01","to":"2026-06-07"}`.
- `DateRangeSlider` also stores range state as a JSON string such as `{"from":"2026-06-01","to":"2026-06-07"}` and includes built-in quick presets when none are provided.
- Calendar-style components support `caption_layout="buttons"`, `"dropdown"`, or `"dropdown-buttons"` (dropdowns plus prev/next month buttons), `from_year`, `to_year`, `number_of_months`, `show_outside_days` (default `False`), and `presets=[{"label": "Today", "daysOffset": 0}]`.
- Do not rely on arbitrary Tailwind runtime class strings; Tailwind only includes classes known at build time.
- Do not use arbitrary React, custom component imports, inline `style`, or raw CSS inside Python UI code.
- Do not use `ipywidgets` or `anywidget` for Orion UI v1 unless the user explicitly asks for generic Jupyter compatibility.

## Install/runtime guidance

In Orion-managed runtimes, `orion_ui` is installed automatically into `~/.orion/runtime/venv` as part of startup (`orion-ui==<Orion version>`).

If a user is using an external Python kernel and `import orion_ui` fails, install the package into **that kernel's Python environment**:

```bash
python -m pip install orion-ui
```

For local development inside this repo:

```bash
cd python/orion-ui && python -m pip install -e .
# or: PYTHONPATH=python/orion-ui python -c "import orion_ui"
```

## Validation checklist

- The notebook code imports `orion_ui as ui`.
- The final expression in the UI cell is a `ui.Component`.
- Every control has a non-empty state key.
- Defaults are declared with component `default_value` arguments or `ui.define_default()`, not with `ui.set()` unless replacing state is intentional.
- `value=` is used only when intentionally forcing current state.
- Later cells read values with `ui.get()` or `ui.state()`.
- Button `execute_cells` actions reference real Orion cell ids.
- The UI uses Orion components for controls and existing plotting libraries for charts.
- Plotly work calls `ui.theme.plotly()` once per kernel session unless the user explicitly requested different styling.
- Plotly charts omit `displayModeBar=True` unless the user explicitly asked for the Plotly toolbar.
- App View metadata references the rendered `orion_ui` output instead of recreating controls directly in metadata.
- `ui.table()` supports pandas DataFrames in v1. The `source` argument is required so saved views can record readable pandas expressions.
- Use `column_descriptions={...}` on `ui.table()` when column headers need info-icon tooltip descriptions.
- Orion table filtering, sorting, grouping, stats, and exports run in the Python kernel through bounded row windows; the frontend must not materialize the full DataFrame.
