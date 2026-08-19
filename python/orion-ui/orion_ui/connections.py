"""Read Orion connections from notebook code without exposing their secrets.

Orion stores the user's third-party credentials in ``~/.orion/connections.json``
with owner-only permissions. This module resolves one of those records inside
the kernel process so notebook code can authenticate against a business system
without the secret ever appearing in a cell, a chat transcript, or a traceback.

Typical use::

    from orion_ui import connections

    conn = connections.get("google-sheets")
    client = conn.google_credentials()   # ready to hand to gspread

The connection object deliberately has no ``__repr__`` that reveals values, and
``secret()`` is the only way to reach one — so a stray ``print(conn)`` cannot
leak a token.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional

__all__ = ["Connection", "ConnectionError", "get", "list_ids", "available"]


class ConnectionError(RuntimeError):
    """Raised when a connection cannot be resolved.

    Carries remediation text rather than a bare failure, because the most common
    causes — no connection configured, or a remote Jupyter server that cannot
    see the user's home directory — are fixed in the Orion UI, not in code.
    """


def _connections_path() -> Path:
    """Return the path to Orion's connections file, honoring ``ORION_HOME_DIR``."""
    home = os.environ.get("ORION_HOME_DIR")
    base = Path(home) if home else Path.home() / ".orion"
    return base / "connections.json"


def _load_document() -> Dict[str, Any]:
    """Read and parse the connections file, or return an empty document."""
    path = _connections_path()
    try:
        with path.open("r", encoding="utf-8") as handle:
            document = json.load(handle)
    except FileNotFoundError:
        return {"version": 1, "connections": {}}
    except (OSError, ValueError) as error:
        raise ConnectionError(
            f"Orion's connections file at {path} could not be read ({error}). "
            "Open Settings -> Connections in Orion to repair it."
        ) from error

    if not isinstance(document, dict):
        raise ConnectionError(
            f"Orion's connections file at {path} is not a JSON object."
        )
    return document


