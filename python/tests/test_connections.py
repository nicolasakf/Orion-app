"""Tests for the orion_ui.connections broker."""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "orion-ui"))

from orion_ui import connections  # noqa: E402


@pytest.fixture
def orion_home(tmp_path, monkeypatch):
    """Point the broker at a temporary Orion home directory."""
    monkeypatch.setenv("ORION_HOME_DIR", str(tmp_path))
    return tmp_path


def write_connections(home, records):
    """Write a connections document containing the given records."""
    document = {"version": 1, "connections": {r["id"]: r for r in records}}
    (home / "connections.json").write_text(json.dumps(document), encoding="utf-8")


def sheets_record(**overrides):
    """Return a service-account connection record."""
    record = {
        "id": "google-sheets",
        "toolId": "google-sheets",
        "label": "Acme finance sheet",
        "kind": "service_account",
        "secrets": {"serviceAccountJson": json.dumps({"client_email": "bot@acme.iam"})},
        "config": {"spreadsheetId": "1AbC"},
    }
    record.update(overrides)
    return record


def test_missing_file_reports_no_connections(orion_home):
    assert connections.list_ids() == []
    assert connections.available() is False


def test_lists_configured_ids(orion_home):
    write_connections(orion_home, [sheets_record(), sheets_record(id="slack")])
    assert connections.list_ids() == ["google-sheets", "slack"]
    assert connections.available() is True


def test_get_returns_config_and_secret_names(orion_home):
    write_connections(orion_home, [sheets_record()])
    conn = connections.get("google-sheets")

    assert conn.id == "google-sheets"
    assert conn.tool_id == "google-sheets"
    assert conn.kind == "service_account"
    assert conn.config == {"spreadsheetId": "1AbC"}
    assert conn.secret_names() == ["serviceAccountJson"]


def test_repr_never_reveals_a_secret_value(orion_home):
    write_connections(
        orion_home,
        [sheets_record(secrets={"apiKey": "sk_live_do_not_leak"}, kind="api_key")],
    )
    conn = connections.get("google-sheets")

    # A stray print(conn) in a notebook must not leak the token.
    assert "sk_live_do_not_leak" not in repr(conn)
    assert "sk_live_do_not_leak" not in str(conn)
    assert "apiKey" in repr(conn)


def test_unknown_id_names_the_configured_ones(orion_home):
    write_connections(orion_home, [sheets_record()])

    with pytest.raises(connections.ConnectionError) as excinfo:
        connections.get("slack")

    message = str(excinfo.value)
    assert "google-sheets" in message
    assert "Settings -> Connections" in message


def test_unknown_id_explains_the_remote_kernel_case(orion_home):
    with pytest.raises(connections.ConnectionError) as excinfo:
        connections.get("slack")

    assert "different host" in str(excinfo.value)


def test_require_reports_the_missing_secret_by_name(orion_home):
    write_connections(orion_home, [sheets_record(secrets={})])
    conn = connections.get("google-sheets")

    with pytest.raises(connections.ConnectionError) as excinfo:
        conn.require("serviceAccountJson")

    assert "serviceAccountJson" in str(excinfo.value)


def test_service_account_info_parses_the_key(orion_home):
    write_connections(orion_home, [sheets_record()])
    info = connections.get("google-sheets").service_account_info()

    assert info["client_email"] == "bot@acme.iam"


def test_malformed_service_account_key_is_remediable(orion_home):
    write_connections(orion_home, [sheets_record(secrets={"serviceAccountJson": "{oops"})])

    with pytest.raises(connections.ConnectionError) as excinfo:
        connections.get("google-sheets").service_account_info()

    assert "Re-paste" in str(excinfo.value)


def test_sqlalchemy_url_encodes_credentials(orion_home):
    write_connections(
        orion_home,
        [
            sheets_record(
                id="warehouse",
                kind="sql",
                secrets={"password": "p@ss word"},
                config={
                    "user": "reader",
                    "host": "db.example.com",
                    "port": "5432",
                    "database": "analytics",
                },
            )
        ],
    )
    url = connections.get("warehouse").sqlalchemy_url()

    assert url == "postgresql+psycopg://reader:p%40ss+word@db.example.com:5432/analytics"


def test_sqlalchemy_url_requires_host_and_database(orion_home):
    write_connections(
        orion_home,
        [sheets_record(id="warehouse", kind="sql", secrets={}, config={"user": "reader"})],
    )

    with pytest.raises(connections.ConnectionError) as excinfo:
        connections.get("warehouse").sqlalchemy_url()

    assert "host and a database" in str(excinfo.value)


def test_malformed_document_is_remediable(orion_home):
    (orion_home / "connections.json").write_text("{not json", encoding="utf-8")

    with pytest.raises(connections.ConnectionError) as excinfo:
        connections.list_ids()

    assert "could not be read" in str(excinfo.value)


def test_blank_id_is_rejected(orion_home):
    with pytest.raises(connections.ConnectionError):
        connections.get("")
