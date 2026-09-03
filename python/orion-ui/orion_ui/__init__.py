"""Python authoring API for Orion-native notebook UI outputs."""

from __future__ import annotations

__version__ = "0.20.1"

import html
import json
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Union

from . import _runtime, _table as _table_runtime, theme

ORION_UI_MIME_TYPE = "application/vnd.orion.ui+json"
ORION_VERSIONED_OUTPUT_MIME_TYPE = "application/vnd.orion.versioned-output+json"
StateValue = Union[str, int, float, bool]
JsonValue = Union[None, str, int, float, bool, List["JsonValue"], Dict[str, "JsonValue"]]

_COMPONENT_TYPES = {
    "Page",
    "Stack",
    "Grid",
    "Section",
    "Card",
    "Tabs",
    "MarkdownCell",
    "Output",
    "Button",
    "Input",
    "Textarea",
    "Select",
    "Slider",
    "Checkbox",
    "Switch",
    "RadioGroup",
    "Toggle",
    "ToggleGroup",
    "Table",
    "Calendar",
    "DatePicker",
    "DateRangeSlider",
    "DateTimePicker",
    "Label",
    "Badge",
    "Separator",
    "Alert",
    "Progress",
    "Avatar",
    "Popover",
    "HoverCard",
    "Tooltip",
    "Carousel",
    "Collapsible",
    "Accordion",
}

_UNSET = object()


def _validate_json_value(value: Any, path: str) -> JsonValue:
    """Return a JSON-compatible value or raise a helpful type error."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (list, tuple)):
        return [_validate_json_value(entry, f"{path}[]") for entry in value]
    if isinstance(value, Mapping):
        result: Dict[str, JsonValue] = {}
        for key, entry in value.items():
            if not isinstance(key, str):
                raise TypeError(f"{path} keys must be strings.")
            result[key] = _validate_json_value(entry, f"{path}.{key}")
        return result
    raise TypeError(f"{path} must be JSON-serializable.")


def _props(**props: Any) -> Dict[str, JsonValue]:
    """Validate and drop unset component props."""
    result: Dict[str, JsonValue] = {}
    for key, value in props.items():
        if value is None:
            continue
        if key == "class_name" and not isinstance(value, str):
            raise TypeError("props.class_name must be a string.")
        result["className" if key == "class_name" else key] = _validate_json_value(
            value, f"props.{key}"
        )
    return result


def _coerce_children(children: Sequence[Any]) -> List["Component"]:
    """Normalize child arguments into Component instances."""
    normalized: List[Component] = []
    for child in children:
        if isinstance(child, Component):
            normalized.append(child)
        elif isinstance(child, str):
            normalized.append(label(child))
        else:
            raise TypeError("Orion UI children must be components or strings.")
    return normalized


def _value_type(value: StateValue) -> str:
    """Return the Orion binding value type label for a Python value."""
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    return "string"


def _default_date_range_value(days: int = 30) -> str:
    """Return a compact JSON date range ending on today's local date."""
    today = date.today()
    start = today - timedelta(days=max(1, days) - 1)
    return json.dumps(
        {"from": start.isoformat(), "to": today.isoformat()},
        separators=(",", ":"),
    )


@dataclass(frozen=True)
class Component:
    """Declarative Orion UI component that can render as a notebook MIME bundle."""

    type: str
    props: Dict[str, JsonValue] = field(default_factory=dict)
    children: List["Component"] = field(default_factory=list)
    output_id: str = field(default_factory=lambda: f"orion-ui-{uuid.uuid4().hex}")

    def __post_init__(self) -> None:
        """Validate component type and JSON-compatible props."""
        if self.type not in _COMPONENT_TYPES:
            raise ValueError(f"Unsupported Orion UI component type: {self.type}")
        _validate_json_value(self.props, "props")

    def _to_node(self) -> Dict[str, JsonValue]:
        """Serialize this component to the Orion UI primitive tree shape."""
        return {
            "type": self.type,
            "props": dict(self.props),
            "children": [child._to_node() for child in self.children],
        }

    def _collect_bindings(self) -> Dict[str, Dict[str, str]]:
        """Collect Python-state bindings declared by this tree."""
        bindings: Dict[str, Dict[str, str]] = {}
        state_key = self.props.get("stateKey")
        default_value = self.props.get("defaultValue")
        if isinstance(state_key, str) and isinstance(default_value, (str, int, float, bool)):
            bindings[state_key] = {
                "kind": "python_state",
                "valueType": _value_type(default_value),
            }
        if self.type == "DateTimePicker":
            for key_prop, default_prop in (
                ("startTimeKey", "startTimeDefaultValue"),
                ("endTimeKey", "endTimeDefaultValue"),
            ):
                time_key = self.props.get(key_prop)
                time_default = self.props.get(default_prop)
                if isinstance(time_key, str) and isinstance(
                    time_default, (str, int, float, bool)
                ):
                    bindings[time_key] = {
                        "kind": "python_state",
                        "valueType": _value_type(time_default),
                    }
        for child in self.children:
            bindings.update(child._collect_bindings())
        return bindings

    def _collect_state(self) -> Dict[str, StateValue]:
        """Collect current runtime values for state keys used by this tree."""
        state: Dict[str, StateValue] = {}
        for key in self._collect_bindings():
            value = _runtime.get_value(key)
            if isinstance(value, (str, int, float, bool)):
                state[key] = value
        return state

    def _payload(self) -> Dict[str, JsonValue]:
        """Build the JSON payload consumed by Orion's MIME renderer."""
        return {
            "version": 1,
            "id": self.output_id,
            "root": self._to_node(),
            "state": self._collect_state(),
            "bindings": self._collect_bindings(),
        }

    def _repr_mimebundle_(self, include: Any = None, exclude: Any = None) -> Dict[str, Any]:
        """Return Orion UI MIME plus static HTML/plain-text fallbacks."""
        payload = self._payload()
        return {
            ORION_UI_MIME_TYPE: payload,
            "text/html": self._repr_html_(),
            "text/plain": repr(self),
        }

    def _repr_html_(self) -> str:
        """Return a static fallback preview for non-Orion notebook frontends."""
        return _render_static_html(self)

    def __repr__(self) -> str:
        """Return a concise plain-text representation for terminal contexts."""
        return f"OrionUI({self.type}, id={self.output_id!r})"


def _get_ipython_shell() -> Any:
    """Return the active IPython shell without making IPython a package dependency."""
    try:
        from IPython import get_ipython
    except ImportError:
        return None
    return get_ipython()


def _fallback_mimebundle(value: Any) -> tuple[Dict[str, Any], Dict[str, Any]]:
    """Format a value outside IPython using its standard rich-repr hooks."""
    mimebundle = getattr(value, "_repr_mimebundle_", None)
    if callable(mimebundle):
        result = mimebundle()
        if isinstance(result, tuple) and len(result) == 2:
            data, metadata = result
            if isinstance(data, Mapping) and isinstance(metadata, Mapping):
                return dict(data), dict(metadata)
        if isinstance(result, Mapping):
            return dict(result), {}

    repr_hooks = (
        ("text/html", "_repr_html_"),
        ("image/svg+xml", "_repr_svg_"),
        ("image/png", "_repr_png_"),
        ("image/jpeg", "_repr_jpeg_"),
        ("text/markdown", "_repr_markdown_"),
        ("text/latex", "_repr_latex_"),
        ("application/json", "_repr_json_"),
    )
    data: Dict[str, Any] = {}
    for mime_type, hook_name in repr_hooks:
        hook = getattr(value, hook_name, None)
        if callable(hook):
            rendered = hook()
            if rendered is not None:
                data[mime_type] = rendered
    data.setdefault("text/plain", repr(value))
    return data, {}


def _close_inline_matplotlib_figure(value: Any) -> None:
    """Close a captured inline figure so IPython does not display it twice."""
    try:
        import matplotlib
        import matplotlib.pyplot as plt
        from matplotlib.figure import Figure
    except ImportError:
        return

    figure = value if isinstance(value, Figure) else getattr(value, "figure", None)
    if isinstance(figure, Figure) and "inline" in matplotlib.get_backend().lower():
        plt.close(figure)


