---
name: orion-ui
description: Builds Orion-native notebook UI outputs with the Python `orion_ui` package. Use when the user asks for ShadCN-like notebook controls, interactive notebook UI, Python-authored UI components, Orion UI MIME outputs, or notebook controls that also work in App View.
---

# Orion UI notebook components

Use this skill when the deliverable is a Python-authored UI inside an Orion notebook cell, rendered through Orion's native `application/vnd.orion.ui+json` MIME output.

Runtime interactivity belongs in notebook cells. App View metadata should arrange and label outputs; `orion_ui` cells should own sliders, selects, buttons, forms, and other behaviorful UI.

This is different from App View metadata authoring:

- Use `orion-ui` when writing Python code that imports `orion_ui as ui` and emits a UI output from a code cell.
- Use `create-app` when editing `metadata.orion.appView.schema` directly to arrange cells and outputs.
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
- `ui.separator()`

Controls:

- `ui.input("key", label=None, default_value="", value=<unset>, placeholder=None, input_type="text")`
- `ui.textarea("key", label=None, default_value="", value=<unset>, placeholder=None)`
- `ui.select("key", options, label=None, default_value=None, value=<unset>, placeholder=None)`
- `ui.slider("key", label=None, min=0, max=100, default_value=0, value=<unset>, step=1)`
- `ui.checkbox("key", label=None, default_value=False, value=<unset>)`
- `ui.switch("key", label=None, default_value=False, value=<unset>)`
- `ui.button(label, action=None, variant=None, size=None)`

Display:

- `ui.label(text)`
- `ui.badge(text, variant=None)`
- `ui.markdown_cell(cell_id=None, text=None)`
- `ui.output(cell_id, output_index=0)`

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
- For Plotly styling, call `ui.theme.plotly()` before creating figures.
- Do not build a custom charting system with Orion UI primitives.

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
- Do not use arbitrary React, custom component imports, raw CSS, `className`, or `style`.
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
- App View metadata references the rendered `orion_ui` output instead of recreating controls directly in metadata.
