# orion-notebook

Python launcher for [Orion](https://www.orion-agent.ai). Installs the `orion` command on PyPI.

## Install

```bash
pip install orion-notebook
orion
```

## What happens on first run

The PyPI wheel is intentionally small. When you run `orion` for the first time, the CLI may:

1. **Download the Orion app bundle** into `~/.orion/app/<version>` from a GitHub release
2. **Download portable Node.js 20+** into `~/.orion/runtime/node/<version>` if Node is not installed
3. **Create an Orion-managed Jupyter venv** under `~/.orion/runtime/venv` if no compatible Jupyter is found

Each step prompts for consent unless you pass `--yes`:

```bash
orion --yes
```

Managed Jupyter is installed only inside Orion's venv, not into your global Python.

After the first successful setup, later runs start Jupyter, launch Orion, and open your browser much faster.

## Requirements

- Python 3.8+
- Node.js 20+ (downloaded automatically into `~/.orion/runtime/node` when missing)

## Flags

```bash
orion --yes          # auto-approve setup prompts
orion --no-browser   # start services without opening a browser
orion uninstall      # remove cached app bundle for this version (~/.orion/app/<version>)
orion uninstall --all --yes  # remove entire ~/.orion directory
```

## Uninstall

`pip uninstall orion-notebook` removes the Python launcher only. It does **not** delete the app bundle downloaded into `~/.orion/app/<version>/`. Run this first:

```bash
orion uninstall --yes
pip uninstall orion-notebook
```

To remove all Orion-managed data (Jupyter venv, portable Node, every cached app version):

```bash
orion uninstall --all --yes
```

## Environment variables

| Variable | Purpose |
| --- | --- |
| `ORION_HOME_DIR` | Override Orion data root (default: `~/.orion`) |
| `ORION_APP_BUNDLE_URL` | Override app bundle download URL |
| `ORION_PORT` | Orion app port (default: `3001`) |

Default app bundle URL:

```text
https://github.com/nicolasakf/Orion-app/releases/download/v<version>/orion-app-<version>.tar.gz
```

## npm install (recommended)

Both npm and PyPI publish under the name `orion-notebook`. If you already have Node.js 20+, npm is simpler because it ships the app bundle directly:

```bash
npm install -g orion-notebook
orion
```

See the [main README](../README.md) and [Contributing](../CONTRIBUTING.md#publishing-the-cli) for publishing and development details.
