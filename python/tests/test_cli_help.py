"""Tests for Orion CLI help output."""

from __future__ import annotations

import io
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

from orion_agent.cli import main, print_usage


class CliHelpTests(unittest.TestCase):
    """Tests for top-level CLI help."""

    def test_print_usage_lists_subcommands(self) -> None:
        buffer = io.StringIO()
        with redirect_stdout(buffer):
            print_usage()
        output = buffer.getvalue()
        self.assertIn("Commands:", output)
        self.assertIn("doctor", output)
        self.assertIn("update", output)
        self.assertIn("uninstall", output)
        self.assertIn("--app-only", output)

    def test_main_help_flag_shows_top_level_usage(self) -> None:
        buffer = io.StringIO()
        with patch("sys.argv", ["orion", "-h"]), redirect_stdout(buffer):
            main()
        output = buffer.getvalue()
        self.assertIn("Commands:", output)
        self.assertIn("doctor", output)
        self.assertNotIn("usage: orion [-h]", output)


if __name__ == "__main__":
    unittest.main()
