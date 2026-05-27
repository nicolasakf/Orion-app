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
import time
import urllib.error
import urllib.request
import venv
import webbrowser
import zipfile
from pathlib import Path
from typing import Any

from .managed_packages import get_python_support, managed_runtime_packages

VERSION = "0.6.2"
NODE_VERSION = "v22.12.0"
DEFAULT_APP_BUNDLE_URL = (
    f"https://github.com/nicolasakf/Orion-app/releases/download/"
    f"v{VERSION}/orion-app-{VERSION}.tar.gz"
)


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


def node_platform_slug() -> tuple[str, str]:
    """Return the Node distribution platform slug and archive extension."""
    machine = platform.machine().lower()
    arch = "arm64" if machine in {"arm64", "aarch64"} else "x64"
    if sys.platform == "win32":
        return f"win-{arch}", "zip"
    if sys.platform == "darwin":
        return f"darwin-{arch}", "tar.gz"
    return f"linux-{arch}", "tar.gz"


def download_file(url: str, destination: Path) -> None:
    """Download a URL to a destination path."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url) as response, destination.open("wb") as handle:
        shutil.copyfileobj(response, handle)


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
    download_file(url, archive)
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
        raise SystemExit("Downloaded Orion app bundle did not contain server.js.")
    return directory


def has_jupyter(python: str) -> bool:
    """Return whether a Python executable can import Jupyter Server."""
    try:
        subprocess.run(
            [python, "-c", "import jupyter_server"],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return True
    except (OSError, subprocess.CalledProcessError):
        return False


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
        venv.EnvBuilder(with_pip=True).create(runtime_dir() / "venv")

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


def start_jupyter(
    python: str,
    cwd: Path | None = None,
) -> tuple[subprocess.Popen[bytes], str, str, dict[str, bool], str]:
    """Start Jupyter Server and return process, URL, token, capabilities, version."""
    port = free_port()
    token = secrets.token_hex(24)
    base_url = f"http://127.0.0.1:{port}/"
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
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    deadline = time.time() + 90
    while time.time() < deadline:
        if proc.poll() not in (None, 0):
            raise SystemExit("Jupyter exited before it became ready.")
        try:
            api = jupyter_json(base_url, "api", token)
            break
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            time.sleep(0.3)
    else:
        proc.terminate()
        raise SystemExit("Jupyter did not become ready before the timeout.")

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
        raise SystemExit(f"Jupyter is missing required APIs: {', '.join(missing)}")
    version = str(api.get("version") or api.get("server_version") or api.get("jupyter_server_version") or "unknown")
    return proc, base_url, token, capabilities, version


def write_handoff(
    base_url: str,
    token: str,
    python: str,
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
                "jupyterVersion": version,
                "capabilities": capabilities,
                "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def start_orion_app(node: str, app: Path) -> tuple[subprocess.Popen[bytes], str]:
    """Start the local Orion Next server."""
    port = int(os.environ.get("ORION_PORT", "3001"))
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        if sock.connect_ex(("127.0.0.1", port)) == 0:
            port = free_port()

    env = {
        **os.environ,
        "HOSTNAME": "127.0.0.1",
        "NODE_ENV": "production",
        "PORT": str(port),
    }
    proc = subprocess.Popen([node, str(app / "server.js")], cwd=app, env=env)
    return proc, f"http://127.0.0.1:{port}"


def app_bundle_archive() -> Path:
    """Return the cached GitHub app bundle archive for this version."""
    return runtime_dir() / "downloads" / f"orion-app-{VERSION}.tar.gz"


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
            return
        if not confirm(
            f"Remove all Orion data under {home}? "
            "This deletes cached app bundles, Jupyter venv, and portable Node.",
            assume_yes,
        ):
            raise SystemExit("Uninstall declined.")
        shutil.rmtree(home)
        print(f"Removed:\n  - {home}")
        print_package_uninstall_hint()
        return

    targets = [app_dir(), app_bundle_archive()]
    existing = [path for path in targets if path.exists()]
    if not existing:
        print("Nothing to remove.")
        print("Expected locations were already absent.")
        print_package_uninstall_hint()
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

    print_package_uninstall_hint()


def print_package_uninstall_hint() -> None:
    """Print how to remove the installed npm or pip package."""
    print("")
    print("To remove the installed package, run:")
    print("  npm uninstall -g orion-notebook")
    print("  pip uninstall orion-notebook")


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

    app = ensure_app_bundle(args.yes)
    node = ensure_node(args.yes)
    jupyter_proc: subprocess.Popen[bytes] | None = None

    if args.app_only:
        print("Starting Orion app server only (--app-only)...")
    else:
        jupyter_root = Path.cwd() if args.here else Path.home()
        uses_existing_jupyter = has_jupyter(sys.executable)
        python = sys.executable if uses_existing_jupyter else install_managed_jupyter(args.yes)
        try:
            jupyter_proc, base_url, token, capabilities, version = start_jupyter(
                python, jupyter_root
            )
        except SystemExit:
            if not uses_existing_jupyter:
                raise
            print(
                "Existing Jupyter is not compatible with Orion. "
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
    start_main(argv)


if __name__ == "__main__":
    main()