def _fallback_matplotlib_mimebundle(value: Any) -> tuple[Dict[str, Any], Dict[str, Any]]:
    """Render a Matplotlib Figure or Axes as PNG when IPython has no figure formatter."""
    try:
        from IPython.core.pylabtools import print_figure
        from matplotlib.figure import Figure
    except ImportError:
        return {}, {}

    figure = value if isinstance(value, Figure) else getattr(value, "figure", None)
    if not isinstance(figure, Figure):
        return {}, {}
    png = print_figure(figure, fmt="png", base64=True)
    if not png:
        return {}, {}
    return {"image/png": png, "text/plain": repr(figure)}, {}


def _format_version_value(value: Any) -> tuple[Dict[str, Any], Dict[str, Any]]:
    """Format a versioned value and promote Matplotlib-like axes to their figure."""
    shell = _get_ipython_shell()

    def format_candidate(candidate: Any) -> tuple[Dict[str, Any], Dict[str, Any]]:
        if shell is not None and hasattr(shell, "display_formatter"):
            data, metadata = shell.display_formatter.format(candidate)
            return dict(data), dict(metadata)
        return _fallback_mimebundle(candidate)

    data, metadata = format_candidate(value)
    figure = getattr(value, "figure", None)
    has_rich_output = any(mime_type != "text/plain" for mime_type in data)
    if figure is not None and figure is not value and not has_rich_output:
        figure_data, figure_metadata = format_candidate(figure)
        if any(mime_type != "text/plain" for mime_type in figure_data):
            _close_inline_matplotlib_figure(value)
            return figure_data, figure_metadata
    if not has_rich_output:
        fallback_data, fallback_metadata = _fallback_matplotlib_mimebundle(value)
        if fallback_data:
            _close_inline_matplotlib_figure(value)
            return fallback_data, fallback_metadata
    _close_inline_matplotlib_figure(value)
    return data, metadata


@dataclass(frozen=True)
class VersionedOutput:
    """Display wrapper whose previous rich MIME representations Orion retains."""

    value: Any
    key: Optional[str] = None
    max_versions: int = 10

    def __post_init__(self) -> None:
        """Validate stable identity and retention options."""
        if self.key is not None and (not isinstance(self.key, str) or not self.key):
            raise ValueError("ui.version key must be a non-empty string or None.")
        if isinstance(self.max_versions, bool) or not isinstance(self.max_versions, int):
            raise TypeError("ui.version max_versions must be an integer.")
        if self.max_versions < 1:
            raise ValueError("ui.version max_versions must be at least 1.")

    def _repr_mimebundle_(self, include: Any = None, exclude: Any = None) -> Dict[str, Any]:
        """Return the current rich output plus Orion's version-history envelope."""
        data, metadata = _format_version_value(self.value)
        if ORION_VERSIONED_OUTPUT_MIME_TYPE in data:
            raise ValueError("ui.version cannot wrap another versioned output.")

        current: Dict[str, Any] = {
            "id": f"orion-version-{uuid.uuid4().hex}",
            "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "metadata": metadata,
        }
        payload: Dict[str, Any] = {
            "version": 1,
            "maxVersions": self.max_versions,
            "current": current,
            "history": [],
        }
        if self.key is not None:
            payload["key"] = self.key

        return {**data, ORION_VERSIONED_OUTPUT_MIME_TYPE: payload}

    def __repr__(self) -> str:
        """Return a concise terminal representation without formatting the value."""
        return f"VersionedOutput(key={self.key!r}, max_versions={self.max_versions})"


def _component(component_type: str, children: Sequence[Any] = (), **props: Any) -> Component:
    """Create a validated Orion UI component."""
    return Component(component_type, _props(**props), _coerce_children(children))


def _control(
    component_type: str,
    key: str,
    default_value: StateValue,
    value: Any = _UNSET,
    *,
    on_change: Optional[Mapping[str, Any]] = None,
    debounce_ms: Optional[int] = None,
    **props: Any,
) -> Component:
    """Create a state-bound control with optional change-action behavior."""
    if not isinstance(key, str) or not key:
        raise ValueError("Control key must be a non-empty string.")
    if on_change is not None and not isinstance(on_change, Mapping):
        raise TypeError("Control on_change must be a mapping or None.")
    if debounce_ms is not None:
        if isinstance(debounce_ms, bool) or not isinstance(debounce_ms, int):
            raise TypeError("Control debounce_ms must be a non-negative integer or None.")
        if debounce_ms < 0:
            raise ValueError("Control debounce_ms must be non-negative.")
    if value is _UNSET:
        define_default(key, default_value)
    else:
        if not isinstance(value, (str, int, float, bool)):
            raise TypeError("Control value must be a string, number, or boolean.")
        _runtime.set_value(key, value)
    return _component(
        component_type,
        stateKey=key,
        defaultValue=default_value,
        onChange=on_change,
        debounceMs=debounce_ms,
        **props,
    )


def page(
    *children: Any,
    gap: str = "md",
    padding: str = "md",
    class_name: Optional[str] = None,
) -> Component:
    """Create a top-level page container.

    Parameters
    ----------
    *children
        Child components or plain strings (coerced to labels).
    gap : str, optional
        Spacing between children. One of ``"none"``, ``"xs"``, ``"sm"``,
        ``"md"``, or ``"lg"``. Default is ``"md"``.
    padding : str, optional
        Inner padding. One of ``"none"``, ``"sm"``, ``"md"``, or ``"lg"``.
        Default is ``"md"``.
    class_name : str or None, optional
        Semantic CSS hook merged at render time (for example ``"metric-card"``).
        Default is ``None``.

    Returns
    -------
    Component
        A ``Page`` component node.
    """
    return _component(
        "Page",
        children,
        gap=gap,
        padding=padding,
        class_name=class_name,
    )


def stack(
    *children: Any,
    gap: str = "md",
    align: str = "stretch",
    class_name: Optional[str] = None,
) -> Component:
    """Create a vertical stack layout.

    Parameters
    ----------
    *children
        Child components or plain strings (coerced to labels).
    gap : str, optional
        Spacing between children. One of ``"none"``, ``"xs"``, ``"sm"``,
        ``"md"``, or ``"lg"``. Default is ``"md"``.
    align : str, optional
        Cross-axis alignment. One of ``"start"``, ``"center"``, ``"end"``, or
        ``"stretch"``. Default is ``"stretch"``.
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        A ``Stack`` component node.
    """
    return _component(
        "Stack",
        children,
        gap=gap,
        align=align,
        class_name=class_name,
    )


def grid(
    *children: Any,
    columns: int = 2,
    gap: str = "md",
    class_name: Optional[str] = None,
) -> Component:
    """Create a responsive grid layout.

    Parameters
    ----------
    *children
        Child components or plain strings (coerced to labels).
    columns : int, optional
        Number of columns. Must be ``1``, ``2``, ``3``, or ``4``. Other values
        fall back to a two-column layout. Default is ``2``.
    gap : str, optional
        Spacing between cells. One of ``"none"``, ``"xs"``, ``"sm"``, ``"md"``,
        or ``"lg"``. Default is ``"md"``.
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        A ``Grid`` component node.
    """
    return _component(
        "Grid",
        children,
        columns=columns,
        gap=gap,
        class_name=class_name,
    )


def section(
    *children: Any,
    title: Optional[str] = None,
    description: Optional[str] = None,
    gap: str = "md",
    padding: str = "md",
    class_name: Optional[str] = None,
) -> Component:
    """Create a titled section.

    Parameters
    ----------
    *children
        Child components or plain strings (coerced to labels).
    title : str or None, optional
        Section heading. Default is ``None``.
    description : str or None, optional
        Supporting text shown under the title. Default is ``None``.
    gap : str, optional
        Spacing between children. One of ``"none"``, ``"xs"``, ``"sm"``,
        ``"md"``, or ``"lg"``. Default is ``"md"``.
    padding : str, optional
        Inner padding. One of ``"none"``, ``"sm"``, ``"md"``, or ``"lg"``.
        Default is ``"md"``.
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        A ``Section`` component node.
    """
    return _component(
        "Section",
        children,
        title=title,
        description=description,
        gap=gap,
        padding=padding,
        class_name=class_name,
    )


