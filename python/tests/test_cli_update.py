"""Tests for Orion launcher update checks and command selection."""

import io
import json
import unittest
from unittest.mock import patch

from orion_agent import cli


class FakeResponse:
    """Context-managed PyPI JSON response."""

    def __init__(self, payload):
        """Encode a JSON payload for urlopen."""
        self.buffer = io.BytesIO(json.dumps(payload).encode("utf-8"))

    def __enter__(self):
        """Return this response."""
        return self

    def __exit__(self, *_args):
        """Close the response buffer."""
        self.buffer.close()

    def read(self):
        """Read the encoded response."""
        return self.buffer.read()


class CliUpdateTests(unittest.TestCase):
    """Validate PyPI update behavior without network or package mutations."""

    def test_check_pypi_update_returns_newer_version(self):
        """A newer stable release should be returned."""
        response = FakeResponse({"info": {"version": "0.11.0"}})
        with patch("urllib.request.urlopen", return_value=response):
            self.assertEqual(cli.check_pypi_update("0.10.1"), "0.11.0")

    def test_pip_update_uses_active_interpreter(self):
        """pip upgrades should preserve the launcher's Python environment."""
        with patch.object(cli.sys, "executable", "/tmp/python"):
            self.assertEqual(
                cli.update_install_command("pip"),
                ["/tmp/python", "-m", "pip", "install", "--upgrade", "orion-notebook"],
            )

    def test_uv_update_uses_uv_tool_upgrade(self):
        """uv-managed installs should remain uv-managed."""
        with patch("shutil.which", return_value="/tmp/uv"):
            self.assertEqual(
                cli.update_install_command("uv"),
                ["/tmp/uv", "tool", "upgrade", "orion-notebook"],
            )


if __name__ == "__main__":
    unittest.main()
