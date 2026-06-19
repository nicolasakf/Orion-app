"""Tests for platform detection and managed-runtime Python discovery."""

from __future__ import annotations

import os
import sys
import unittest
from unittest.mock import patch

from orion_agent.cli import (
    JupyterStartError,
    node_cpu_arch,
    node_platform_slug,
    python_discovery_candidates,
    resolve_existing_jupyter_python,
    resolve_venv_creation_python,
    start_jupyter,
)


class NodePlatformSlugTests(unittest.TestCase):
    """Tests for portable Node platform selection."""

    def test_node_cpu_arch_uses_arm64_machine(self) -> None:
        with patch("orion_agent.cli.platform.machine", return_value="ARM64"):
            self.assertEqual(node_cpu_arch(), "arm64")

    def test_node_cpu_arch_uses_windows_native_arm64(self) -> None:
        with patch("orion_agent.cli.sys.platform", "win32"), patch(
            "orion_agent.cli.platform.machine", return_value="AMD64"
        ), patch.dict(
            os.environ,
            {"PROCESSOR_ARCHITEW6432": "ARM64"},
            clear=False,
        ):
            self.assertEqual(node_cpu_arch(), "arm64")

    def test_node_platform_slug_on_windows_arm64(self) -> None:
        with patch("orion_agent.cli.sys.platform", "win32"), patch(
            "orion_agent.cli.node_cpu_arch", return_value="arm64"
        ):
            self.assertEqual(node_platform_slug(), ("win-arm64", "zip"))


class ManagedRuntimePythonTests(unittest.TestCase):
    """Tests for managed venv host Python discovery."""

    def test_python_discovery_candidates_include_launcher_python(self) -> None:
        candidates = python_discovery_candidates()
        self.assertIn([sys.executable], candidates)

    def test_python_discovery_candidates_include_conda_prefix(self) -> None:
        with patch.dict(os.environ, {"CONDA_PREFIX": "/tmp/conda"}, clear=False), patch(
            "orion_agent.cli.Path.exists", return_value=True
        ):
            candidates = python_discovery_candidates()
            expected = (
                ["/tmp/conda/Scripts/python.exe"]
                if os.name == "nt"
                else ["/tmp/conda/bin/python"]
            )
            self.assertIn(expected, candidates)

    def test_resolve_venv_creation_python_prefers_first_supported_candidate(
        self,
    ) -> None:
        with patch(
            "orion_agent.cli.python_discovery_candidates",
            return_value=[["missing-python"], [sys.executable]],
        ), patch(
            "orion_agent.cli.python_command_supported",
            side_effect=lambda command: command == [sys.executable],
        ):
            self.assertEqual(resolve_venv_creation_python(), [sys.executable])

    def test_resolve_existing_jupyter_python_uses_discovered_interpreter(
        self,
    ) -> None:
        candidates = [["py", "-3"], [sys.executable]]

        with patch(
            "orion_agent.cli.python_discovery_candidates",
            return_value=candidates,
        ), patch(
            "orion_agent.cli.has_jupyter_command",
            side_effect=lambda command: command == ["py", "-3"],
        ), patch(
            "orion_agent.cli.inspect_python_executable",
            return_value="C:\\Python311\\python.exe",
        ):
            self.assertEqual(
                resolve_existing_jupyter_python(),
                "C:\\Python311\\python.exe",
            )


class JupyterStartErrorTests(unittest.TestCase):
    """Tests for structured Jupyter startup failures."""

    def test_jupyter_start_error_preserves_reason(self) -> None:
        error = JupyterStartError("missing apis", "missing_apis")
        self.assertEqual(error.reason, "missing_apis")
        self.assertEqual(str(error), "missing apis")

    def test_start_jupyter_wraps_spawn_failures(self) -> None:
        with patch("orion_agent.cli.free_port", return_value=12345), patch(
            "orion_agent.cli.subprocess.Popen",
            side_effect=OSError("blocked"),
        ):
            with self.assertRaises(JupyterStartError) as context:
                start_jupyter("C:\\Python311\\python.exe")

        self.assertEqual(context.exception.reason, "spawn_failed")
        self.assertIn("Could not start Jupyter", str(context.exception))


if __name__ == "__main__":
    unittest.main()