def card(
    *children: Any,
    title: Optional[str] = None,
    description: Optional[str] = None,
    gap: str = "md",
    class_name: Optional[str] = None,
) -> Component:
    """Create a card container.

    Parameters
    ----------
    *children
        Child components or plain strings (coerced to labels).
    title : str or None, optional
        Card heading. Default is ``None``.
    description : str or None, optional
        Supporting text shown under the title. Default is ``None``.
    gap : str, optional
        Spacing between children. One of ``"none"``, ``"xs"``, ``"sm"``,
        ``"md"``, or ``"lg"``. Default is ``"md"``.
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        A ``Card`` component node.
    """
    return _component(
        "Card",
        children,
        title=title,
        description=description,
        gap=gap,
        class_name=class_name,
    )


def tabs(
    *children: Any,
    default_value: Optional[str] = None,
    class_name: Optional[str] = None,
) -> Component:
    """Create a tab container whose children act as panels.

    Parameters
    ----------
    *children
        Tab panel components or plain strings (coerced to labels).
    default_value : str or None, optional
        Value of the initially selected tab. Must match a child tab value when
        provided. Default is ``None`` (first tab selected).
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        A ``Tabs`` component node.
    """
    return _component(
        "Tabs",
        children,
        defaultValue=default_value,
        class_name=class_name,
    )


def table(
    dataframe: Any,
    *,
    source: str,
    mode: str = "paginated",
    page_size: int = 50,
    show_index: bool = True,
    max_cell_chars: int = 200,
    column_descriptions: Optional[Mapping[str, str]] = None,
    default_filters: Optional[Sequence[Mapping[str, Any]]] = None,
    default_sort: Optional[Mapping[str, str]] = None,
    class_name: Optional[str] = None,
) -> Component:
    """Create an interactive backend-backed table for a pandas DataFrame.

    Parameters
    ----------
    dataframe
        pandas ``DataFrame`` to display. The full DataFrame stays in Python and
        Orion receives only bounded row windows.
    source : str
        Python expression that recreates or references the DataFrame, such as
        ``"df"``. Saved views use this to record readable pandas expressions.
    mode : str, optional
        Initial loading mode. One of ``"paginated"`` or ``"virtual"``. Default
        is ``"paginated"``.
    page_size : int, optional
        Number of rows to fetch per page/window. Capped by Orion for safety.
        Default is ``50``.
    show_index : bool, optional
        Whether to include the DataFrame index as the first visible column.
        Default is ``True``.
    max_cell_chars : int, optional
        Maximum characters serialized for one non-scalar cell. Default is
        ``200``.
    column_descriptions : mapping of str to str or None, optional
        Per-column descriptions shown in Orion table headers as info tooltips.
        Keys should match DataFrame column names after string conversion. Use
        ``"__index__"`` to describe the index column. Default is ``None``.
    default_filters : sequence of mappings or None, optional
        Filters applied when the table first renders and whenever its Default
        view is reset. Each mapping has ``column``, ``operation``, and optional
        ``value`` keys. Operations match the dtype-aware table filter menu.
        Inclusive ``between`` values use ``{"lower": ..., "upper": ...}``;
        categorical ``in`` and ``notIn`` values use a sequence. Default is
        ``None``.
    default_sort : mapping or None, optional
        Sort applied when the table first renders and whenever its Default view
        is reset. Provide ``{"column": "score", "direction": "desc"}``.
        The table currently supports one sort at a time. Default is ``None``.
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        A ``Table`` component node backed by Python-side pandas operations.
    """
    table_id = f"orion-table-{uuid.uuid4().hex}"
    default_state = _table_runtime.default_table_state(
        dataframe,
        default_filters=default_filters,
        default_sort=default_sort,
    )
    registration = _table_runtime.register_table(
        dataframe,
        table_id=table_id,
        source=source,
        show_index=show_index,
        max_cell_chars=max_cell_chars,
        column_descriptions=column_descriptions,
    )
    payload = _table_runtime.table_payload(
        registration,
        mode=mode,
        page_size=page_size,
        default_state=default_state,
    )
    return _component("Table", (), **payload, class_name=class_name)


def button(
    label: str,
    *,
    action: Optional[Mapping[str, Any]] = None,
    variant: Optional[str] = None,
    size: Optional[str] = None,
    class_name: Optional[str] = None,
) -> Component:
    """Create a button, optionally with an Orion declarative action.

    Parameters
    ----------
    label : str
        Button label text.
    action : mapping or None, optional
        Declarative action dispatched on click. Supported shape::

            {"type": "execute_cells", "cellIds": ["stable-orion-cell-id"]}

        ``cellIds`` must reference existing ``cells[i].metadata.orion.id``
        values. Default is ``None`` (no action).
    variant : str or None, optional
        Visual style. One of ``"default"``, ``"secondary"``, ``"outline"``,
        ``"ghost"``, or ``"destructive"``. Unrecognized values fall back to
        ``"default"``. Default is ``None``.
    size : str or None, optional
        Button size. One of ``"default"``, ``"sm"``, or ``"lg"``. Unrecognized
        values fall back to ``"default"``. Default is ``None``.
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        A ``Button`` component node.
    """
    return _component(
        "Button",
        label=label,
        action=action,
        variant=variant,
        size=size,
        class_name=class_name,
    )


def input(
    key: str,
    *,
    label: Optional[str] = None,
    default_value: str = "",
    value: Any = _UNSET,
    placeholder: Optional[str] = None,
    input_type: str = "text",
    on_change: Optional[Mapping[str, Any]] = None,
    debounce_ms: Optional[int] = None,
    class_name: Optional[str] = None,
) -> Component:
    """Create a text input bound to Python state.

    Parameters
    ----------
    key : str
        Non-empty state key used by ``get()``, ``set()``, and ``state()``.
    label : str or None, optional
        Visible field label. Default is ``None``.
    default_value : str, optional
        Initial value when no runtime state exists yet. Default is ``""``.
    value
        When omitted, registers ``default_value`` without overwriting user
        input on rerun. When provided, must be a ``str``, ``int``, ``float``,
        or ``bool`` and forces that value into runtime state on rerun.
    placeholder : str or None, optional
        Placeholder hint shown when empty. Default is ``None``.
    input_type : str, optional
        HTML ``type`` attribute (for example ``"text"``, ``"email"``,
        ``"password"``, ``"number"``). Default is ``"text"``.
    on_change : mapping or None, optional
        Declarative action dispatched after changed state reaches Python.
    debounce_ms : int or None, optional
        Non-negative action debounce override. ``None`` uses smart defaults.
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        An ``Input`` component node bound to ``key``.
    """
    return _control(
        "Input",
        key,
        default_value,
        value,
        on_change=on_change,
        debounce_ms=debounce_ms,
        label=label,
        placeholder=placeholder,
        inputType=input_type,
        class_name=class_name,
    )


def textarea(
    key: str,
    *,
    label: Optional[str] = None,
    default_value: str = "",
    value: Any = _UNSET,
    placeholder: Optional[str] = None,
    on_change: Optional[Mapping[str, Any]] = None,
    debounce_ms: Optional[int] = None,
    class_name: Optional[str] = None,
) -> Component:
    """Create a textarea bound to Python state.

    Parameters
    ----------
    key : str
        Non-empty state key used by ``get()``, ``set()``, and ``state()``.
    label : str or None, optional
        Visible field label. Default is ``None``.
    default_value : str, optional
        Initial value when no runtime state exists yet. Default is ``""``.
    value
        When omitted, registers ``default_value`` without overwriting user
        input on rerun. When provided, must be a ``str``, ``int``, ``float``,
        or ``bool`` and forces that value into runtime state on rerun.
    placeholder : str or None, optional
        Placeholder hint shown when empty. Default is ``None``.
    on_change : mapping or None, optional
        Declarative action dispatched after changed state reaches Python.
    debounce_ms : int or None, optional
        Non-negative action debounce override. ``None`` uses smart defaults.
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        A ``Textarea`` component node bound to ``key``.
    """
    return _control(
        "Textarea",
        key,
        default_value,
        value,
        on_change=on_change,
        debounce_ms=debounce_ms,
        label=label,
        placeholder=placeholder,
        class_name=class_name,
    )