class Connection:
    """One configured connection, resolved in-process.

    Secret values are reachable only through :meth:`secret`; the object's own
    representation and ``str()`` show the id and the non-secret settings, so a
    connection can be inspected safely in a notebook.
    """

    def __init__(self, record: Mapping[str, Any]) -> None:
        self._id = str(record.get("id", ""))
        self._tool_id = str(record.get("toolId", ""))
        self._label = str(record.get("label", ""))
        self._kind = str(record.get("kind", "none"))
        self._secrets: Dict[str, str] = dict(record.get("secrets") or {})
        self._config: Dict[str, str] = dict(record.get("config") or {})

    @property
    def id(self) -> str:
        """Stable connection id, as shown in Orion's Connections settings."""
        return self._id

    @property
    def tool_id(self) -> str:
        """Catalog id of the system this connection reaches, e.g. ``slack``."""
        return self._tool_id

    @property
    def label(self) -> str:
        """User-facing name for this connection."""
        return self._label

    @property
    def kind(self) -> str:
        """Authentication shape: ``api_key``, ``oauth2``, ``service_account``, ``sql``."""
        return self._kind

    @property
    def config(self) -> Dict[str, str]:
        """Non-secret settings — host, region, tenant, spreadsheet id, and so on."""
        return dict(self._config)

    def secret(self, name: str, default: Optional[str] = None) -> Optional[str]:
        """Return one stored secret by name.

        Prefer the helpers below where one exists, and never print the result or
        assign it into a variable that a later cell might display.
        """
        return self._secrets.get(name, default)

    def secret_names(self) -> List[str]:
        """Return the names of the stored secrets, without their values."""
        return sorted(self._secrets)

    def require(self, name: str) -> str:
        """Return one stored secret, raising a remediable error when it is absent."""
        value = self._secrets.get(name)
        if not value:
            raise ConnectionError(
                f'Connection "{self._id}" has no secret named "{name}". '
                f"Stored secrets: {', '.join(self.secret_names()) or 'none'}. "
                "Add it in Orion under Settings -> Connections."
            )
        return value

    def service_account_info(self) -> Dict[str, Any]:
        """Return the parsed service-account key for a ``service_account`` connection."""
        raw = self.require("serviceAccountJson")
        try:
            info = json.loads(raw)
        except ValueError as error:
            raise ConnectionError(
                f'The service account key on connection "{self._id}" is not valid JSON. '
                "Re-paste the whole key file in Settings -> Connections."
            ) from error
        if not isinstance(info, dict):
            raise ConnectionError(
                f'The service account key on connection "{self._id}" is not a JSON object.'
            )
        return info

    def google_credentials(self, scopes: Optional[List[str]] = None) -> Any:
        """Build read-only Google credentials from a service-account connection.

        Defaults to read-only Sheets and Drive scopes, matching the playbook rule
        that anything which writes needs explicit per-action confirmation.
        """
        try:
            from google.oauth2.service_account import Credentials
        except ImportError as error:  # pragma: no cover - depends on user's env
            raise ConnectionError(
                "google-auth is not installed in this kernel. "
                "Install it with: %pip install google-auth gspread"
            ) from error

        return Credentials.from_service_account_info(
            self.service_account_info(),
            scopes=scopes
            or [
                "https://www.googleapis.com/auth/spreadsheets.readonly",
                "https://www.googleapis.com/auth/drive.readonly",
            ],
        )

    def sqlalchemy_url(self, driver: str = "postgresql+psycopg") -> str:
        """Build a SQLAlchemy URL for a ``sql`` connection.

        The password is URL-encoded into the returned string, so treat the result
        as a secret: pass it straight to ``create_engine`` rather than printing it.
        """
        from urllib.parse import quote_plus

        user = self._config.get("user", "")
        password = self._secrets.get("password", "")
        host = self._config.get("host", "")
        port = self._config.get("port", "")
        database = self._config.get("database", "")

        if not host or not database:
            raise ConnectionError(
                f'Connection "{self._id}" needs both a host and a database. '
                "Add them in Orion under Settings -> Connections."
            )

        credentials = quote_plus(user)
        if password:
            credentials = f"{credentials}:{quote_plus(password)}"
        authority = f"{credentials}@" if credentials else ""
        port_part = f":{port}" if port else ""
        return f"{driver}://{authority}{host}{port_part}/{database}"

    def __repr__(self) -> str:
        """Return a representation that names the secrets but never shows them."""
        return (
            f"Connection(id={self._id!r}, tool_id={self._tool_id!r}, "
            f"kind={self._kind!r}, config={self._config!r}, "
            f"secrets={self.secret_names()!r})"
        )


def list_ids() -> List[str]:
    """Return the ids of every configured connection."""
    document = _load_document()
    connections = document.get("connections")
    if not isinstance(connections, dict):
        return []
    return sorted(connections)


def available() -> bool:
    """Return True when at least one connection is configured and readable."""
    try:
        return bool(list_ids())
    except ConnectionError:
        return False


def get(connection_id: str) -> Connection:
    """Return one connection by id.

    Raises :class:`ConnectionError` with remediation text when the id is unknown,
    which is the common case on a remote Jupyter server where the user's
    ``~/.orion`` directory is not on the same machine as the kernel.
    """
    if not connection_id or not isinstance(connection_id, str):
        raise ConnectionError("A connection id is required, e.g. get('google-sheets').")

    document = _load_document()
    connections = document.get("connections")
    record = connections.get(connection_id) if isinstance(connections, dict) else None

    if not isinstance(record, dict):
        known = list_ids()
        detail = f"Configured connections: {', '.join(known)}." if known else (
            "No connections are configured on this machine. If the kernel is running "
            "on a different host than the Orion app, the connections file is not "
            "visible from here."
        )
        raise ConnectionError(
            f'No connection with id "{connection_id}". {detail} '
            "Add or repair it in Orion under Settings -> Connections."
        )

    return Connection(record)
