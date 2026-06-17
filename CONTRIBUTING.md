# Contributing

Thanks for helping improve Orion.

## Prerequisites

- Node.js 20+
- Optional: Jupyter, if you want to test notebook execution locally

## Setup

Clone the repo, copy `.env.example` to `.env`, install dependencies, then start a dev server. Next.js loads `.env`, not `.env.example`.

**macOS / Linux:**

```bash
git clone https://github.com/nicolasakf/Orion-app.git
cd Orion-app
cp .env.example .env
npm install
```

**Windows (PowerShell):**

```powershell
git clone https://github.com/nicolasakf/Orion-app.git
cd Orion-app
Copy-Item .env.example .env
npm install
```

### Dev mode

Both commands run Next.js dev on port 3001 with hot reload (Turbopack):

- **`npm run dev`** — starts the Next.js dev server only. Use this for UI and general app work. You connect to Jupyter yourself in the app (kernel selector or an external server you already run).
- **`npm run dev:notebook`** — starts Jupyter and Next.js together, using the same Python/Jupyter bootstrap as the `orion` CLI. Orion auto-connects via `~/.orion/runtime/jupyter-connection.json`. Prefer this when you are developing or testing notebook execution.

```bash
npm run dev              # Next.js only
npm run dev:notebook     # Jupyter + Next.js (recommended for notebooks)
```

Useful `dev:notebook` flags: `--here` (Jupyter root = current directory), `--pick-python` (interactive Python selection). Setup prompts are auto-approved by default; set `ORION_DEV_YES=0` to require interactive consent.

For a production-like local run (no hot reload), use `npm run build` and `npm run start` instead (see [README](./README.md#run-from-source-developers)).

Configure model credentials inside the app under **Settings → Providers**.

## CLI Development

To test the `orion` CLI locally (the same command published as `orion-notebook` on npm), ensure `.env` exists (copy from `.env.example` if you have not already):

```bash
npm run build          # production Next build (required once, or after app changes)
npm run build:cli      # compile cli/orion.ts -> dist/cli/
npm run prepare:app-bundle  # copy .next/standalone -> dist/orion-app
node dist/cli/cli/orion.js
```

Useful flags:

```bash
node dist/cli/cli/orion.js --yes          # auto-approve managed Python/Jupyter setup
node dist/cli/cli/orion.js --no-browser   # start services without opening a browser
node dist/cli/cli/orion.js uninstall --yes  # remove cached ~/.orion/app/<version> data
ORION_PORT=3002 node dist/cli/cli/orion.js  # use a different app port
```

Re-run all three build steps after app code changes (the CLI serves the packaged app, not the dev server):

```bash
npm run build && npm run build:cli && npm run prepare:app-bundle
```

What the CLI does:

1. discovers Python on your machine (or creates `~/.orion/runtime/venv`)
2. starts Jupyter Server and writes `~/.orion/runtime/jupyter-connection.json`
3. starts the packaged Orion app from `dist/orion-app`
4. opens Orion in your browser, which auto-connects via `/api/local/jupyter/connection`

To simulate a global npm install from the repo:

```bash
npm run build && npm run build:cli && npm run prepare:app-bundle
npm link
orion --yes
```

To test the PyPI shim locally:

```bash
cd python/orion-ui && pip install -e .
cd .. && pip install -e .
PYTHONPATH=python python -m orion_agent.cli --help
```

For notebook UI development, `orion-ui` can be installed alone:

```bash
cd python/orion-ui && pip install -e .
# or: PYTHONPATH=python/orion-ui python -c "import orion_ui"
```

The PyPI path downloads the app bundle on first run, so for day-to-day development prefer the npm/local flow above.

## Publishing The CLI

Orion ships three publishable packages:

| Channel | Package name | What ships in the package |
| --- | --- | --- |
| npm | `orion-notebook` | CLI + full app bundle (`dist/orion-app`) |
| PyPI | `orion-notebook` | Python launcher only; app bundle downloaded on first run |
| PyPI | `orion-ui` | Notebook UI library (`import orion_ui`) for kernel environments |

Keep version numbers in sync across `package.json`, `python/pyproject.toml`, `python/orion-ui/pyproject.toml`, `python/orion_agent/cli.py` (`VERSION`), and `python/orion-ui/orion_ui/__init__.py` (`__version__`).

### Publish to npm

The `prepack` script builds everything that ships in the tarball:

```bash
npm run prepack   # next build + build:cli + prepare:app-bundle + archive:app-bundle
```

Dry-run the package contents:

```bash
npm pack --dry-run
```

Test a real install from the generated tarball before publishing:

```bash
npm pack
npm install -g ./orion-notebook-<version>.tgz
orion --yes
```

Publish when ready:

```bash
npm publish
```

After the first `orion-notebook` publish, deprecate the legacy npm package:

```bash
npm deprecate @nicolasakf/orion-agent "Renamed to orion-notebook. Install with: npm install -g orion-notebook"
```

### Publish to PyPI

Build and upload both Python packages. Publish **`orion-ui` first** — managed Orion runtimes install it from PyPI on startup.

**`orion-ui`:**

```bash
cd python/orion-ui
python -m pip install build twine
python -m build
twine upload dist/*
```

**`orion-notebook`:**

```bash
cd python
python -m pip install build twine
python -m build
twine upload dist/*
```

The PyPI package does **not** include the Orion web app. Users download it on first run from a GitHub release asset. Before publishing a new PyPI version, create a matching GitHub release and attach the app bundle:

```bash
# from repo root, after bumping version
npm run prepack
# uploads dist/orion-app-<version>.tar.gz
```

Release asset URL pattern (configured in `python/orion_agent/cli.py`):

```text
https://github.com/nicolasakf/Orion-app/releases/download/v<version>/orion-app-<version>.tar.gz
```

Create the release with [GitHub CLI](https://cli.github.com/):

```bash
gh release create v0.4.0 dist/orion-app-0.4.0.tar.gz --title "v0.4.0"
```

Without that release asset, `pip install orion-notebook` users will fail when the CLI tries to download the app bundle.

To test the PyPI flow locally before release, point at a local archive:

```bash
export ORION_APP_BUNDLE_URL=file://$(pwd)/dist/orion-app-0.4.0.tar.gz
pip install -e python/
orion --yes
```

Optional local Orion-api dev override (dev only — not used by `next build`):

```bash
# .env.development.local
NEXT_PUBLIC_ORION_API_BASE_URL=http://localhost:3002
```

## Tests And Checks

```bash
npm test
npx tsc --noEmit
npm run lint
```

`npm test` includes a boundary guard that catches unwanted external service dependencies being introduced.

## Architecture

- [Architecture](./docs/architecture.md)
- [Agent API](./docs/agent-api.md)

## Pull Requests

- Keep changes focused and small when possible.
- Prefer conventional commit messages.
- Include tests for behavior changes.
- Update docs when changing setup, model credentials, static catalog metadata, skills, sub-agents, or Jupyter behavior.