def select(
    key: str,
    options: Iterable[Union[str, Mapping[str, str]]],
    *,
    label: Optional[str] = None,
    default_value: Optional[str] = None,
    value: Any = _UNSET,
    placeholder: Optional[str] = None,
    on_change: Optional[Mapping[str, Any]] = None,
    debounce_ms: Optional[int] = None,
    class_name: Optional[str] = None,
) -> Component:
    """Create a select control bound to Python state.

    Parameters
    ----------
    key : str
        Non-empty state key used by ``get()``, ``set()``, and ``state()``.
    options : iterable of str or mapping
        Choices shown in the dropdown. Each entry may be a display string
        (used as both label and value) or a mapping with ``"value"`` and
        optional ``"label"`` keys.
    label : str or None, optional
        Visible field label. Default is ``None``.
    default_value : str or None, optional
        Initially selected option value. When ``None``, the first option's
        value is used. Default is ``None``.
    value
        When omitted, registers the resolved default without overwriting user
        selection on rerun. When provided, must be a ``str``, ``int``,
        ``float``, or ``bool`` and forces that value into runtime state on
        rerun.
    placeholder : str or None, optional
        Placeholder shown when no value is selected. Default is ``None``.
    on_change : mapping or None, optional
        Declarative action dispatched after changed state reaches Python.
    debounce_ms : int or None, optional
        Non-negative action debounce override. ``None`` uses smart defaults.
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        A ``Select`` component node bound to ``key``.
    """
    option_list = list(options)
    initial = default_value
    if initial is None:
        first = option_list[0] if option_list else ""
        initial = first if isinstance(first, str) else first.get("value", "")
    return _control(
        "Select",
        key,
        initial,
        value,
        on_change=on_change,
        debounce_ms=debounce_ms,
        label=label,
        options=option_list,
        placeholder=placeholder,
        class_name=class_name,
    )


def slider(
    key: str,
    *,
    label: Optional[str] = None,
    min: Union[int, float] = 0,
    max: Union[int, float] = 100,
    default_value: Union[int, float] = 0,
    value: Any = _UNSET,
    step: Union[int, float] = 1,
    on_change: Optional[Mapping[str, Any]] = None,
    debounce_ms: Optional[int] = None,
    class_name: Optional[str] = None,
) -> Component:
    """Create a numeric slider bound to Python state.

    Parameters
    ----------
    key : str
        Non-empty state key used by ``get()``, ``set()``, and ``state()``.
    label : str or None, optional
        Visible field label. Default is ``None``.
    min : int or float, optional
        Minimum slider value. Default is ``0``.
    max : int or float, optional
        Maximum slider value. Default is ``100``.
    default_value : int or float, optional
        Initial value when no runtime state exists yet. Default is ``0``.
    value
        When omitted, registers ``default_value`` without overwriting user
        input on rerun. When provided, must be a ``str``, ``int``, ``float``,
        or ``bool`` and forces that value into runtime state on rerun.
    step : int or float, optional
        Increment between allowed values. Default is ``1``.
    on_change : mapping or None, optional
        Declarative action dispatched after changed state reaches Python.
    debounce_ms : int or None, optional
        Non-negative action debounce override. ``None`` uses smart defaults.
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        A ``Slider`` component node bound to ``key``.
    """
    return _control(
        "Slider",
        key,
        default_value,
        value,
        on_change=on_change,
        debounce_ms=debounce_ms,
        label=label,
        min=min,
        max=max,
        step=step,
        class_name=class_name,
    )


def checkbox(
    key: str,
    *,
    label: Optional[str] = None,
    default_value: bool = False,
    value: Any = _UNSET,
    on_change: Optional[Mapping[str, Any]] = None,
    debounce_ms: Optional[int] = None,
    class_name: Optional[str] = None,
) -> Component:
    """Create a checkbox bound to Python state.

    Parameters
    ----------
    key : str
        Non-empty state key used by ``get()``, ``set()``, and ``state()``.
    label : str or None, optional
        Visible field label. Default is ``None``.
    default_value : bool, optional
        Initial checked state when no runtime state exists yet. Default is
        ``False``.
    value
        When omitted, registers ``default_value`` without overwriting user
        input on rerun. When provided, must be a ``str``, ``int``, ``float``,
        or ``bool`` and forces that value into runtime state on rerun.
    on_change : mapping or None, optional
        Declarative action dispatched after changed state reaches Python.
    debounce_ms : int or None, optional
        Non-negative action debounce override. ``None`` uses smart defaults.
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        A ``Checkbox`` component node bound to ``key``.
    """
    return _control(
        "Checkbox",
        key,
        default_value,
        value,
        on_change=on_change,
        debounce_ms=debounce_ms,
        label=label,
        class_name=class_name,
    )


def switch(
    key: str,
    *,
    label: Optional[str] = None,
    default_value: bool = False,
    value: Any = _UNSET,
    on_change: Optional[Mapping[str, Any]] = None,
    debounce_ms: Optional[int] = None,
    class_name: Optional[str] = None,
) -> Component:
    """Create a switch bound to Python state.

    Parameters
    ----------
    key : str
        Non-empty state key used by ``get()``, ``set()``, and ``state()``.
    label : str or None, optional
        Visible field label. Default is ``None``.
    default_value : bool, optional
        Initial on/off state when no runtime state exists yet. Default is
        ``False``.
    value
        When omitted, registers ``default_value`` without overwriting user
        input on rerun. When provided, must be a ``str``, ``int``, ``float``,
        or ``bool`` and forces that value into runtime state on rerun.
    on_change : mapping or None, optional
        Declarative action dispatched after changed state reaches Python.
    debounce_ms : int or None, optional
        Non-negative action debounce override. ``None`` uses smart defaults.
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        A ``Switch`` component node bound to ``key``.
    """
    return _control(
        "Switch",
        key,
        default_value,
        value,
        on_change=on_change,
        debounce_ms=debounce_ms,
        label=label,
        class_name=class_name,
    )


def radio_group(
    key: str,
    options: Iterable[Union[str, Mapping[str, str]]],
    *,
    label: Optional[str] = None,
    default_value: Optional[str] = None,
    value: Any = _UNSET,
    on_change: Optional[Mapping[str, Any]] = None,
    debounce_ms: Optional[int] = None,
    class_name: Optional[str] = None,
) -> Component:
    """Create a radio group bound to Python state.

    Parameters
    ----------
    key : str
        Non-empty state key used by ``get()``, ``set()``, and ``state()``.
    options : iterable of str or mapping
        Mutually exclusive choices. Each entry may be a display string (used
        as both label and value) or a mapping with ``"value"`` and optional
        ``"label"`` keys.
    label : str or None, optional
        Visible group label. Default is ``None``.
    default_value : str or None, optional
        Initially selected option value. When ``None``, the first option's
        value is used. Default is ``None``.
    value
        When omitted, registers the resolved default without overwriting user
        selection on rerun. When provided, must be a ``str``, ``int``,
        ``float``, or ``bool`` and forces that value into runtime state on
        rerun.
    on_change : mapping or None, optional
        Declarative action dispatched after changed state reaches Python.
    debounce_ms : int or None, optional
        Non-negative action debounce override. ``None`` uses smart defaults.
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        A ``RadioGroup`` component node bound to ``key``.
    """
    option_list = list(options)
    initial = default_value
    if initial is None:
        first = option_list[0] if option_list else ""
        initial = first if isinstance(first, str) else first.get("value", "")
    return _control(
        "RadioGroup",
        key,
        initial,
        value,
        on_change=on_change,
        debounce_ms=debounce_ms,
        label=label,
        options=option_list,
        class_name=class_name,
    )


def toggle(
    key: str,
    *,
    label: Optional[str] = None,
    default_value: bool = False,
    value: Any = _UNSET,
    variant: Optional[str] = None,
    on_change: Optional[Mapping[str, Any]] = None,
    debounce_ms: Optional[int] = None,
    class_name: Optional[str] = None,
) -> Component:
    """Create a boolean toggle bound to Python state.

    Parameters
    ----------
    key : str
        Non-empty state key used by ``get()``, ``set()``, and ``state()``.
    label : str or None, optional
        Visible field label. Default is ``None``.
    default_value : bool, optional
        Initial pressed state when no runtime state exists yet. Default is
        ``False``.
    value
        When omitted, registers ``default_value`` without overwriting user
        input on rerun. When provided, must be a ``str``, ``int``, ``float``,
        or ``bool`` and forces that value into runtime state on rerun.
    variant : str or None, optional
        Visual style. One of ``"default"`` or ``"outline"``. Unrecognized
        values fall back to ``"default"``. Default is ``None``.
    on_change : mapping or None, optional
        Declarative action dispatched after changed state reaches Python.
    debounce_ms : int or None, optional
        Non-negative action debounce override. ``None`` uses smart defaults.
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        A ``Toggle`` component node bound to ``key``.
    """
    return _control(
        "Toggle",
        key,
        default_value,
        value,
        on_change=on_change,
        debounce_ms=debounce_ms,
        label=label,
        variant=variant,
        class_name=class_name,
    )


