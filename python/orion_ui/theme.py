"""Theme helpers for third-party visualization libraries."""

from __future__ import annotations

from typing import Any, Dict


def plotly(name: str = "orion", set_default: bool = True) -> Dict[str, Any]:
    """Register an Orion-styled Plotly template and optionally make it default."""
    try:
        import plotly.io as pio
    except ImportError as exc:
        raise ImportError(
            "ui.theme.plotly() requires Plotly. Install plotly to use this helper."
        ) from exc

    template: Dict[str, Any] = {
        "layout": {
            "paper_bgcolor": "rgba(0,0,0,0)",
            "plot_bgcolor": "rgba(0,0,0,0)",
            "font": {"family": "Inter, ui-sans-serif, system-ui", "color": "#18181b"},
            "colorway": [
                "#2563eb",
                "#16a34a",
                "#dc2626",
                "#9333ea",
                "#f59e0b",
                "#0891b2",
            ],
            "margin": {"l": 48, "r": 24, "t": 48, "b": 44},
            "xaxis": {
                "gridcolor": "rgba(113,113,122,0.18)",
                "zerolinecolor": "rgba(113,113,122,0.24)",
                "linecolor": "rgba(113,113,122,0.35)",
                "ticks": "outside",
            },
            "yaxis": {
                "gridcolor": "rgba(113,113,122,0.18)",
                "zerolinecolor": "rgba(113,113,122,0.24)",
                "linecolor": "rgba(113,113,122,0.35)",
                "ticks": "outside",
            },
            "legend": {
                "orientation": "h",
                "yanchor": "bottom",
                "y": 1.02,
                "xanchor": "right",
                "x": 1,
            },
        }
    }

    pio.templates[name] = template
    if set_default:
        pio.templates.default = name
    return template
