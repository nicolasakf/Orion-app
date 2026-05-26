"""Python authoring API for Orion-native notebook UI outputs."""

from __future__ import annotations

__version__ = "0.6.1"

import html
import json
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Union

from . import _runtime, theme

ORION_UI_MIME_TYPE = "application/vnd.orion.ui+json"
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
    "Label",
    "Badge",
    "Separator",
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
    return {
        key: _validate_json_value(value, f"props.{key}")
        for key, value in props.items()
        if value is not None
    }


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


def _component(component_type: str, children: Sequence[Any] = (), **props: Any) -> Component:
    """Create a validated Orion UI component."""
    return Component(component_type, _props(**props), _coerce_children(children))


def _control(
    component_type: str,
    key: str,
    default_value: StateValue,
    value: Any = _UNSET,
    **props: Any,
) -> Component:
    """Create a state-bound control using default or forced value semantics."""
    if not isinstance(key, str) or not key:
        raise ValueError("Control key must be a non-empty string.")
    if value is _UNSET:
        define_default(key, default_value)
    else:
        if not isinstance(value, (str, int, float, bool)):
            raise TypeError("Control value must be a string, number, or boolean.")
        _runtime.set_value(key, value)
    return _component(component_type, stateKey=key, defaultValue=default_value, **props)


def page(*children: Any, gap: str = "md", padding: str = "md") -> Component:
    """Create a top-level page container."""
    return _component("Page", children, gap=gap, padding=padding)


def stack(*children: Any, gap: str = "md", align: str = "stretch") -> Component:
    """Create a vertical stack layout."""
    return _component("Stack", children, gap=gap, align=align)


def grid(*children: Any, columns: int = 2, gap: str = "md") -> Component:
    """Create a responsive grid layout."""
    return _component("Grid", children, columns=columns, gap=gap)


def section(
    *children: Any,
    title: Optional[str] = None,
    description: Optional[str] = None,
    gap: str = "md",
    padding: str = "md",
) -> Component:
    """Create a titled section."""
    return _component(
        "Section",
        children,
        title=title,
        description=description,
        gap=gap,
        padding=padding,
    )


def card(
    *children: Any,
    title: Optional[str] = None,
    description: Optional[str] = None,
    gap: str = "md",
) -> Component:
    """Create a card container."""
    return _component("Card", children, title=title, description=description, gap=gap)


def tabs(*children: Any, default_value: Optional[str] = None) -> Component:
    """Create a tab container whose children act as panels."""
    return _component("Tabs", children, defaultValue=default_value)


def button(
    label: str,
    *,
    action: Optional[Mapping[str, Any]] = None,
    variant: Optional[str] = None,
    size: Optional[str] = None,
) -> Component:
    """Create a button, optionally with an Orion declarative action."""
    return _component("Button", label=label, action=action, variant=variant, size=size)


def input(
    key: str,
    *,
    label: Optional[str] = None,
    default_value: str = "",
    value: Any = _UNSET,
    placeholder: Optional[str] = None,
    input_type: str = "text",
) -> Component:
    """Create a text input bound to Python state."""
    return _control(
        "Input",
        key,
        default_value,
        value,
        label=label,
        placeholder=placeholder,
        inputType=input_type,
    )


def textarea(
    key: str,
    *,
    label: Optional[str] = None,
    default_value: str = "",
    value: Any = _UNSET,
    placeholder: Optional[str] = None,
) -> Component:
    """Create a textarea bound to Python state."""
    return _control("Textarea", key, default_value, value, label=label, placeholder=placeholder)


def select(
    key: str,
    options: Iterable[Union[str, Mapping[str, str]]],
    *,
    label: Optional[str] = None,
    default_value: Optional[str] = None,
    value: Any = _UNSET,
    placeholder: Optional[str] = None,
) -> Component:
    """Create a select control bound to Python state."""
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
        label=label,
        options=option_list,
        placeholder=placeholder,
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
) -> Component:
    """Create a numeric slider bound to Python state."""
    return _control(
        "Slider",
        key,
        default_value,
        value,
        label=label,
        min=min,
        max=max,
        step=step,
    )


def checkbox(
    key: str,
    *,
    label: Optional[str] = None,
    default_value: bool = False,
    value: Any = _UNSET,
) -> Component:
    """Create a checkbox bound to Python state."""
    return _control("Checkbox", key, default_value, value, label=label)


def switch(
    key: str,
    *,
    label: Optional[str] = None,
    default_value: bool = False,
    value: Any = _UNSET,
) -> Component:
    """Create a switch bound to Python state."""
    return _control("Switch", key, default_value, value, label=label)


def label(text: str) -> Component:
    """Create a text label."""
    return _component("Label", text=text)


def badge(text: str, *, variant: Optional[str] = None) -> Component:
    """Create a status badge."""
    return _component("Badge", text=text, variant=variant)


def separator() -> Component:
    """Create a horizontal separator."""
    return _component("Separator")


def markdown_cell(cell_id: Optional[str] = None, *, text: Optional[str] = None) -> Component:
    """Reference a markdown cell by Orion cell id, or render inline markdown text."""
    return _component("MarkdownCell", cellId=cell_id, text=text)


def output(cell_id: str, output_index: int = 0) -> Component:
    """Reference a notebook output by Orion cell id and zero-based output index."""
    return _component("Output", cellId=cell_id, outputIndex=output_index)


def get(key: str, default: Optional[StateValue] = None) -> Optional[StateValue]:
    """Return an Orion UI control value from Python runtime state."""
    return _runtime.get_value(key, default)


def define_default(key: str, default: StateValue) -> StateValue:
    """Define a default value without replacing an existing user-selected value."""
    return _runtime.define_default(key, default)


def set(key: str, value: StateValue) -> None:
    """Set an Orion UI control value in Python runtime state."""
    _runtime.set_value(key, value)


def state() -> Dict[str, StateValue]:
    """Return a shallow copy of Orion UI runtime state."""
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
    if component.type in {"Stack", "Page", "Section", "Grid", "Tabs"}:
        header = f"<strong>{title}</strong>" if title else ""
        return f"<div style='display:flex;flex-direction:column;gap:8px'>{header}{children}</div>"
    if component.type == "Button":
        return f"<button type='button'>{html.escape(str(component.props.get('label', 'Button')))}</button>"
    if component.type in {"Input", "Textarea", "Select", "Slider", "Checkbox", "Switch"}:
        value = html.escape(str(component.props.get("defaultValue", "")))
        return f"<div><strong>{label_text}</strong>: <code>{value}</code></div>"
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
    "badge",
    "button",
    "card",
    "checkbox",
    "define_default",
    "get",
    "grid",
    "input",
    "label",
    "markdown_cell",
    "output",
    "page",
    "section",
    "select",
    "separator",
    "set",
    "slider",
    "stack",
    "state",
    "switch",
    "tabs",
    "textarea",
    "theme",
]
