"""Command-line launcher for the PyPI `orion-notebook` package."""

from __future__ import annotations

import argparse
import json
import os
import platform
import secrets
import shutil
import socket
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.request
import webbrowser
import zipfile
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from .managed_packages import get_python_support, managed_runtime_packages

VERSION = "0.10.2"
NODE_VERSION = "v24.11.0"
DEFAULT_APP_BUNDLE_URL = (
    f"https://github.com/nicolasakf/Orion-app/releases/download/"
    f"v{VERSION}/orion-app-{VERSION}.tar.gz"
)
DOWNLOAD_CHUNK_SIZE = 1024 * 256
DOWNLOAD_PROGRESS_WIDTH = 28
PYPI_LATEST_URL = "https://pypi.org/pypi/orion-notebook/json"


class JupyterStartError(Exception):
    """Raised when Jupyter Server fails to start or lacks required APIs."""

    def __init__(self, message: str, reason: str) -> None:
        super().__init__(message)
        self.reason = reason


def orion_home() -> Path:
    """Return Orion's home directory using the `~/.orion` contract."""
    return Path(os.environ.get("ORION_HOME_DIR", Path.home() / ".orion"))


def runtime_dir() -> Path:
    """Return Orion's managed runtime directory."""
    return orion_home() / "runtime"


def app_dir() -> Path:
    """Return the cached Orion app bundle directory for this version."""
    return orion_home() / "app" / VERSION


def handoff_path() -> Path:
    """Return the Jupyter connection handoff path consumed by Orion."""
    return runtime_dir() / "jupyter-connection.json"


def managed_venv_python() -> Path:
    """Return the Python executable inside Orion's managed venv."""
    if os.name == "nt":
        return runtime_dir() / "venv" / "Scripts" / "python.exe"
    return runtime_dir() / "venv" / "bin" / "python"


def confirm(message: str, assume_yes: bool) -> bool:
    """Prompt for setup consent unless `--yes` was provided."""
    if assume_yes:
        return True
    if not sys.stdin.isatty():
        return False
    answer = input(f"{message} [y/N] ").strip().lower()
    return answer in {"y", "yes"}


def parse_stable_version(value: str) -> tuple[int, int, int]:
    """Parse a stable three-part semantic version."""
    normalized = value[1:] if value.startswith("v") else value
    parts = normalized.split(".")
    if len(parts) != 3 or any(not part.isdigit() for part in parts):
        raise ValueError(f"Invalid stable version: {value}")
    return tuple(int(part) for part in parts)  # type: ignore[return-value]


