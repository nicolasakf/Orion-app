"""Runtime state store for Orion UI notebook controls."""

from __future__ import annotations

from typing import Dict, Optional, Union

StateValue = Union[str, int, float, bool]

_STATE: Dict[str, StateValue] = {}
_OUTPUT_STATE: Dict[str, Dict[str, StateValue]] = {}


def set_value(key: str, value: StateValue, output_id: Optional[str] = None) -> None:
    """Set a control value in the process-local Orion UI state store."""
    if not isinstance(key, str) or not key:
        raise ValueError("Orion UI state key must be a non-empty string.")
    if not isinstance(value, (str, int, float, bool)):
        raise TypeError("Orion UI state values must be strings, numbers, or booleans.")

    _STATE[key] = value
    if output_id:
        _OUTPUT_STATE.setdefault(output_id, {})[key] = value


def define_default(key: str, default: StateValue) -> StateValue:
    """Set a default value only when a control key has no runtime state yet."""
    if not isinstance(key, str) or not key:
        raise ValueError("Orion UI state key must be a non-empty string.")
    if not isinstance(default, (str, int, float, bool)):
        raise TypeError("Orion UI default values must be strings, numbers, or booleans.")

    if key not in _STATE:
        _STATE[key] = default
    return _STATE[key]


def get_value(key: str, default: Optional[StateValue] = None) -> Optional[StateValue]:
    """Return a control value from the Orion UI state store."""
    return _STATE.get(key, default)


def state() -> Dict[str, StateValue]:
    """Return a shallow copy of all Orion UI control state."""
    return dict(_STATE)


def output_state(output_id: str) -> Dict[str, StateValue]:
    """Return state updates associated with one rendered Orion UI output."""
    return dict(_OUTPUT_STATE.get(output_id, {}))
