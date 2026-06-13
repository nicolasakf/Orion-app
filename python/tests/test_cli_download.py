"""Tests for Orion CLI download helpers."""

import io
import tempfile
import unittest
from pathlib import Path
from typing import Optional
from unittest.mock import patch

from orion_agent import cli


class TtyStringIO(io.StringIO):
    """StringIO test stream that behaves like an interactive terminal."""

    def isatty(self):
        """Return True so progress rendering is enabled in tests."""
        return True


class FakeResponse:
    """Small urllib response stand-in backed by bytes."""

    def __init__(self, data: bytes, content_length: Optional[int] = None):
        """Create a response with optional Content-Length metadata."""
        self._buffer = io.BytesIO(data)
        self.headers = {}
        if content_length is not None:
            self.headers["Content-Length"] = str(content_length)

    def __enter__(self):
        """Return the fake response for context manager use."""
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        """Close the backing buffer when context manager use ends."""
        self._buffer.close()

    def read(self, size: int = -1):
        """Read bytes from the backing buffer."""
        return self._buffer.read(size)


class CliDownloadTests(unittest.TestCase):
    """Tests for CLI download progress behavior."""

    def test_render_download_progress_includes_bar_and_sizes(self):
        """Download progress should show a bar, percent, and byte counts."""
        progress = cli.render_download_progress(512, 1024)

        self.assertTrue(progress.startswith("[##############--------------]"))
        self.assertIn("50.0%", progress)
        self.assertIn("512 B / 1.0 KB", progress)

    def test_download_file_writes_progress_for_tty(self):
        """Interactive app bundle downloads should update progress while streaming."""
        data = b"orion bundle bytes"
        stderr = TtyStringIO()
        with tempfile.TemporaryDirectory() as temp_dir:
            destination = Path(temp_dir) / "bundle.tar.gz"

            response = FakeResponse(data, len(data))
            with patch("urllib.request.urlopen", return_value=response), patch(
                "sys.stderr", stderr
            ):
                cli.download_file(
                    "https://example.test/orion.tar.gz",
                    destination,
                    show_progress=True,
                )

            self.assertEqual(destination.read_bytes(), data)
        self.assertIn("[############################] 100.0%", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