def toggle_group(
    key: str,
    options: Iterable[Union[str, Mapping[str, str]]],
    *,
    label: Optional[str] = None,
    default_value: Optional[str] = None,
    value: Any = _UNSET,
    variant: Optional[str] = None,
    on_change: Optional[Mapping[str, Any]] = None,
    debounce_ms: Optional[int] = None,
    class_name: Optional[str] = None,
) -> Component:
    """Create a toggle group bound to Python state.

    Parameters
    ----------
    key : str
        Non-empty state key used by ``get()``, ``set()``, and ``state()``.
    options : iterable of str or mapping
        Exclusive toggle choices. Each entry may be a display string (used as
        both label and value) or a mapping with ``"value"`` and optional
        ``"label"`` keys.
    label : str or None, optional
        Visible group label. Default is ``None``.
    default_value : str or None, optional
        Initially selected option value. When ``None``, the first option's
        value is used. Default is ``None``.
    value
        When omitted, registers the resolved default without overwriting user
        selection on rerun. When provided, must be a ``str``, ``int``,
        ``float``, or ``bool`` and forces that value into runtime state on
        rerun.
    variant : str or None, optional
        Visual style. One of ``"default"`` or ``"outline"``. Unrecognized
        values fall back to ``"default"``. Default is ``None``.
    on_change : mapping or None, optional
        Declarative action dispatched after changed state reaches Python.
    debounce_ms : int or None, optional
        Non-negative action debounce override. ``None`` uses smart defaults.
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        A ``ToggleGroup`` component node bound to ``key``.
    """
    option_list = list(options)
    initial = default_value
    if initial is None:
        first = option_list[0] if option_list else ""
        initial = first if isinstance(first, str) else first.get("value", "")
    return _control(
        "ToggleGroup",
        key,
        initial,
        value,
        on_change=on_change,
        debounce_ms=debounce_ms,
        label=label,
        options=option_list,
        variant=variant,
        class_name=class_name,
    )


def calendar(
    key: str,
    *,
    label: Optional[str] = None,
    mode: str = "single",
    default_value: str = "",
    value: Any = _UNSET,
    caption_layout: Optional[str] = None,
    from_year: Optional[int] = None,
    to_year: Optional[int] = None,
    number_of_months: Optional[int] = None,
    show_outside_days: bool = False,
    presets: Optional[Sequence[Mapping[str, Any]]] = None,
    on_change: Optional[Mapping[str, Any]] = None,
    debounce_ms: Optional[int] = None,
    class_name: Optional[str] = None,
) -> Component:
    """Create a calendar bound to ISO date or JSON range string Python state.

    Parameters
    ----------
    key : str
        Non-empty state key used by ``get()``, ``set()``, and ``state()``.
    label : str or None, optional
        Visible field label. Default is ``None``.
    mode : str, optional
        Selection mode. ``"single"`` stores one ``"YYYY-MM-DD"`` string;
        ``"range"`` stores a JSON string such as
        ``'{"from":"2026-06-01","to":"2026-06-07"}'``. Any value other than
        ``"range"`` is treated as ``"single"``. Default is ``"single"``.
    default_value : str, optional
        Initial date value in the same format as ``mode`` expects. Default is
        ``""``.
    value
        When omitted, registers ``default_value`` without overwriting user
        selection on rerun. When provided, must be a ``str``, ``int``,
        ``float``, or ``bool`` and forces that value into runtime state on
        rerun.
    caption_layout : str or None, optional
        Month/year navigation UI. One of ``"buttons"``, ``"dropdown"``, or
        ``"dropdown-buttons"``. ``"dropdown"`` shows month/year selects only;
        ``"dropdown-buttons"`` adds previous/next month buttons alongside the
        selects. Unrecognized values use the renderer default. Default is
        ``None``.
    from_year : int or None, optional
        Earliest selectable year when using dropdown caption layouts. Default
        is ``None``.
    to_year : int or None, optional
        Latest selectable year when using dropdown caption layouts. Default is
        ``None``.
    number_of_months : int or None, optional
        Positive number of months shown side by side. Non-positive values are
        ignored. Default is ``None`` (single month).
    show_outside_days : bool, optional
        When ``True``, days from adjacent months fill the leading/trailing week
        rows. When ``False``, those cells are left empty. Default is ``False``.
    presets : sequence of mapping or None, optional
        Quick-pick buttons rendered below the calendar. Each mapping must
        include ``"label"`` and may include any of ``"value"`` (ISO date),
        ``"from"``, ``"to"``, ``"daysOffset"``, ``"fromDaysOffset"``, or
        ``"toDaysOffset"``. Default is ``None``.
    on_change : mapping or None, optional
        Declarative action dispatched after changed state reaches Python.
    debounce_ms : int or None, optional
        Non-negative action debounce override. ``None`` uses smart defaults.
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        A ``Calendar`` component node bound to ``key``.
    """
    return _control(
        "Calendar",
        key,
        default_value,
        value,
        on_change=on_change,
        debounce_ms=debounce_ms,
        label=label,
        mode=mode,
        captionLayout=caption_layout,
        fromYear=from_year,
        toYear=to_year,
        numberOfMonths=number_of_months,
        showOutsideDays=show_outside_days,
        presets=presets,
        class_name=class_name,
    )


def date_picker(
    key: str,
    *,
    label: Optional[str] = None,
    mode: str = "single",
    default_value: str = "",
    value: Any = _UNSET,
    placeholder: Optional[str] = None,
    caption_layout: Optional[str] = None,
    from_year: Optional[int] = None,
    to_year: Optional[int] = None,
    number_of_months: Optional[int] = None,
    show_outside_days: bool = False,
    presets: Optional[Sequence[Mapping[str, Any]]] = None,
    on_change: Optional[Mapping[str, Any]] = None,
    debounce_ms: Optional[int] = None,
    class_name: Optional[str] = None,
) -> Component:
    """Create a popover date picker bound to ISO date or JSON range string state.

    Parameters
    ----------
    key : str
        Non-empty state key used by ``get()``, ``set()``, and ``state()``.
    label : str or None, optional
        Visible field label. Default is ``None``.
    mode : str, optional
        Selection mode. ``"single"`` stores one ``"YYYY-MM-DD"`` string;
        ``"range"`` stores a JSON string such as
        ``'{"from":"2026-06-01","to":"2026-06-07"}'``. Any value other than
        ``"range"`` is treated as ``"single"``. Default is ``"single"``.
    default_value : str, optional
        Initial date value in the same format as ``mode`` expects. Default is
        ``""``.
    value
        When omitted, registers ``default_value`` without overwriting user
        selection on rerun. When provided, must be a ``str``, ``int``,
        ``float``, or ``bool`` and forces that value into runtime state on
        rerun.
    placeholder : str or None, optional
        Trigger button placeholder when no date is selected. Default is
        ``None`` (renderer uses ``"Pick a date"`` or ``"Pick a date range"``).
    caption_layout : str or None, optional
        Month/year navigation UI. One of ``"buttons"``, ``"dropdown"``, or
        ``"dropdown-buttons"``. ``"dropdown"`` shows month/year selects only;
        ``"dropdown-buttons"`` adds previous/next month buttons alongside the
        selects. Unrecognized values use the renderer default. Default is
        ``None``.
    from_year : int or None, optional
        Earliest selectable year when using dropdown caption layouts. Default
        is ``None``.
    to_year : int or None, optional
        Latest selectable year when using dropdown caption layouts. Default is
        ``None``.
    number_of_months : int or None, optional
        Positive number of months shown in the popover calendar. Non-positive
        values are ignored. Default is ``None`` (single month).
    show_outside_days : bool, optional
        When ``True``, days from adjacent months fill the leading/trailing week
        rows. When ``False``, those cells are left empty. Default is ``False``.
    presets : sequence of mapping or None, optional
        Quick-pick buttons rendered below the calendar. Each mapping must
        include ``"label"`` and may include any of ``"value"`` (ISO date),
        ``"from"``, ``"to"``, ``"daysOffset"``, ``"fromDaysOffset"``, or
        ``"toDaysOffset"``. Default is ``None``.
    on_change : mapping or None, optional
        Declarative action dispatched after changed state reaches Python.
    debounce_ms : int or None, optional
        Non-negative action debounce override. ``None`` uses smart defaults.
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        A ``DatePicker`` component node bound to ``key``.
    """
    return _control(
        "DatePicker",
        key,
        default_value,
        value,
        on_change=on_change,
        debounce_ms=debounce_ms,
        label=label,
        mode=mode,
        placeholder=placeholder,
        captionLayout=caption_layout,
        fromYear=from_year,
        toYear=to_year,
        numberOfMonths=number_of_months,
        showOutsideDays=show_outside_days,
        presets=presets,
        class_name=class_name,
    )