def check_pypi_update(current_version: str = VERSION) -> str | None:
    """Return the latest PyPI version when it is newer than the launcher."""
    request = urllib.request.Request(PYPI_LATEST_URL, headers={"Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=5) as response:
        payload = json.loads(response.read().decode("utf-8"))
    latest = payload.get("info", {}).get("version") if isinstance(payload, dict) else None
    if not isinstance(latest, str):
        raise ValueError("PyPI response did not include info.version.")
    return latest if parse_stable_version(latest) > parse_stable_version(current_version) else None


def update_install_command(channel: str) -> list[str]:
    """Build the package-manager command for the active Python install channel."""
    if channel == "uv":
        uv = shutil.which("uv")
        if not uv:
            raise RuntimeError("uv was not found on PATH.")
        return [uv, "tool", "upgrade", PACKAGE_NAME]
    return [sys.executable, "-m", "pip", "install", "--upgrade", PACKAGE_NAME]


def run_update_command() -> bool:
    """Install the latest PyPI launcher release and report whether it changed."""
    latest = check_pypi_update()
    if latest is None:
        print(f"Orion {VERSION} is already up to date.")
        return False
    print(f"Updating Orion {VERSION} to {latest}...")
    run_checked(update_install_command(detect_install_channel()))
    print(f"Orion {latest} installed. Run orion again to start the new version.")
    return True


def run_checked(command: list[str], cwd: Path | None = None) -> None:
    """Run a subprocess command and raise when it fails."""
    subprocess.run(command, cwd=cwd, check=True)


def parse_node_version(output: str) -> tuple[int, int, int] | None:
    """Parse a Node.js `vX.Y.Z` version string."""
    text = output.strip().lstrip("v")
    parts = text.split(".")
    if len(parts) < 3:
        return None
    try:
        return int(parts[0]), int(parts[1]), int(parts[2])
    except ValueError:
        return None


def system_node() -> str | None:
    """Return a usable system Node executable, or None if missing/too old."""
    node = shutil.which("node")
    if not node:
        return None
    try:
        result = subprocess.run(
            [node, "--version"],
            check=True,
            text=True,
            capture_output=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    version = parse_node_version(result.stdout)
    if version and version[0] >= 20:
        return node
    return None


def node_cpu_arch() -> str:
    """Return the CPU architecture slug used for portable Node downloads."""
    machine = platform.machine().lower()
    if machine in {"arm64", "aarch64"}:
        return "arm64"

    if sys.platform == "win32":
        # x64 Python can run under emulation on ARM64 Windows; honor the OS CPU.
        native = os.environ.get("PROCESSOR_ARCHITEW6432") or os.environ.get(
            "PROCESSOR_ARCHITECTURE", ""
        )
        if native.upper() == "ARM64":
            return "arm64"

    return "x64"


def node_platform_slug() -> tuple[str, str]:
    """Return the Node distribution platform slug and archive extension."""
    arch = node_cpu_arch()
    if sys.platform == "win32":
        return f"win-{arch}", "zip"
    if sys.platform == "darwin":
        return f"darwin-{arch}", "tar.gz"
    return f"linux-{arch}", "tar.gz"


def format_download_size(byte_count: int) -> str:
    """Format a byte count for compact CLI download progress."""
    value = float(byte_count)
    for unit in ("B", "KB", "MB", "GB"):
        if value < 1024 or unit == "GB":
            if unit == "B":
                return f"{int(value)} {unit}"
            return f"{value:.1f} {unit}"
        value /= 1024
    return f"{value:.1f} GB"


def parse_content_length(value: str | None) -> int | None:
    """Parse an HTTP Content-Length header when it is present and valid."""
    if value is None:
        return None
    try:
        length = int(value)
    except ValueError:
        return None
    return length if length > 0 else None


def render_download_progress(downloaded: int, total: int | None) -> str:
    """Return a single-line progress bar for a streaming download."""
    if total is None:
        return f"{format_download_size(downloaded)} downloaded"

    ratio = min(downloaded / total, 1)
    filled = int(DOWNLOAD_PROGRESS_WIDTH * ratio)
    bar = "#" * filled + "-" * (DOWNLOAD_PROGRESS_WIDTH - filled)
    current = format_download_size(downloaded)
    expected = format_download_size(total)
    return f"[{bar}] {ratio * 100:5.1f}% {current} / {expected}"


def write_download_progress(downloaded: int, total: int | None) -> None:
    """Write an in-place download progress update for interactive terminals."""
    sys.stderr.write(f"\r{render_download_progress(downloaded, total)}")
    sys.stderr.flush()


def download_file(url: str, destination: Path, show_progress: bool = False) -> None:
    """Download a URL to a destination path, optionally showing progress."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url) as response, destination.open("wb") as handle:
        total = parse_content_length(response.headers.get("Content-Length"))
        progress_enabled = show_progress and sys.stderr.isatty()
        downloaded = 0
        while True:
            chunk = response.read(DOWNLOAD_CHUNK_SIZE)
            if not chunk:
                break
            handle.write(chunk)
            downloaded += len(chunk)
            if progress_enabled:
                write_download_progress(downloaded, total)
        if progress_enabled:
            write_download_progress(downloaded, total)
            sys.stderr.write("\n")
            sys.stderr.flush()


def ensure_node(assume_yes: bool) -> str:
    """Return a Node 20+ executable, downloading portable Node when needed."""
    existing = system_node()
    if existing:
        return existing

    if not confirm(
        "Orion needs Node.js 20+ to run the local app. Download portable Node into ~/.orion/runtime?",
        assume_yes,
    ):
        raise SystemExit("Setup declined. Install Node.js 20+ or rerun `orion --yes`.")

    slug, ext = node_platform_slug()
    node_root = runtime_dir() / "node" / NODE_VERSION
    extracted = node_root / f"node-{NODE_VERSION}-{slug}"
    node_path = extracted / ("node.exe" if sys.platform == "win32" else "bin/node")
    if node_path.exists():
        return str(node_path)

    archive = node_root / f"node-{NODE_VERSION}-{slug}.{ext}"
    url = f"https://nodejs.org/dist/{NODE_VERSION}/node-{NODE_VERSION}-{slug}.{ext}"
    print(f"Downloading Node.js from {url}")
    download_file(url, archive)
    if ext == "zip":
        with zipfile.ZipFile(archive) as zf:
            zf.extractall(node_root)
    else:
        with tarfile.open(archive) as tf:
            tf.extractall(node_root)
    return str(node_path)


def ensure_app_bundle(assume_yes: bool) -> Path:
    """Return the Orion app bundle directory, downloading it when absent."""
    directory = app_dir()
    if (directory / "server.js").exists():
        return directory

    url = os.environ.get("ORION_APP_BUNDLE_URL", DEFAULT_APP_BUNDLE_URL)
    if not confirm(
        f"Download the Orion app bundle into {directory}?",
        assume_yes,
    ):
        raise SystemExit("Setup declined. Set ORION_APP_BUNDLE_URL or install through npm.")

    archive = runtime_dir() / "downloads" / f"orion-app-{VERSION}.tar.gz"
    print(f"Downloading Orion app bundle from {url}")
    download_file(url, archive, show_progress=True)
    directory.parent.mkdir(parents=True, exist_ok=True)
    if directory.exists():
        shutil.rmtree(directory)
    directory.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive) as tf:
        tf.extractall(directory)
    if not (directory / "server.js").exists():
        children = [child for child in directory.iterdir()]
        if len(children) == 1 and (children[0] / "server.js").exists():
            extracted_root = children[0]
            for child in extracted_root.iterdir():
                shutil.move(str(child), directory)
            extracted_root.rmdir()
    if not (directory / "server.js").exists():
        raise SystemExit(
            "Downloaded Orion app bundle did not contain server.js. "
            "Run `orion doctor --json`, or reset cached data with "
            "`orion uninstall --all --yes` and retry."
        )
    return directory


def has_jupyter(python: str) -> bool:
    """Return whether a Python executable can import Jupyter Server."""
    return has_jupyter_command([python])


def has_jupyter_command(command: list[str]) -> bool:
    """Return whether a Python command can import Jupyter Server."""
    try:
        subprocess.run(
            [*command, "-c", "import jupyter_server"],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return True
    except (OSError, subprocess.CalledProcessError):
        return False


def inspect_python_executable(command: list[str]) -> str | None:
    """Return the concrete Python executable for a command, if it can be inspected."""
    try:
        result = subprocess.run(
            [
                *command,
                "-c",
                "import json, sys; print(json.dumps({'executable': sys.executable}))",
            ],
            check=True,
            text=True,
            capture_output=True,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        return None

    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError:
        return None
    executable = data.get("executable")
    return executable if isinstance(executable, str) and executable else None


def resolve_existing_jupyter_python() -> str | None:
    """Return a discovered Python executable that can start Jupyter Server."""
    seen: set[tuple[str, ...]] = set()
    seen_executables: set[str] = set()
    for command in python_discovery_candidates():
        key = tuple(command)
        if key in seen:
            continue
        seen.add(key)
        if not has_jupyter_command(command):
            continue
        executable = inspect_python_executable(command) or command[0]
        if executable in seen_executables:
            continue
        seen_executables.add(executable)
        return executable
    return None


def venv_python_support(python: str) -> str:
    """Return Orion's support tier for a venv Python executable."""
    result = subprocess.run(
        [python, "-c", "import sys; print(*sys.version_info[:3])"],
        check=True,
        text=True,
        capture_output=True,
    )
    major, minor, patch = (int(part) for part in result.stdout.strip().split())
    support = get_python_support((major, minor, patch))
    if support is None:
        raise SystemExit("Orion-managed runtime requires Python 3.8+.")
    return support


def sync_managed_runtime_packages(python: str) -> None:
    """Install or upgrade managed runtime packages in Orion's venv."""
    support = venv_python_support(python)
    packages = managed_runtime_packages(VERSION, support)
    print(f"Syncing Orion-managed runtime packages ({', '.join(packages)})...")
    run_checked([python, "-m", "pip", "install", "--upgrade", "pip", *packages])


def python_discovery_candidates() -> list[list[str]]:
    """Return Python commands worth probing for managed venv creation."""
    candidates: list[list[str]] = []

    python_override = os.environ.get("PYTHON")
    if python_override:
        candidates.append([python_override])

    if os.name == "nt" and shutil.which("py"):
        candidates.append(["py", "-3"])
    if shutil.which("python3"):
        candidates.append(["python3"])
    if shutil.which("python"):
        candidates.append(["python"])

    conda_prefix = os.environ.get("CONDA_PREFIX")
    if conda_prefix:
        conda_python = (
            Path(conda_prefix) / "Scripts" / "python.exe"
            if os.name == "nt"
            else Path(conda_prefix) / "bin" / "python"
        )
        if conda_python.exists():
            candidates.insert(1 if python_override else 0, [str(conda_python)])

    candidates.append([sys.executable])
    return candidates


def python_command_supported(command: list[str]) -> bool:
    """Return whether a Python command supports Orion's managed runtime."""
    try:
        subprocess.run(
            command
            + ["-c", "import sys; raise SystemExit(0 if sys.version_info >= (3, 8) else 1)"],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return True
    except (OSError, subprocess.CalledProcessError):
        return False


def resolve_venv_creation_python() -> list[str]:
    """Return the Python command used to create Orion's managed venv."""
    seen: set[tuple[str, ...]] = set()
    for candidate in python_discovery_candidates():
        key = tuple(candidate)
        if key in seen:
            continue
        seen.add(key)
        if python_command_supported(candidate):
            return candidate
    return [sys.executable]


def create_managed_venv() -> None:
    """Create Orion's managed venv using a discovered host Python."""
    runtime_dir().mkdir(parents=True, exist_ok=True)
    venv_path = runtime_dir() / "venv"
    host_python = resolve_venv_creation_python()
    run_checked([*host_python, "-m", "venv", str(venv_path)])


def install_managed_jupyter(assume_yes: bool) -> str:
    """Create/update Orion's managed venv and install Jupyter packages there."""
    py = managed_venv_python()
    if not py.exists():
        if not confirm(
            "Orion needs a local Jupyter runtime. Create it under ~/.orion/runtime?",
            assume_yes,
        ):
            raise SystemExit("Setup declined. Install Jupyter or rerun `orion --yes`.")
        runtime_dir().mkdir(parents=True, exist_ok=True)
        create_managed_venv()

    sync_managed_runtime_packages(str(py))
    return str(py)


def free_port() -> int:
    """Return a free port bound to 127.0.0.1."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def jupyter_json(base_url: str, endpoint: str, token: str) -> Any:
    """Fetch JSON from a Jupyter API endpoint with token auth."""
    url = f"{base_url.rstrip('/')}/{endpoint}?token={token}"
    request = urllib.request.Request(url, headers={"Authorization": f"token {token}"})
    with urllib.request.urlopen(request, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))


def read_process_log_tail(log: Any, limit: int = 4000) -> str:
    """Return the tail of a temporary process log without assuming text encoding."""
    try:
        log.flush()
        size = log.tell()
        log.seek(max(0, size - limit))
        data = log.read()
    except OSError:
        return ""
    if isinstance(data, str):
        return data.strip()
    return data.decode("utf-8", errors="replace").strip()


def jupyter_start_message(message: str, log: Any | None = None) -> str:
    """Append recent Jupyter output to a startup failure message when available."""
    if log is None:
        return message
    tail = read_process_log_tail(log)
    if not tail:
        return message
    return f"{message}\n\nRecent Jupyter output:\n{tail}"


def start_jupyter(
    python: str,
    cwd: Path | None = None,
) -> tuple[subprocess.Popen[bytes], str, str, dict[str, bool], str]:
    """Start Jupyter Server and return process, URL, token, capabilities, version."""
    port = free_port()
    token = secrets.token_hex(24)
    base_url = f"http://127.0.0.1:{port}/"
    log = tempfile.TemporaryFile()
    try:
        proc = subprocess.Popen(
            [
                python,
                "-m",
                "jupyter_server",
                "--no-browser",
                "--ip=127.0.0.1",
                f"--port={port}",
                f"--ServerApp.token={token}",
                "--ServerApp.allow_origin=*",
                "--ServerApp.disable_check_xsrf=True",
            ],
            cwd=cwd or Path.home(),
            stdout=log,
            stderr=subprocess.STDOUT,
        )
    except OSError as error:
        log.close()
        raise JupyterStartError(
            f"Could not start Jupyter with {python}: {error}",
            "spawn_failed",
        ) from error

    deadline = time.time() + 90
    while time.time() < deadline:
        if proc.poll() is not None:
            message = jupyter_start_message(
                "Jupyter exited before it became ready.",
                log,
            )
            log.close()
            raise JupyterStartError(
                message,
                "early_exit",
            )
        try:
            api = jupyter_json(base_url, "api", token)
            break
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            time.sleep(0.3)
    else:
        proc.terminate()
        message = jupyter_start_message(
            "Jupyter did not become ready before the timeout.",
            log,
        )
        log.close()
        raise JupyterStartError(
            message,
            "timeout",
        )

    capabilities = {
        "kernelspecs": isinstance(jupyter_json(base_url, "api/kernelspecs", token).get("kernelspecs"), dict),
        "sessions": isinstance(jupyter_json(base_url, "api/sessions", token), list),
        "kernels": isinstance(jupyter_json(base_url, "api/kernels", token), list),
        "contents": isinstance(jupyter_json(base_url, "api/contents", token), dict),
        "terminals": isinstance(jupyter_json(base_url, "api/terminals", token), list),
        "sysInfo": False,
    }
    try:
        jupyter_json(base_url, "api/sys_info", token)
        capabilities["sysInfo"] = True
    except Exception:
        capabilities["sysInfo"] = False

    missing = [name for name in ("kernelspecs", "sessions", "kernels", "contents", "terminals") if not capabilities[name]]
    if missing:
        proc.terminate()
        message = jupyter_start_message(
            f"Jupyter is missing required APIs: {', '.join(missing)}",
            log,
        )
        log.close()
        raise JupyterStartError(
            message,
            "missing_apis",
        )
    version = str(api.get("version") or api.get("server_version") or api.get("jupyter_server_version") or "unknown")
    log.close()
    return proc, base_url, token, capabilities, version


def write_handoff(
    base_url: str,
    token: str,
    python: str,
    root_directory: Path,
    capabilities: dict[str, bool],
    version: str,
    source: str,
) -> None:
    """Write the Jupyter connection handoff consumed by the Orion app."""
    handoff_path().parent.mkdir(parents=True, exist_ok=True)
    handoff_path().write_text(
        json.dumps(
            {
                "baseUrl": base_url,
                "token": token,
                "source": source,
                "pythonPath": python,
                "rootDirectory": str(root_directory),
                "jupyterVersion": version,
                "capabilities": capabilities,
                "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def ensure_native_modules(node: str, app: Path) -> None:
    """Rebuild bundled native modules when the app bundle was built on another OS."""
    script = app / "ensure-native-modules.js"
    if not script.exists():
        return

    print("Checking platform-native dependencies...")
    try:
        subprocess.run([node, str(script)], cwd=app, check=True)
    except subprocess.CalledProcessError as error:
        raise SystemExit(
            "Orion failed while checking platform-native dependencies.\n"
            "Try one of the following:\n"
            "  1. Upgrade the launcher: pip install -U orion-notebook\n"
            "  2. Clear the cached app bundle: orion uninstall -y\n"
            "  3. Check diagnostics: orion doctor --json\n"
            "  4. If the cache is broken, reset it: orion uninstall --all --yes\n"
            "  5. Retry: orion --yes\n"
            "If the problem persists, report it at "
            "https://github.com/nicolasakf/Orion-app/issues\n"
            f"Details: {error}"
        ) from error


def build_node_env(node: str) -> dict[str, str]:
    """Return an environment with the active Node binary directory on PATH."""
    node_directory = str(Path(node).parent)
    path_separator = ";" if os.name == "nt" else ":"
    existing_path = os.environ.get("PATH") or os.environ.get("Path") or ""
    next_path = f"{node_directory}{path_separator}{existing_path}" if existing_path else node_directory
    env = {**os.environ, "PATH": next_path}
    if os.name == "nt":
        env["Path"] = next_path
    return env


def start_orion_app(node: str, app: Path) -> tuple[subprocess.Popen[bytes], str]:
    """Start the local Orion Next server."""
    ensure_native_modules(node, app)
    port = int(os.environ.get("ORION_PORT", "3001"))
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        if sock.connect_ex(("127.0.0.1", port)) == 0:
            port = free_port()

    env = {
        **build_node_env(node),
        "HOSTNAME": "127.0.0.1",
        "NODE_ENV": "production",
        "PORT": str(port),
        "ORION_LAUNCH_MODE": "cli",
        "ORION_INSTALL_CHANNEL": detect_install_channel(),
        "ORION_CURRENT_VERSION": VERSION,
        "ORION_LAUNCHER_EXECUTABLE": (
            shutil.which("uv") or "uv"
            if detect_install_channel() == "uv"
            else sys.executable
        ),
    }
    # Node's default 16 KiB header limit rejects browsers with large localhost cookie jars (HTTP 431).
    proc = subprocess.Popen(
        [node, "--max-http-header-size=65536", str(app / "server.js")],
        cwd=app,
        env=env,
    )
    return proc, f"http://127.0.0.1:{port}"


def app_bundle_archive() -> Path:
    """Return the cached GitHub app bundle archive for this version."""
    return runtime_dir() / "downloads" / f"orion-app-{VERSION}.tar.gz"


def redact_path(value: str | Path | None) -> str | None:
    """Redact the user's home directory from diagnostic paths."""
    if value is None:
        return None
    text = str(value)
    home = str(Path.home())
    userprofile = os.environ.get("USERPROFILE")
    replacements = [(home, "~")]
    if userprofile:
        replacements.append((userprofile, "%USERPROFILE%"))
    for prefix, replacement in replacements:
        if text.startswith(prefix):
            return f"{replacement}{text[len(prefix):]}"
    return text


def path_summary() -> dict[str, Any]:
    """Return a compact PATH summary without dumping the full environment."""
    raw_path = os.environ.get("PATH") or os.environ.get("Path") or ""
    entries = [entry for entry in raw_path.split(os.pathsep) if entry]
    return {
        "count": len(entries),
        "entries": [redact_path(entry) for entry in entries[:12]],
    }


def command_status(command: str, args: list[str] | None = None) -> dict[str, Any]:
    """Return availability and version information for one command."""
    command_args = args or ["--version"]
    status: dict[str, Any] = {
        "available": False,
        "command": " ".join([command, *command_args]),
    }
    resolved = shutil.which(command)
    if resolved:
        status["path"] = redact_path(resolved)

    try:
        result = subprocess.run(
            [command, *command_args],
            text=True,
            capture_output=True,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as error:
        status["error"] = str(error)
        return status

    status["available"] = result.returncode == 0
    output = f"{result.stdout}{result.stderr}".strip()
    if output:
        first_line = output.splitlines()[0]
        if result.returncode == 0:
            status["version"] = first_line
        else:
            status["error"] = first_line
    return status


def detect_install_channel() -> str:
    """Infer whether the Python launcher is running from uv or pip."""
    prefix = str(Path(sys.prefix)).lower()
    executable = str(Path(sys.executable)).lower()
    if "uv" in prefix and "tool" in prefix:
        return "uv"
    if "uv" in executable and "tool" in executable:
        return "uv"
    return "pip"


def detect_conda() -> dict[str, Any]:
    """Return whether conda is visible in the current shell."""
    return {
        "detected": bool(
            os.environ.get("CONDA_PREFIX")
            or os.environ.get("CONDA_DEFAULT_ENV")
            or shutil.which("conda")
            or shutil.which("mamba")
        ),
        "prefix": redact_path(os.environ.get("CONDA_PREFIX")),
        "environment": os.environ.get("CONDA_DEFAULT_ENV"),
    }


def writable_check(directory: Path) -> dict[str, Any]:
    """Check whether Orion can write under its runtime directory."""
    test_file = directory / ".doctor-write-test"
    try:
        directory.mkdir(parents=True, exist_ok=True)
        test_file.write_text("ok\n", encoding="utf-8")
        test_file.unlink()
        return {"ok": True, "path": redact_path(directory)}
    except OSError as error:
        return {
            "ok": False,
            "path": redact_path(directory),
            "error": str(error),
        }


def network_check(url: str) -> dict[str, Any]:
    """Perform a small network reachability check for setup dependencies."""
    try:
        request = urllib.request.Request(url, method="HEAD")
        with urllib.request.urlopen(request, timeout=5) as response:
            return {"ok": 200 <= response.status < 400, "url": url, "status": response.status}
    except Exception as error:
        return {"ok": False, "url": url, "error": str(error)}


def portable_node_status() -> dict[str, Any]:
    """Return system and Orion-managed Node.js state."""
    slug, _ext = node_platform_slug()
    managed_root = runtime_dir() / "node" / NODE_VERSION
    managed_node = managed_root / f"node-{NODE_VERSION}-{slug}"
    node_path = managed_node / ("node.exe" if sys.platform == "win32" else "bin/node")
    return {
        "system": redact_path(system_node()),
        "managedPath": redact_path(node_path),
        "managedPresent": node_path.exists(),
        "version": NODE_VERSION,
    }


def app_bundle_status() -> dict[str, Any]:
    """Return the PyPI launcher's cached app bundle state."""
    directory = app_dir()
    archive = app_bundle_archive()
    return {
        "source": os.environ.get("ORION_APP_BUNDLE_URL", DEFAULT_APP_BUNDLE_URL),
        "path": redact_path(directory),
        "present": directory.exists(),
        "serverJs": (directory / "server.js").exists(),
        "archive": redact_path(archive),
        "archivePresent": archive.exists(),
    }


def python_candidate_status(command: list[str]) -> dict[str, Any]:
    """Inspect one Python candidate for diagnostics."""
    status: dict[str, Any] = {
        "command": command,
        "available": False,
        "supported": False,
        "jupyter": False,
    }
    try:
        result = subprocess.run(
            [
                *command,
                "-c",
                (
                    "import json, sys; "
                    "print(json.dumps({'executable': sys.executable, "
                    "'version': list(sys.version_info[:3])}))"
                ),
            ],
            text=True,
            capture_output=True,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as error:
        status["error"] = str(error)
        return status

    if result.returncode != 0:
        status["error"] = (result.stderr or result.stdout).strip().splitlines()[:1]
        return status

    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        status["error"] = str(error)
        return status

    version = tuple(int(part) for part in data["version"][:3])
    support = get_python_support(version)
    executable = str(data["executable"])
    status.update(
        {
            "available": True,
            "supported": support is not None,
            "support": support,
            "executable": redact_path(executable),
            "version": list(version),
            "jupyter": has_jupyter(executable),
        }
    )
    return status


def python_status() -> dict[str, Any]:
    """Return Python/Jupyter discovery state."""
    seen: set[tuple[str, ...]] = set()
    candidates: list[dict[str, Any]] = []
    for command in python_discovery_candidates():
        key = tuple(command)
        if key in seen:
            continue
        seen.add(key)
        candidates.append(python_candidate_status(command))
    return {
        "candidates": candidates,
        "managedVenvPython": redact_path(managed_venv_python()),
        "managedVenvPresent": managed_venv_python().exists(),
        "venvCreationPython": [redact_path(part) for part in resolve_venv_creation_python()],
    }


def jupyter_handoff_status() -> dict[str, Any]:
    """Check a previous Jupyter handoff if it is still running."""
    path = handoff_path()
    if not path.exists():
        return {"status": "not_checked", "source": "handoff"}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        base_url = str(data.get("baseUrl", ""))
        token = str(data.get("token", ""))
        api = jupyter_json(base_url, "api", token)
        capabilities = {
            "kernelspecs": isinstance(
                jupyter_json(base_url, "api/kernelspecs", token).get("kernelspecs"),
                dict,
            ),
            "sessions": isinstance(jupyter_json(base_url, "api/sessions", token), list),
            "kernels": isinstance(jupyter_json(base_url, "api/kernels", token), list),
            "contents": isinstance(jupyter_json(base_url, "api/contents", token), dict),
            "terminals": isinstance(jupyter_json(base_url, "api/terminals", token), list),
        }
        missing = [name for name, ok in capabilities.items() if not ok]
        return {
            "status": "ready" if not missing else "failed",
            "source": "handoff",
            "baseUrl": base_url,
            "jupyterVersion": str(
                api.get("version")
                or api.get("server_version")
                or api.get("jupyter_server_version")
                or "unknown"
            ),
            "capabilities": capabilities,
            "missing": missing,
        }
    except Exception as error:
        return {"status": "failed", "source": "handoff", "error": str(error)}


@contextmanager
def stdout_to_stderr(enabled: bool) -> Iterator[None]:
    """Redirect stdout, including subprocess stdout, while JSON is being built."""
    if not enabled:
        yield
        return

    try:
        sys.stdout.flush()
        saved_stdout = os.dup(sys.stdout.fileno())
        os.dup2(sys.stderr.fileno(), sys.stdout.fileno())
    except (AttributeError, OSError):
        yield
        return

    try:
        yield
    finally:
        sys.stdout.flush()
        os.dup2(saved_stdout, sys.stdout.fileno())
        os.close(saved_stdout)


def run_setup_check() -> dict[str, Any]:
    """Run first-run setup without starting the Orion app or browser."""
    jupyter_proc: subprocess.Popen[bytes] | None = None
    try:
        app = ensure_app_bundle(True)
        node = ensure_node(True)
        ensure_native_modules(node, app)

        jupyter_root = Path.home()
        existing_python = resolve_existing_jupyter_python()
        uses_existing_jupyter = existing_python is not None
        python = existing_python if existing_python is not None else install_managed_jupyter(True)
        try:
            jupyter_proc, base_url, token, capabilities, version = start_jupyter(
                python, jupyter_root
            )
        except JupyterStartError:
            if not uses_existing_jupyter:
                raise
            python = install_managed_jupyter(True)
            uses_existing_jupyter = False
            jupyter_proc, base_url, token, capabilities, version = start_jupyter(
                python, jupyter_root
            )
        write_handoff(
            base_url,
            token,
            python,
            jupyter_root,
            capabilities,
            version,
            "existing" if uses_existing_jupyter else "managed",
        )
        return {
            "status": "ready",
            "source": "setup",
            "baseUrl": base_url,
            "jupyterVersion": version,
            "capabilities": capabilities,
        }
    except Exception as error:
        return {"status": "failed", "source": "setup", "error": str(error)}
    finally:
        if jupyter_proc is not None:
            jupyter_proc.terminate()


def build_doctor_report(setup: bool, json_output: bool) -> dict[str, Any]:
    """Build a machine-readable Orion installation diagnostic report."""
    app_status = app_bundle_status()
    writable = writable_check(runtime_dir())
    network = [
        network_check("https://pypi.org/simple/orion-notebook/"),
        network_check("https://nodejs.org/dist/"),
        network_check(os.environ.get("ORION_APP_BUNDLE_URL", DEFAULT_APP_BUNDLE_URL)),
    ]

    with stdout_to_stderr(json_output):
        jupyter = run_setup_check() if setup else jupyter_handoff_status()

    app_status = app_bundle_status()
    errors: list[str] = []
    warnings: list[str] = []
    if not writable["ok"]:
        errors.append("Orion runtime directory is not writable.")
    if setup and not app_status["serverJs"]:
        errors.append("App bundle setup failed.")
    if setup and jupyter["status"] != "ready":
        errors.append("Jupyter setup check failed.")
    if not setup and not app_status["serverJs"]:
        warnings.append("App bundle has not been downloaded yet. Run `orion doctor --setup`.")
    for check in network:
        if not check["ok"]:
            warnings.append(f"Network check failed for {check['url']}.")

    report = {
        "ok": not errors,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "version": VERSION,
        "install": {
            "channel": detect_install_channel(),
            "executable": redact_path(sys.argv[0]),
            "python": redact_path(sys.executable),
        },
        "system": {
            "platform": sys.platform,
            "os": platform.system(),
            "release": platform.release(),
            "machine": platform.machine(),
            "shell": os.environ.get("SHELL") or os.environ.get("ComSpec"),
        },
        "paths": {
            "orionHome": redact_path(orion_home()),
            "runtime": redact_path(runtime_dir()),
            "managedVenv": redact_path(runtime_dir() / "venv"),
            "path": path_summary(),
        },
        "conda": detect_conda(),
        "commands": {
            "node": command_status("node"),
            "npm": command_status("npm"),
            "python": command_status("python"),
            "python3": command_status("python3"),
            "py": command_status("py", ["-3", "--version"]),
            "pip": command_status("pip"),
            "uv": command_status("uv"),
        },
        "appBundle": app_status,
        "portableNode": portable_node_status(),
        "python": python_status(),
        "jupyter": jupyter,
        "checks": {
            "writable": writable,
            "network": network,
        },
        "warnings": warnings,
        "errors": errors,
    }
    return report


def print_doctor_report(report: dict[str, Any]) -> None:
    """Print a readable doctor report for terminal users."""
    print("Orion doctor")
    print(f"Version: {report['version']}")
    print(f"Install channel: {report['install']['channel']}")
    print(f"Platform: {report['system']['platform']} {report['system']['machine']}")
    print(f"Orion home: {report['paths']['orionHome']}")
    print("")
    print(
        "App bundle: "
        f"{'ready' if report['appBundle']['serverJs'] else 'missing'} "
        f"({report['appBundle']['path']})"
    )
    print(
        "Portable Node: "
        f"{'ready' if report['portableNode']['system'] or report['portableNode']['managedPresent'] else 'missing'}"
    )
    print(
        "Managed runtime writable: "
        f"{'yes' if report['checks']['writable']['ok'] else 'no'} "
        f"({report['checks']['writable']['path']})"
    )
    ready_python = [
        candidate
        for candidate in report["python"]["candidates"]
        if candidate.get("supported") and candidate.get("jupyter")
    ]
    print(f"Python ready installs: {len(ready_python)}")
    print(f"Jupyter: {report['jupyter']['status']}")
    if report["jupyter"].get("error"):
        print(f"Jupyter error: {report['jupyter']['error']}")
    print("")
    print("Commands:")
    for name, status in report["commands"].items():
        value = status.get("version") if status.get("available") else "missing"
        print(f"  {name}: {value}")
    if report["warnings"]:
        print("")
        print("Warnings:")
        for warning in report["warnings"]:
            print(f"  - {warning}")
    if report["errors"]:
        print("")
        print("Errors:")
        for error in report["errors"]:
            print(f"  - {error}")
        print("")
        print("Try `orion uninstall --all --yes`, then rerun `orion doctor --setup`.")


def doctor_main(argv: list[str]) -> None:
    """Run the Orion doctor subcommand."""
    parser = argparse.ArgumentParser(description="Diagnose Orion installation state.")
    parser.add_argument("--json", action="store_true", help="Print JSON diagnostics.")
    parser.add_argument(
        "--setup",
        action="store_true",
        help="Run first-run setup checks without opening the browser.",
    )
    args = parser.parse_args(argv)
    report = build_doctor_report(args.setup, args.json)
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print_doctor_report(report)
    if not report["ok"]:
        raise SystemExit(1)


def remove_path(path: Path) -> bool:
    """Remove a file or directory when it exists."""
    if not path.exists():
        return False
    if path.is_dir():
        shutil.rmtree(path)
    else:
        path.unlink()
    return True


def run_uninstall(assume_yes: bool, remove_all: bool) -> None:
    """Remove Orion-managed cache data under ~/.orion."""
    if remove_all:
        home = orion_home()
        if not home.exists():
            print("Nothing to remove.")
            run_package_uninstall()
            return
        if not confirm(
            f"Remove all Orion data under {home}? "
            "This deletes cached app bundles, Jupyter venv, and portable Node.",
            assume_yes,
        ):
            raise SystemExit("Uninstall declined.")
        shutil.rmtree(home)
        print(f"Removed:\n  - {home}")
        run_package_uninstall()
        return

    targets = [app_dir(), app_bundle_archive()]
    existing = [path for path in targets if path.exists()]
    if not existing:
        print("Nothing to remove.")
        print("Expected locations were already absent.")
        run_package_uninstall()
        return

    if not confirm(
        "Remove Orion cached data for "
        f"v{VERSION}?\n" + "\n".join(f"  - {path}" for path in existing),
        assume_yes,
    ):
        raise SystemExit("Uninstall declined.")

    removed: list[Path] = []
    for path in targets:
        if remove_path(path):
            removed.append(path)

    if removed:
        print("Removed:")
        for path in removed:
            print(f"  - {path}")
    else:
        print("Nothing to remove.")

    run_package_uninstall()


PACKAGE_NAME = "orion-notebook"


def _defer_shell(command: str) -> None:
    """Run a shell command after this process exits so self-uninstall can succeed."""
    if sys.platform == "win32":
        subprocess.Popen(
            ["cmd", "/c", f"timeout /t 2 /nobreak >nul & {command}"],
            creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP,
            close_fds=True,
        )
        return
    subprocess.Popen(
        ["sh", "-c", f"sleep 2 && {command}"],
        start_new_session=True,
        close_fds=True,
    )


def _is_not_installed_output(output: str) -> bool:
    """Return whether uninstall output indicates the package was not installed."""
    lower = output.lower()
    return any(
        phrase in lower
        for phrase in (
            "not installed",
            "cannot uninstall",
            "no such package",
            "is not installed",
            "skipping",
        )
    )


def _run_sync(command: list[str]) -> tuple[bool, str]:
    """Run a command synchronously and return success plus combined output."""
    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        check=False,
        timeout=120,
    )
    output = f"{result.stdout}{result.stderr}".strip()
    return result.returncode == 0, output


def run_package_uninstall() -> None:
    """Remove orion-notebook from npm, pip, and uv when present."""
    running_from = detect_install_channel()
    removed: list[str] = []
    deferred: list[str] = []
    errors: list[tuple[str, str]] = []

    npm = shutil.which("npm")
    if npm:
        if running_from == "npm":
            _defer_shell(f'"{npm}" uninstall -g {PACKAGE_NAME}')
            deferred.append("npm")
        else:
            ok, output = _run_sync([npm, "uninstall", "-g", PACKAGE_NAME])
            if ok:
                removed.append("npm")
            elif not _is_not_installed_output(output):
                errors.append(("npm", output.splitlines()[0] if output else "npm uninstall failed"))

    python = shutil.which("python3") or shutil.which("python")
    if python:
        pip_args = [python, "-m", "pip", "uninstall", "-y", PACKAGE_NAME]
        if running_from == "pip":
            _defer_shell(" ".join(f'"{part}"' if " " in part else part for part in pip_args))
            deferred.append("pip")
        else:
            ok, output = _run_sync(pip_args)
            if ok:
                removed.append("pip")
            elif not _is_not_installed_output(output):
                errors.append(("pip", output.splitlines()[0] if output else "pip uninstall failed"))

    uv = shutil.which("uv")
    if uv:
        uv_args = [uv, "tool", "uninstall", PACKAGE_NAME]
        if running_from == "uv":
            _defer_shell(" ".join(f'"{part}"' if " " in part else part for part in uv_args))
            deferred.append("uv")
        else:
            ok, output = _run_sync(uv_args)
            if ok:
                removed.append("uv")
            elif not _is_not_installed_output(output):
                errors.append(("uv", output.splitlines()[0] if output else "uv tool uninstall failed"))

    print("")
    for channel in removed:
        print(f"Removed orion-notebook ({channel}).")
    for channel in deferred:
        print(f"Removing orion-notebook ({channel}) after exit...")
    for channel, message in errors:
        print(f"Could not remove orion-notebook ({channel}): {message}")
    if not removed and not deferred and not errors:
        print("No orion-notebook package installation found to remove.")


def print_usage() -> None:
    """Print top-level Orion CLI usage for pip/uv installs."""
    print(
        """Usage: orion [--yes] [--no-browser] [--here] [--app-only]
       orion doctor [--json] [--setup]
       orion update
       orion uninstall [--yes] [--all]

Starts a local Orion app, starts Jupyter Server, and opens Orion already connected.

Commands:
  (default)      Start Orion locally (options below apply to this command).
  doctor         Diagnose install, app bundle, Python/Jupyter, and network state.
  update         Install the latest Orion release and exit.
  uninstall      Remove cached Orion data under ~/.orion before package uninstall.

Options (default command):
  -V, --version  Print the Orion CLI version and exit.
  -y, --yes      Approve Orion-managed setup prompts.
  --no-browser   Start services without opening a browser.
  --here         Start Jupyter from the current directory instead of ~.
  --app-only     Start only the Orion app (skip Jupyter). Connect to an existing
                 Jupyter server from the UI, or use a prior handoff file."""
    )


def print_update_usage() -> None:
    """Print usage for the Orion update subcommand."""
    print(
        """Usage: orion update

Install the latest Orion release from PyPI (or uv tool) and exit."""
    )


def uninstall_main(argv: list[str]) -> None:
    """Run the Orion uninstall subcommand."""
    parser = argparse.ArgumentParser(description="Remove Orion-managed cache data.")
    parser.add_argument("-y", "--yes", action="store_true", help="Approve removal prompts.")
    parser.add_argument(
        "--all",
        action="store_true",
        help="Remove the entire ~/.orion directory.",
    )
    args = parser.parse_args(argv)
    run_uninstall(args.yes, args.all)


def start_main(argv: list[str]) -> None:
    """Run the default Orion start command."""
    parser = argparse.ArgumentParser(description="Start Orion locally.")
    parser.add_argument("-y", "--yes", action="store_true", help="Approve setup prompts.")
    parser.add_argument("--no-browser", action="store_true", help="Do not open a browser.")
    parser.add_argument(
        "--here",
        action="store_true",
        help="Start Jupyter from the current directory instead of ~.",
    )
    parser.add_argument(
        "--app-only",
        action="store_true",
        help=(
            "Start only the Orion app (skip Jupyter). Connect to an existing "
            "Jupyter server from the UI, or use a prior handoff file."
        ),
    )
    args = parser.parse_args(argv)

    latest = None
    try:
        latest = check_pypi_update()
    except Exception as error:
        print(f"Could not check for Orion updates; continuing startup. {error}", file=sys.stderr)
    if latest and confirm(
        f"Orion {latest} is available. Update before starting?", args.yes
    ):
        print(f"Updating Orion {VERSION} to {latest}...")
        try:
            run_checked(update_install_command(detect_install_channel()))
        except (OSError, subprocess.CalledProcessError) as error:
            raise SystemExit(f"Orion update failed: {error}") from error
        print(f"Orion {latest} installed. Run orion again to start the new version.")
        return

    app = ensure_app_bundle(args.yes)
    node = ensure_node(args.yes)
    jupyter_proc: subprocess.Popen[bytes] | None = None

    if args.app_only:
        print("Starting Orion app server only (--app-only)...")
    else:
        jupyter_root = Path.cwd() if args.here else Path.home()
        existing_python = resolve_existing_jupyter_python()
        uses_existing_jupyter = existing_python is not None
        python = existing_python if existing_python is not None else install_managed_jupyter(args.yes)
        try:
            jupyter_proc, base_url, token, capabilities, version = start_jupyter(
                python, jupyter_root
            )
        except JupyterStartError as error:
            if not uses_existing_jupyter:
                raise SystemExit(str(error)) from error
            if error.reason == "missing_apis":
                print(
                    "Existing Jupyter is not compatible with Orion. "
                    "Falling back to an Orion-managed runtime."
                )
            elif error.reason == "timeout":
                print(
                    "Existing Jupyter did not become ready in time. "
                    "Falling back to an Orion-managed runtime."
                )
            else:
                print(
                    "Existing Jupyter failed to start. "
                    "Falling back to an Orion-managed runtime."
                )
            python = install_managed_jupyter(args.yes)
            uses_existing_jupyter = False
            jupyter_proc, base_url, token, capabilities, version = start_jupyter(
                python, jupyter_root
            )
        write_handoff(
            base_url,
            token,
            python,
            jupyter_root,
            capabilities,
            version,
            "existing" if uses_existing_jupyter else "managed",
        )

    app_proc, url = start_orion_app(node, app)

    print(f"Orion is running at {url}")
    if not args.app_only:
        print(f"Jupyter is running at {base_url} (root: {jupyter_root})")
    if not args.no_browser:
        webbrowser.open(url)

    try:
        app_proc.wait()
    finally:
        if jupyter_proc is not None:
            jupyter_proc.terminate()


def main() -> None:
    """Run the PyPI Orion CLI entrypoint."""
    argv = sys.argv[1:]
    if "--version" in argv or "-V" in argv:
        print(VERSION)
        return
    if argv and argv[0] == "uninstall":
        uninstall_main(argv[1:])
        return
    if argv and argv[0] == "doctor":
        doctor_main(argv[1:])
        return
    if argv and argv[0] == "update":
        if "--help" in argv[1:] or "-h" in argv[1:]:
            print_update_usage()
            return
        try:
            run_update_command()
        except Exception as error:
            raise SystemExit(f"Orion update failed: {error}") from error
        return
    if "--help" in argv or "-h" in argv:
        print_usage()
        return
    start_main(argv)


if __name__ == "__main__":
    main()
