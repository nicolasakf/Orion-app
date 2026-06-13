<p align="center">
  <img src="./public/assets/Cover%20Photo%204.png" width="800" alt="Orion — Master your data, speed your research">
</p>

[Orion](https://orion-agent.ai) is the first open-source AI coding agent built specifically for **data scientists, analysts, and researchers**.

General-purpose coding agents weren't designed for data-heavy research workflows. They guess at column names, choke on large datasets, and optimize for *code that runs* rather than *results that make sense*. The root cause is the **context gap** between what a model can read from source files and what it can't see: your runtime state, live variable values, cell outputs. The actual data you're working with.

Orion closes that gap. Built around a modern notebook IDE, it feeds the right context to the model at the right time: variable inspector state, cell execution order, rich outputs, tracebacks, and dataframe structure. The agent iterates alongside you like a research partner — observing inputs, checking results, and adjusting until the outcome actually looks right.

## Demo

**Make focused edits with confidence, or generate entire notebooks from scratch.**

<p align="center">
  <img src="./public/assets/Orion%20README.gif" width="800" alt="Orion — Master your data, speed your research">
</p>

**Use any model, from any provider. Choose remote or local inference.**  
**Mention cells, variables, files, etc. so you and the agent are always on the same page.**  

<p align="center">
  <img src="./public/assets/Orion%20README%202.gif" width="800" alt="Orion — Master your data, speed your research">
</p>

**Invoke commands, skills and sub-agents with slash commands.**

<p align="center">
  <img src="./public/assets/Orion%20README%203.gif" width="800" alt="Orion — Master your data, speed your research">
</p>


## Quick start

**Prerequisites:** The install script can bootstrap Orion with npm, pip, or uv. Python 3.8+ is still needed for notebook execution, but Orion can create a managed runtime for you.

Running `orion` starts Jupyter, launches Orion locally, opens your browser, and auto-connects to the Jupyter server. All managed files live under `~/.orion` (Windows: `%USERPROFILE%\.orion`).

### Install script (macOS / Linux)

```bash
curl -fsSL https://www.orion-agent.ai/install.sh | bash
```

The script installs `orion-notebook` via npm when Node.js 20+ is available, otherwise via pip. If neither path is available, it installs uv and uses uv-managed Python 3.12 for the launcher. Pin a version with `ORION_VERSION=0.5.1` or force a method with `ORION_INSTALL_METHOD=npm|pip|uv`.

### Install via npm (recommended)

Both npm and PyPI use the package name **`orion-notebook`**:

```bash
npm install -g orion-notebook
orion
```

Or run once without installing globally:

```bash
npx orion-notebook
```

The npm package ships the full Orion app bundle, so no separate app download is needed. You only need Node.js 20+ installed; Python 3.8+ is required for notebook execution.

**First run:** if Orion does not find a compatible Jupyter setup, it prompts to create an Orion-managed environment under `~/.orion/runtime/venv`. That step installs Jupyter into Orion's venv (not your global Python) and can take a few minutes. Approve automatically with:

```bash
orion --yes
```

### Install via pip

```bash
pip install orion-notebook
orion
```

The PyPI wheel is small by design. On first run it may:

1. download the Orion app bundle into `~/.orion/app/<version>`
2. download portable Node.js 20+ into `~/.orion/runtime/node` if Node is missing
3. create an Orion-managed Jupyter venv under `~/.orion/runtime/venv` if needed (includes `orion-ui` for notebook UI components — no extra install step)

Each step prompts before downloading or installing unless you pass `--yes`:

```bash
orion --yes
```

After the first successful setup, later runs are much faster.

### Uninstall

`pip uninstall` and `npm uninstall` remove the launcher only. To also remove cached Orion data (especially the pip-downloaded app bundle under `~/.orion/app/<version>/`), run:

```bash
orion uninstall --yes
```

Remove everything under `~/.orion` (Jupyter venv, portable Node, all cached app versions):

```bash
orion uninstall --all --yes
```

Then remove the package:

```bash
pip uninstall orion-notebook
# or
npm uninstall -g orion-notebook
# or
uv tool uninstall orion-notebook
```

### Adding yourAPI Keys

Open Orion in your browser, then go to **Settings → Providers** to add your API keys.

For manual Jupyter setup instead of the CLI, connect a Jupyter server in the GUI (supports Jupyter Server 1.x and 2.x when required APIs are available).


### Run from source (developers)

Copy `.env.example` to `.env` in the repo root before building or running the dev server. Next.js loads `.env`, not `.env.example`.

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

#### Dev mode

Both commands start the Next.js dev server on port 3001 with hot reload (Turbopack). Pick one:

| Command | What it starts | When to use |
| --- | --- | --- |
| `npm run dev` | Next.js only | UI and app work. Connect Jupyter yourself in the app (kernel selector or an existing server). |
| `npm run dev:notebook` | Jupyter + Next.js (same bootstrap as the `orion` CLI) | Notebook and kernel work. Orion auto-connects via `~/.orion/runtime/jupyter-connection.json`. |

```bash
npm run dev              # Next.js dev server only
npm run dev:notebook     # Jupyter + Next.js (recommended for notebooks)
```

Useful `dev:notebook` flags: `--here` (Jupyter root = current directory), `--pick-python` (interactive Python selection). Setup prompts are auto-approved by default; set `ORION_DEV_YES=0` to require interactive consent.

#### Production-like CLI run

To test the packaged `orion` CLI locally (not the dev server):

```bash
npm run build
npm run build:cli
npm run prepare:app-bundle
node dist/cli/cli/orion.js
```

See [Contributing](./CONTRIBUTING.md#setup) for more development details and [CLI development](./CONTRIBUTING.md#cli-development) for flags, publishing, and local CLI testing.

## Links

| Description | Link |
| --- | --- |
| Website | [orion-agent.ai](https://www.orion-agent.ai) |
| Hosted app | [app.orion-agent.ai](https://app.orion-agent.ai) |
| User docs | [docs.orion-agent.ai](https://docs.orion-agent.ai) |

## Documentation

- [User help](https://docs.orion-agent.ai) — install guides and troubleshooting (Orion-docs)
- [Contributing](./CONTRIBUTING.md) — setup, CLI development, publishing, pull requests
- [PyPI package](./python/README.md) — pip install details and first-run behavior
- [Architecture](./docs/architecture.md) — how the app fits together
- [Agent API](./docs/agent-api.md) — tools, skills, sub-agents, adding models

## Tech stack

Next.js 15, React 19, Tailwind CSS, Monaco Editor, Vercel AI SDK, JupyterLab services.

## License

Apache-2.0. See [LICENSE](./LICENSE).