def date_range_slider(
    key: str,
    *,
    label: Optional[str] = None,
    default_value: Optional[str] = None,
    value: Any = _UNSET,
    visible_months: int = 4,
    min_days: int = 1,
    presets: Optional[Sequence[Mapping[str, Any]]] = None,
    on_change: Optional[Mapping[str, Any]] = None,
    debounce_ms: Optional[int] = None,
    class_name: Optional[str] = None,
) -> Component:
    """Create an animated timeline date range slider bound to Python state.

    The control stores a JSON string such as
    ``'{"from":"2026-06-01","to":"2026-06-07"}'``. Users can click presets,
    drag the selected range, drag either endpoint, or page the visible months.

    Parameters
    ----------
    key : str
        Non-empty state key used by ``get()``, ``set()``, and ``state()``.
    label : str or None, optional
        Accessible group label for the slider. Default is ``None``.
    default_value : str or None, optional
        Initial range JSON string. When ``None``, defaults to the last 30 days
        ending today. Default is ``None``.
    value
        When omitted, registers ``default_value`` without overwriting user
        selection on rerun. When provided, must be a ``str``, ``int``,
        ``float``, or ``bool`` and forces that value into runtime state on
        rerun.
    visible_months : int, optional
        Number of months visible in the timeline, clamped by the renderer to a
        compact range. Default is ``4``.
    min_days : int, optional
        Minimum inclusive range length while dragging endpoints. Default is
        ``1``.
    presets : sequence of mapping or None, optional
        Quick-pick buttons. Each mapping must include ``"label"`` and may
        include ``"from"``, ``"to"``, ``"fromDaysOffset"``,
        ``"toDaysOffset"``, ``"value"``, or ``"daysOffset"``. When omitted,
        Orion renders ``"This month"``, ``"Last 7D"``, ``"30D"``, and
        ``"90D"`` presets.
    on_change : mapping or None, optional
        Declarative action dispatched after changed state reaches Python.
    debounce_ms : int or None, optional
        Non-negative action debounce override. ``None`` uses smart defaults.
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        A ``DateRangeSlider`` component node bound to ``key``.
    """
    resolved_default = default_value or _default_date_range_value()
    return _control(
        "DateRangeSlider",
        key,
        resolved_default,
        value,
        on_change=on_change,
        debounce_ms=debounce_ms,
        label=label,
        visibleMonths=visible_months,
        minDays=min_days,
        presets=presets,
        class_name=class_name,
    )


def date_time_picker(
    key: str,
    *,
    label: Optional[str] = None,
    default_value: str = "",
    value: Any = _UNSET,
    start_time_key: Optional[str] = None,
    end_time_key: Optional[str] = None,
    start_time_label: str = "Start time",
    end_time_label: str = "End time",
    default_start_time: str = "09:00:00",
    default_end_time: str = "17:00:00",
    caption_layout: Optional[str] = None,
    from_year: Optional[int] = None,
    to_year: Optional[int] = None,
    show_outside_days: bool = False,
    presets: Optional[Sequence[Mapping[str, Any]]] = None,
    on_change: Optional[Mapping[str, Any]] = None,
    debounce_ms: Optional[int] = None,
    class_name: Optional[str] = None,
) -> Component:
    """Create a date picker paired with start and end time inputs.

    The date portion uses ``key`` and stores a ``"YYYY-MM-DD"`` string. Start
    and end times are bound to separate state keys as ``"HH:MM:SS"`` strings.

    Parameters
    ----------
    key : str
        Non-empty state key for the selected date.
    label : str or None, optional
        Visible field label for the date portion. Default is ``None``.
    default_value : str, optional
        Initial date as ``"YYYY-MM-DD"`` when no runtime state exists yet.
        Default is ``""``.
    value
        When omitted, registers ``default_value`` without overwriting user
        selection on rerun. When provided, must be a ``str``, ``int``,
        ``float``, or ``bool`` and forces that value into runtime state on
        rerun.
    start_time_key : str or None, optional
        State key for the start time. Default is ``"{key}_start_time"``.
    end_time_key : str or None, optional
        State key for the end time. Default is ``"{key}_end_time"``.
    start_time_label : str, optional
        Label shown beside the start time input. Default is ``"Start time"``.
    end_time_label : str, optional
        Label shown beside the end time input. Default is ``"End time"``.
    default_start_time : str, optional
        Initial start time as ``"HH:MM:SS"``. Default is ``"09:00:00"``.
    default_end_time : str, optional
        Initial end time as ``"HH:MM:SS"``. Default is ``"17:00:00"``.
    caption_layout : str or None, optional
        Month/year navigation UI. One of ``"buttons"``, ``"dropdown"``, or
        ``"dropdown-buttons"``. ``"dropdown"`` shows month/year selects only;
        ``"dropdown-buttons"`` adds previous/next month buttons alongside the
        selects. Unrecognized values use the renderer default. Default is
        ``None``.
    from_year : int or None, optional
        Earliest selectable year when using dropdown caption layouts. Default
        is ``None``.
    to_year : int or None, optional
        Latest selectable year when using dropdown caption layouts. Default is
        ``None``.
    show_outside_days : bool, optional
        When ``True``, days from adjacent months fill the leading/trailing week
        rows. When ``False``, those cells are left empty. Default is ``False``.
    presets : sequence of mapping or None, optional
        Quick-pick date buttons. Each mapping must include ``"label"`` and may
        include ``"value"`` (ISO date) or ``"daysOffset"``. Default is
        ``None``.
    on_change : mapping or None, optional
        Declarative action shared by date, start-time, and end-time changes.
    debounce_ms : int or None, optional
        Non-negative action debounce override. ``None`` uses smart defaults.
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        A ``DateTimePicker`` component node bound to ``key`` and the resolved
        time keys.
    """
    resolved_start_time_key = start_time_key or f"{key}_start_time"
    resolved_end_time_key = end_time_key or f"{key}_end_time"
    define_default(resolved_start_time_key, default_start_time)
    define_default(resolved_end_time_key, default_end_time)
    return _control(
        "DateTimePicker",
        key,
        default_value,
        value,
        on_change=on_change,
        debounce_ms=debounce_ms,
        label=label,
        mode="single",
        startTimeKey=resolved_start_time_key,
        endTimeKey=resolved_end_time_key,
        startTimeLabel=start_time_label,
        endTimeLabel=end_time_label,
        startTimeDefaultValue=default_start_time,
        endTimeDefaultValue=default_end_time,
        captionLayout=caption_layout,
        fromYear=from_year,
        toYear=to_year,
        showOutsideDays=show_outside_days,
        presets=presets,
        class_name=class_name,
    )


def label(text: str, *, class_name: Optional[str] = None) -> Component:
    """Create a text label.

    Parameters
    ----------
    text : str
        Label text content.
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        A ``Label`` component node.
    """
    return _component("Label", text=text, class_name=class_name)


def badge(
    text: str,
    *,
    variant: Optional[str] = None,
    class_name: Optional[str] = None,
) -> Component:
    """Create a status badge.

    Parameters
    ----------
    text : str
        Badge label text.
    variant : str or None, optional
        Visual style. One of ``"default"``, ``"secondary"``, ``"destructive"``,
        or ``"outline"``. Unrecognized values fall back to ``"default"``.
        Default is ``None``.
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        A ``Badge`` component node.
    """
    return _component("Badge", text=text, variant=variant, class_name=class_name)


def separator(*, class_name: Optional[str] = None) -> Component:
    """Create a horizontal separator.

    Parameters
    ----------
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        A ``Separator`` component node.
    """
    return _component("Separator", class_name=class_name)


