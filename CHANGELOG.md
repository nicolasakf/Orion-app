# Changelog

All notable changes to Orion are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.6.3] - 2026-05-27

### Added

- Agent: save dirty editor buffers before read/edit mutation tools run
- Notebook: DataFrame variable inspector tab with tabular preview (up to 1000 rows × 100 columns)
- Orion UI: Plotly charts styled with Orion design tokens (Saira font, dashed grids, hover cards)

### Fixed

- Orion UI: DateTimePicker stacks time inputs under the calendar on narrow layouts

[0.6.3]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.6.3

## [0.6.2] - 2026-05-27

### Added

- Agent: read/edit tools prefer Orion's unsaved editor buffer over disk for the active file or notebook
- Chat: composer file attachments with image input for capable models and external-file references
- Chat: transcript export, session cost summary (`/cost`), and chat options menu
- Chat: improved collapsible tool-activity rows with duration timing and cost summary refresh/dismiss
- CLI: `--version` flag on Node and Python launchers
- Notebook: Orion UI DateTimePicker, date presets, and expanded calendar controls
- Notebook: expanded Orion UI primitives and schema-only App View
- UI: in-app help links to docs.orion-agent.ai

### Changed

- Chat: slash-command chips can open skill and subagent definition files

### Fixed

- Chat: normalize inline data URL file parts before provider API calls

[0.6.2]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.6.2

## [0.6.1] - 2026-05-26

### Added

- CLI: managed Jupyter runtime auto-syncs `orion-ui` (and other runtime packages) on startup
- PyPI: `orion-ui` as a standalone package for notebook UI components (`import orion_ui`)

### Changed

- `orion-ui` source moved to `python/orion-ui/`; managed runtimes install it from PyPI instead of bundling it inline
- Docs: publishing and development instructions updated for the three-package release (`orion-notebook` npm, `orion-notebook` PyPI, `orion-ui` PyPI)

### Fixed

- External and managed kernels no longer fail with `ModuleNotFoundError: orion_ui` after Orion UI output rendering shipped in 0.6.0

[0.6.1]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.6.1

## [0.6.0] - 2026-05-26

### Added

- CLI: Python selection menu, `orion config` subcommand, and persisted runtime choice under `~/.orion/runtime`
- Notebook: HTML, PDF, Markdown, and LaTeX export from the toolbar
- Notebook: declarative App View schema rendering with built-in primitives
- Notebook: Orion UI declarative output rendering (`application/vnd.orion.ui+json`) with interactive kernel-backed controls
- Chat: mention highlighted assistant and tool text in chat via floating @ popover
- Chat: collapsible rows for grouped assistant tool activity with duration headers
- Workspace: Orion workspace configuration file

### Changed

- Chat: extracted model selection logic and fixed fallback race conditions when stored model is invalid

[0.6.0]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.6.0

## [0.5.2] - 2026-05-24

### Added

- `orion uninstall` subcommand to remove Orion and cached app bundles
- `--app-only` CLI flag to start the app without launching Jupyter
- macOS/Linux install script: `curl -fsSL https://www.orion-agent.ai/install.sh | bash`

### Changed

- npm package renamed from `@nicolasakf/orion-agent` to `orion-notebook` (same name as PyPI)
- `orion uninstall` removes pip-downloaded app cache under `~/.orion/app/<version>/` before package uninstall
- UI: default font switched to Saira

### Fixed

- CLI: add timeout to server readiness check

[0.5.2]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.5.2

## [0.5.1] - 2026-05-22

### Fixed

- Exclude dev logs from packaged app bundle (avoids npm registry size limit errors)

### Changed

- PyPI package name is `orion-notebook` (install with `pip install orion-notebook`)

[0.5.1]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.5.1

## [0.5.0] - 2026-05-22

### Added

- `orion` CLI launcher with npm packaging (`@nicolasakf/orion-agent`)
- PyPI `orion-notebook` Python launcher shim that downloads the app bundle from GitHub releases
- Auto-connect to CLI-managed Jupyter on kernel launch
- Chat: mention workspace paths from file tree context menu
- Terminal: close all agent terminals action
- Settings: split chat model from title generation settings
- UI: `CustomIcon` component for public SVG assets

### Changed

- Editor: improved empty workspace card navigation and layout
- Codex agent config: use `npm install` without `--legacy-peer-deps`

[0.5.0]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.5.0
