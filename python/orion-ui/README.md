# orion-ui

Python library for building interactive notebook UI in [Orion](https://www.orion-agent.ai). Author controls in a code cell with `import orion_ui as ui`; Orion renders them as native notebook outputs.

This package is separate from **`orion-notebook`** (the `orion` CLI). Install `orion-ui` into the **same Python environment as your notebook kernel**.

## Install

```bash
pip install orion-ui
```

### Orion managed runtime

If you start Orion with `orion` and use its managed Jupyter environment (`~/.orion/runtime/venv` on macOS/Linux, `%USERPROFILE%\.orion\runtime\venv` on Windows), **`orion-ui` is installed automatically**. You do not need a separate install.

### External kernel (conda, venv, your own Jupyter)

Install into that kernel's Python:

```bash
python -m pip install orion-ui
```

Then restart the notebook kernel and re-run your cells.

## Quick example

Put a component tree as the **last expression** in a code cell:

```python
import orion_ui as ui

ui.card(
    ui.stack(
        ui.select("model", ["gpt-4.1", "claude-sonnet"], label="Model", default_value="gpt-4.1"),
        ui.slider("temperature", label="Temperature", min=0, max=2, default_value=0.7, step=0.1),
    ),
    title="Controls",
    class_name="controls-card",
)
```

Read values in later cells:

```python
model = ui.get("model")
temperature = ui.get("temperature")
```

## DataFrame tables

Use `ui.table()` for interactive pandas DataFrame browsing without sending the
entire DataFrame to the frontend:

```python
import orion_ui as ui

ui.table(df, source="df", page_size=50)
```

Table filtering, sorting, grouping, stats, and export requests run in the
Python kernel. Saved table views are stored on the notebook output metadata as
structured operations plus a readable pandas expression.

`class_name` adds semantic CSS hooks for Orion UI in Notebook View and App View. Do not write CSS into notebook metadata; if a notebook needs custom styling, include it in the relevant cell source/output and scope selectors to rendered markdown/output areas. Orion also exposes JupyterLab-compatible rendered-content selectors such as `.jp-MarkdownOutput`, `.jp-RenderedHTMLCommon`, and `.jp-OutputArea-output` for cell-authored styles. Do not rely on arbitrary Tailwind classes generated at runtime.

## Requirements

- Python 3.8+
- [Orion](https://www.orion-agent.ai) (or another frontend that renders `application/vnd.orion.ui+json`) for interactive display

Other Jupyter frontends may show a static fallback instead of live controls.

## Version coupling

Pin `orion-ui` to the same version as your Orion app when using managed runtimes (for example `orion-ui==0.6.0`). The Python output format and Orion's renderer are released together.

## Links

- [Orion website](https://www.orion-agent.ai)
- [User docs](https://docs.orion-agent.ai)
- [Fix: orion_ui import error](https://docs.orion-agent.ai/troubleshooting/orion-ui-import-error.html)
- [orion-notebook on PyPI](https://pypi.org/project/orion-notebook/) (CLI launcher)

## License

Apache-2.0
