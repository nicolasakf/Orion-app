"""Package pins for Orion's managed Jupyter runtime."""

from __future__ import annotations

from typing import Literal

SupportTier = Literal["preferred", "legacy"]


def get_python_support(version: tuple[int, int, int]) -> SupportTier | None:
    """Return Orion's Python support tier for a version tuple."""
    major, minor, _patch = version
    if major > 3 or (major == 3 and minor >= 9):
        return "preferred"
    if major == 3 and minor == 8:
        return "legacy"
    return None


def managed_runtime_packages(orion_version: str, support: SupportTier) -> list[str]:
    """Return pip package specs for Orion's managed Jupyter environment."""
    jupyter_server = (
        "jupyter_server>=1.24,<2" if support == "legacy" else "jupyter_server>=2,<3"
    )
    return [
        jupyter_server,
        "jupyter_server_terminals>=0.4,<1",
        "ipykernel>=6,<7",
        f"orion-ui=={orion_version}",
    ]