def alert(
    *children: Any,
    title: Optional[str] = None,
    description: Optional[str] = None,
    text: Optional[str] = None,
    variant: Optional[str] = None,
    class_name: Optional[str] = None,
) -> Component:
    """Create an inline alert message.

    Parameters
    ----------
    *children
        Optional child components or plain strings (coerced to labels).
    title : str or None, optional
        Alert heading. Default is ``None``.
    description : str or None, optional
        Alert body text. Default is ``None``.
    text : str or None, optional
        Alias for ``description`` when ``description`` is not provided.
        Default is ``None``.
    variant : str or None, optional
        Visual style. One of ``"default"`` or ``"destructive"``. Unrecognized
        values fall back to ``"default"``. Default is ``None``.
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        An ``Alert`` component node.
    """
    return _component(
        "Alert",
        children,
        title=title,
        description=description or text,
        variant=variant,
        class_name=class_name,
    )


def progress(
    key: Optional[str] = None,
    *,
    label: Optional[str] = None,
    default_value: Union[int, float] = 0,
    value: Any = _UNSET,
    max: Union[int, float] = 100,
    class_name: Optional[str] = None,
) -> Component:
    """Create a progress bar from static or Python-bound numeric state.

    Parameters
    ----------
    key : str or None, optional
        When provided, binds the current value to this state key. When
        ``None``, the bar displays ``default_value`` only. Default is
        ``None``.
    label : str or None, optional
        Visible label above the bar. Default is ``None``.
    default_value : int or float, optional
        Initial progress value when ``key`` is set and no runtime state exists
        yet, or the static value when ``key`` is ``None``. Default is ``0``.
    value
        When ``key`` is set and ``value`` is omitted, registers
        ``default_value`` without overwriting user input on rerun. When
        provided with ``key``, must be a ``str``, ``int``, ``float``, or
        ``bool`` and forces that value into runtime state on rerun. Ignored
        when ``key`` is ``None``.
    max : int or float, optional
        Maximum progress value (100% fill). Default is ``100``.
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        A ``Progress`` component node.
    """
    if key:
        return _control(
            "Progress",
            key,
            default_value,
            value,
            label=label,
            max=max,
            class_name=class_name,
        )
    return _component(
        "Progress",
        defaultValue=default_value,
        label=label,
        max=max,
        class_name=class_name,
    )


def avatar(
    *,
    src: Optional[str] = None,
    alt: Optional[str] = None,
    fallback: Optional[str] = None,
    label: Optional[str] = None,
    size: Optional[str] = None,
    class_name: Optional[str] = None,
) -> Component:
    """Create an avatar image with optional fallback text.

    Parameters
    ----------
    src : str or None, optional
        Image URL. Default is ``None``.
    alt : str or None, optional
        Accessible alt text for the image. Default is ``None``.
    fallback : str or None, optional
        Text shown when ``src`` is missing or fails to load. Default is
        ``None``.
    label : str or None, optional
        Alias used as fallback text when ``fallback`` is not set. Default is
        ``None``.
    size : str or None, optional
        Avatar dimensions. One of ``"sm"``, ``"md"``, or ``"lg"``. Unrecognized
        values fall back to ``"md"``. Default is ``None``.
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        An ``Avatar`` component node.
    """
    return _component(
        "Avatar",
        src=src,
        alt=alt,
        fallback=fallback,
        label=label,
        size=size,
        class_name=class_name,
    )


def popover(
    *children: Any,
    label: Optional[str] = None,
    trigger: Optional[str] = None,
    text: Optional[str] = None,
    content: Optional[str] = None,
    description: Optional[str] = None,
    class_name: Optional[str] = None,
) -> Component:
    """Create a popover with a button trigger and child content.

    Parameters
    ----------
    *children
        Content shown inside the popover panel.
    label : str or None, optional
        Trigger button label. Used when ``trigger`` and ``text`` are not set.
        Default is ``None``.
    trigger : str or None, optional
        Trigger button label (preferred over ``label``). Default is ``None``.
    text : str or None, optional
        Trigger button label alias. Default is ``None``.
    content : str or None, optional
        Inline body text when no ``children`` are provided. Default is
        ``None``.
    description : str or None, optional
        Supporting text shown with ``content``. Default is ``None``.
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        A ``Popover`` component node.
    """
    return _component(
        "Popover",
        children,
        label=label,
        trigger=trigger,
        text=text,
        content=content,
        description=description,
        class_name=class_name,
    )


def hover_card(
    *children: Any,
    label: Optional[str] = None,
    trigger: Optional[str] = None,
    text: Optional[str] = None,
    content: Optional[str] = None,
    description: Optional[str] = None,
    class_name: Optional[str] = None,
) -> Component:
    """Create a hover card with a text trigger and child content.

    Parameters
    ----------
    *children
        Content shown inside the hover card panel.
    label : str or None, optional
        Trigger link text. Used when ``trigger`` and ``text`` are not set.
        Default is ``None``.
    trigger : str or None, optional
        Trigger link text (preferred over ``label``). Default is ``None``.
    text : str or None, optional
        Trigger link text alias. Default is ``None``.
    content : str or None, optional
        Inline body text when no ``children`` are provided. Default is
        ``None``.
    description : str or None, optional
        Supporting text shown with ``content``. Default is ``None``.
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        A ``HoverCard`` component node.
    """
    return _component(
        "HoverCard",
        children,
        label=label,
        trigger=trigger,
        text=text,
        content=content,
        description=description,
        class_name=class_name,
    )


def tooltip(
    *children: Any,
    label: Optional[str] = None,
    trigger: Optional[str] = None,
    text: Optional[str] = None,
    content: Optional[str] = None,
    description: Optional[str] = None,
    class_name: Optional[str] = None,
) -> Component:
    """Create a tooltip around a button trigger.

    Parameters
    ----------
    *children
        Optional content rendered inside the tooltip (in addition to text
        props).
    label : str or None, optional
        Trigger button label. Used when ``trigger`` and ``text`` are not set.
        Default is ``None``.
    trigger : str or None, optional
        Trigger button label (preferred over ``label``). Default is ``None``.
    text : str or None, optional
        Tooltip body text or trigger label alias. Default is ``None``.
    content : str or None, optional
        Tooltip body text alias for ``text``. Default is ``None``.
    description : str or None, optional
        Supporting tooltip text shown with ``content`` or ``text``. Default is
        ``None``.
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        A ``Tooltip`` component node.
    """
    return _component(
        "Tooltip",
        children,
        label=label,
        trigger=trigger,
        text=text,
        content=content,
        description=description,
        class_name=class_name,
    )


def carousel(
    *children: Any,
    orientation: str = "horizontal",
    show_controls: bool = True,
    class_name: Optional[str] = None,
) -> Component:
    """Create a carousel whose children become slides.

    Parameters
    ----------
    *children
        Slide components or plain strings (coerced to labels).
    orientation : str, optional
        Scroll axis. ``"vertical"`` stacks slides vertically; any other value
        uses horizontal layout. Default is ``"horizontal"``.
    show_controls : bool, optional
        Whether previous/next controls are shown. Default is ``True``.
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        A ``Carousel`` component node.
    """
    return _component(
        "Carousel",
        children,
        orientation=orientation,
        showControls=show_controls,
        class_name=class_name,
    )


def collapsible(
    *children: Any,
    label: Optional[str] = None,
    title: Optional[str] = None,
    default_open: bool = False,
    content: Optional[str] = None,
    description: Optional[str] = None,
    class_name: Optional[str] = None,
) -> Component:
    """Create a collapsible section with a trigger label.

    Parameters
    ----------
    *children
        Content shown when expanded.
    label : str or None, optional
        Trigger button label. Used when ``title`` is not set. Default is
        ``None``.
    title : str or None, optional
        Trigger button label (preferred over ``label``). Default is ``None``.
    default_open : bool, optional
        Whether the section starts expanded. Default is ``False``.
    content : str or None, optional
        Inline body text when no ``children`` are provided. Default is
        ``None``.
    description : str or None, optional
        Supporting text shown with ``content``. Default is ``None``.
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        A ``Collapsible`` component node.
    """
    return _component(
        "Collapsible",
        children,
        label=label,
        title=title,
        defaultOpen=default_open,
        content=content,
        description=description,
        class_name=class_name,
    )


