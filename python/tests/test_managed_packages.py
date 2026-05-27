"""Tests for Orion managed runtime package pins."""

from orion_agent.managed_packages import get_python_support, managed_runtime_packages


def test_get_python_support():
    assert get_python_support((3, 11, 0)) == "preferred"
    assert get_python_support((3, 8, 18)) == "legacy"
    assert get_python_support((3, 7, 17)) is None


def test_managed_runtime_packages_include_orion_ui():
    packages = managed_runtime_packages("0.6.3", "preferred")
    assert "orion-ui==0.6.3" in packages
    assert "jupyter_server>=2,<3" in packages


def test_managed_runtime_packages_legacy_jupyter():
    packages = managed_runtime_packages("0.6.3", "legacy")
    assert "jupyter_server>=1.24,<2" in packages
    assert "orion-ui==0.6.3" in packages
