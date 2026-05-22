# Contributing

Thanks for helping improve Orion.

## Prerequisites

- Node.js 20+
- Optional: Jupyter, if you want to test notebook execution locally

## Setup

Clone the repo, install dependencies, then run the dev server (hot reload, Turbopack):

```bash
git clone https://github.com/nicolasakf/Orion-app.git
cd Orion-app
npm install
npm run dev
```

The dev server runs on port 3001 by default. For a production-like local run, use `npm run build` and `npm run start` instead (see [README](./README.md#quick-start)).

Configure model credentials inside the app under **Settings → Providers**.

## CLI Development

To test the `orion` CLI locally (the same command published as `@nicolasakf/orion-agent` on npm):

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
cd python
pip install -e .
PYTHONPATH=python python -m orion_agent.cli --help
```

The PyPI path downloads the app bundle on first run, so for day-to-day development prefer the npm/local flow above.

## Publishing The CLI

Orion ships two packages that both install the `orion` command:

| Channel | Package name | What ships in the package |
| --- | --- | --- |
| npm | `@nicolasakf/orion-agent` | CLI + full app bundle (`dist/orion-app`) |
| PyPI | `orion-agent` | Python launcher only; app bundle downloaded on first run |

Keep version numbers in sync across `package.json`, `python/pyproject.toml`, and `python/orion_agent/cli.py` (`VERSION`).

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
npm install -g ./nicolasakf-orion-agent-<version>.tgz
orion --yes
```

Publish when ready:

```bash
npm publish --access public
```

### Publish to PyPI

Build and upload the Python shim from `python/`:

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

Without that release asset, `pip install orion-agent` users will fail when the CLI tries to download the app bundle.

To test the PyPI flow locally before release, point at a local archive:

```bash
export ORION_APP_BUNDLE_URL=file://$(pwd)/dist/orion-app-0.4.0.tar.gz
pip install -e python/
orion --yes
```

Optional environment:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3001
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