def accordion(
    *children: Any,
    default_value: Optional[str] = None,
    multiple: bool = False,
    class_name: Optional[str] = None,
) -> Component:
    """Create an accordion whose children become expandable items.

    Parameters
    ----------
    *children
        Accordion item components or plain strings (coerced to labels).
    default_value : str or None, optional
        Value of the initially expanded item. When ``None``, the first child
        item is expanded (``"item-0"`` when child values are unset). Default
        is ``None``.
    multiple : bool, optional
        When ``True``, allows more than one item to stay open at once.
        Default is ``False``.
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        An ``Accordion`` component node.
    """
    return _component(
        "Accordion",
        children,
        defaultValue=default_value,
        multiple=multiple,
        class_name=class_name,
    )


def markdown_cell(
    cell_id: Optional[str] = None,
    *,
    text: Optional[str] = None,
    class_name: Optional[str] = None,
) -> Component:
    """Reference a markdown cell by Orion cell id, or render inline markdown text.

    Parameters
    ----------
    cell_id : str or None, optional
        Orion notebook cell id (``cells[i].metadata.orion.id``) whose markdown
        source should be embedded. Default is ``None``.
    text : str or None, optional
        Inline markdown rendered when ``cell_id`` is not provided. Default is
        ``None``.
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        A ``MarkdownCell`` component node.
    """
    return _component("MarkdownCell", cellId=cell_id, text=text, class_name=class_name)


def output(
    cell_id: str,
    output_index: int = 0,
    *,
    class_name: Optional[str] = None,
) -> Component:
    """Reference a notebook output by Orion cell id and zero-based output index.

    Parameters
    ----------
    cell_id : str
        Orion notebook cell id (``cells[i].metadata.orion.id``) that owns the
        output.
    output_index : int, optional
        Zero-based index into that cell's ``outputs`` list. Default is ``0``.
    class_name : str or None, optional
        Semantic CSS hook merged at render time. Default is ``None``.

    Returns
    -------
    Component
        An ``Output`` component node.
    """
    return _component(
        "Output",
        cellId=cell_id,
        outputIndex=output_index,
        class_name=class_name,
    )


def version(
    value: Any,
    *,
    key: Optional[str] = None,
    max_versions: int = 10,
) -> VersionedOutput:
    """Retain prior rich representations of a notebook output in Orion.

    Parameters
    ----------
    value
        Any object supported by the active IPython rich display formatter.
    key : str or None, optional
        Stable identity used when versioned outputs are reordered within a cell.
        Keys must be unique among versioned outputs in that cell. Default is
        ``None``, which matches outputs by their versioned-output position.
    max_versions : int, optional
        Maximum number of versions retained in the notebook, including the
        current version. Default is ``10``.

    Returns
    -------
    VersionedOutput
        A display wrapper rendered by Orion with selectable history.
    """
    return VersionedOutput(value=value, key=key, max_versions=max_versions)


def get(key: str, default: Optional[StateValue] = None) -> Optional[StateValue]:
    """Return an Orion UI control value from Python runtime state.

    Parameters
    ----------
    key : str
        State key previously bound by a control helper or ``define_default()``.
    default : str, int, float, bool, or None, optional
        Value returned when ``key`` has no stored state. Default is ``None``.

    Returns
    -------
    str, int, float, bool, or None
        Current runtime value for ``key``, or ``default`` when unset.
    """
    return _runtime.get_value(key, default)


def define_default(key: str, default: StateValue) -> StateValue:
    """Define a default value without replacing an existing user-selected value.

    Parameters
    ----------
    key : str
        Non-empty state key to initialize.
    default : str, int, float, or bool
        Value stored only when ``key`` has no existing runtime state.

    Returns
    -------
    str, int, float, or bool
        Current runtime value for ``key`` (existing state or ``default``).
    """
    return _runtime.define_default(key, default)


def set(key: str, value: StateValue) -> None:
    """Set an Orion UI control value in Python runtime state.

    Parameters
    ----------
    key : str
        Non-empty state key to update.
    value : str, int, float, or bool
        Value written into runtime state, replacing any prior value.
    """
    _runtime.set_value(key, value)


def state() -> Dict[str, StateValue]:
    """Return a shallow copy of Orion UI runtime state.

    Returns
    -------
    dict of str to str, int, float, or bool
        Mapping of every bound state key to its current value.
    """
    return _runtime.state()


def _render_static_html(component: Component) -> str:
    """Render a small static HTML fallback for non-Orion notebook frontends."""
    title = html.escape(str(component.props.get("title", "")))
    label_text = html.escape(str(component.props.get("label", component.props.get("text", ""))))
    children = "".join(_render_static_html(child) for child in component.children)
    shell_start = (
        "<div style='border:1px solid #d4d4d8;border-radius:8px;padding:12px;"
        "font-family:Inter,system-ui,sans-serif;margin:8px 0;'>"
    )

    if component.type == "Card":
        header = f"<strong>{title}</strong>" if title else ""
        return f"{shell_start}{header}<div>{children}</div></div>"
    if component.type in {"Stack", "Page", "Section", "Grid", "Tabs", "Accordion", "Carousel"}:
        header = f"<strong>{title}</strong>" if title else ""
        return f"<div style='display:flex;flex-direction:column;gap:8px'>{header}{children}</div>"
    if component.type == "Table":
        source = html.escape(str(component.props.get("source", "DataFrame")))
        shape = component.props.get("shape")
        shape_text = ""
        if isinstance(shape, list) and len(shape) == 2:
            shape_text = f" ({html.escape(str(shape[0]))} rows x {html.escape(str(shape[1]))} columns)"
        header = f"<strong>{title}</strong><br />" if title else ""
        return f"{shell_start}{header}Orion table: <code>{source}</code>{shape_text}</div>"
    if component.type == "Button":
        return f"<button type='button'>{html.escape(str(component.props.get('label', 'Button')))}</button>"
    if component.type in {
        "Input",
        "Textarea",
        "Select",
        "Slider",
        "Checkbox",
        "Switch",
        "RadioGroup",
        "Toggle",
        "ToggleGroup",
        "Calendar",
        "DatePicker",
        "DateRangeSlider",
        "DateTimePicker",
        "Progress",
    }:
        value = html.escape(str(component.props.get("defaultValue", "")))
        return f"<div><strong>{label_text}</strong>: <code>{value}</code></div>"
    if component.type == "Alert":
        description = html.escape(
            str(component.props.get("description", component.props.get("text", "")))
        )
        header = f"<strong>{title}</strong>" if title else ""
        return f"<div style='border:1px solid #d4d4d8;border-radius:8px;padding:12px'>{header}{description}{children}</div>"
    if component.type == "Avatar":
        fallback = html.escape(str(component.props.get("fallback", label_text or "?")))
        return f"<span style='display:inline-flex;align-items:center;justify-content:center;border-radius:999px;background:#e4e4e7;width:40px;height:40px'>{fallback}</span>"
    if component.type in {"Popover", "HoverCard", "Tooltip", "Collapsible", "DatePicker"}:
        trigger = html.escape(
            str(
                component.props.get("label")
                or component.props.get("trigger")
                or component.props.get("text")
                or "Open"
            )
        )
        return f"<button type='button'>{trigger}</button>{children}"
    if component.type == "Badge":
        return f"<span style='border:1px solid #d4d4d8;border-radius:999px;padding:2px 8px'>{label_text}</span>"
    if component.type == "Label":
        return f"<span>{label_text}</span>"
    if component.type == "Separator":
        return "<hr />"
    if component.type == "MarkdownCell":
        return f"<div>{html.escape(str(component.props.get('text', 'Markdown cell')))}</div>"
    if component.type == "Output":
        return "<div>Notebook output reference</div>"
    return children


__all__ = [
    "Component",
    "ORION_UI_MIME_TYPE",
    "ORION_VERSIONED_OUTPUT_MIME_TYPE",
    "VersionedOutput",
    "accordion",
    "alert",
    "avatar",
    "badge",
    "button",
    "calendar",
    "card",
    "carousel",
    "checkbox",
    "collapsible",
    "date_picker",
    "date_range_slider",
    "date_time_picker",
    "define_default",
    "get",
    "grid",
    "hover_card",
    "input",
    "label",
    "markdown_cell",
    "output",
    "page",
    "popover",
    "progress",
    "radio_group",
    "section",
    "select",
    "separator",
    "set",
    "slider",
    "stack",
    "state",
    "switch",
    "table",
    "tabs",
    "textarea",
    "theme",
    "toggle",
    "toggle_group",
    "tooltip",
    "version",
]
