# Changelog

All notable changes to Orion are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.20.2] - 2026-09-04

### Changed

- Release: publish npm packages through GitHub Actions trusted publishing with retry-safe version checks

### Fixed

- Desktop: load bundled Jupyter server extensions in persistent runtimes so terminal APIs are available
- Desktop: exit smoke-mode startup failures cleanly instead of blocking CI on a native dialog

[0.20.2]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.20.2

## [0.20.1] - 2026-09-03

### Added

- Agent: independent worker and reviewer turns with persisted worker notes, pinned workspaces, and resilient supervision
- Notebook: run selected or current-line source with Option/Alt+Enter
- Desktop: prevent macOS sleep during active agent runs when enabled

### Changed

- Agent: expand bounded evaluator investigation, reviewer retries, and stall detection
- CLI: use port 7070 by default and select the next available local port when needed
- Notebook: reconcile clean external changes while preserving unsaved cell edits

### Fixed

- Agent: recover interrupted evaluator reviews without consuming review budget

[0.20.1]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.20.1

## [0.20.0] - 2026-08-24

### Added

- Agent: Goal mode with contract proposals, evaluator loop, and status UI
- Agent: `ask_question` tool with questionnaire UI for structured user input
- Agent: queued messages bar and searchable model combobox in chat
- Agent: chained notebook cell execution from tool calls
- Agent: interaction mode selector colors and Research renamed to Explore
- Agent: mode capabilities derived from the resolved tool list
- Onboarding: business stack picker, connections step, and agent shell recovery
- Onboarding: open and edit `ORION.md` from Settings → Personal context
- Notifications: alert when an agent run completes
- Desktop: persist Jupyter Python in the managed venv outside the app bundle

### Changed

- Agent: simplify `read_notebook` and tighten tool guidance
- Desktop: log actual update download payload size during auto-update

### Fixed

- Publish: drop empty hidden-input cells from published notebook pages

[0.20.0]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.20.0

## [0.19.0] - 2026-08-17

### Added

- Notebook: retain and revisit rich output history with `ui.version()`
- Notebook: mention markdown cells in chat from the cell context menu
- Notebook: include markdown cells in App View references
- Notebook: derive readable titles from notebook filenames
- Chat: recover from context limit errors via compaction and resend
- Chat: unified server-side context usage model with a consistent usage pill
- Chat: compaction divider in history showing tokens saved
- Agent: reasoning effort controls and tool runtime readiness gating
- Agent: shared raster payload handling for token estimation and wire optimization
- Editors: alert and follow active document renames/deletes from Jupyter
- Cloud: publish notebooks via signed direct-to-Supabase Storage uploads

### Changed

- Agent: improve compaction folding, checkpoint restore, and bash tools

[0.19.0]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.19.0

## [0.18.1] - 2026-08-11

### Fixed

- Cloud: prompt Google account selection during OAuth sign-in so users can pick which signed-in account to use

[0.18.1]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.18.1

## [0.18.0] - 2026-08-10

### Added

- Agent: resumable Business onboarding interview for personal context, with guarded profile editing and approved memory updates in main-agent prompts
- Agent: live Plotly output diagnostics, responsive rendering, and verification guidance
- Notebook: stable cell-based output references, selection aggregates, and column fit controls in `orion-ui` tables
- Sidebar: filter and sort kernel variables
- Chat: persist completed tool activity durations across reloads, separate message expansion from editing, and restore composer focus after actions
- Onboarding: require Orion Cloud sign-in during setup

### Fixed

- Agent: guard alternate `ORION.md` writes
- Release: require signed, notarized macOS desktop builds

[0.18.0]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.18.0

## [0.17.0] - 2026-07-31

### Added

- Notebook: filter `orion-ui` tables with type-aware operators, filter-from-cell actions, and default filtered and sorted views
- Chat: run independent read-only agent tool calls concurrently, with ordered write barriers and configurable concurrency
- Chat: answer Orion product questions from official documentation with the new `orion-docs` built-in skill
- Ask mode: load skills and list available kernels while remaining read-only
- Chat: generate and edit AI titles with configurable title length and model selection controls

### Fixed

- Chat: prevent duplicate message snapshots, stabilize queued turns, and keep long message text within the panel
- UI: refine collapsed sidebar layouts across desktop and Business View
- Publishing: recover a partial PyPI release without republishing npm

[0.17.0]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.17.0

## [0.16.0] - 2026-07-24

### Added

- Chat: managed external-file attachments are stored on the connected Jupyter server, with safe cleanup and workspace-tool references
- Chat: refresh workspace skills and subagents directly from the slash-command palette
- Notebook: open the source cell directly from App View outputs
- Settings: validate title-generation models before saving them

### Changed

- Workspace: copy absolute paths for locally managed Jupyter servers
- Notebook: cancel queued execution batches when restarting the kernel

### Fixed

- Markdown: preserve dollar-denominated currency instead of interpreting it as inline math
- Titles: use a ChatGPT OAuth-compatible fallback and omit streaming or long-reasoning options for short title requests

[0.16.0]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.16.0

## [0.15.0] - 2026-07-21

### Added

- Notebook: controls in `orion-ui` can now rerun selected cells after state changes, with sensible debounce behavior
- Notebook: restart-kernel and run-all controls, external-link handling, and richer Business View markdown editing
- Chat: in-place resend/edit, copy and fork actions, context preflight, cost provenance, and Vercel billing visibility
- Workspace: global search with Contents API and desktop-host path actions

### Changed

- Business: improved App View contents navigation, export menu, and panel sizing
- UI: branded Orion loaders and persistent panel layout

### Fixed

- Notebook: harden Orion UI tables, agent state transitions, sticky headers, and callback compatibility
- Chat: restore only workspace-edit checkpoints and correct partial model-usage provenance

[0.15.0]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.15.0

## [0.14.0] - 2026-07-12

### Added

- Onboarding: multi-step first-run flow for sign-in, workspace mode, and inference provider
- Models: GPT-5.6 Terra and Luna; default chat model is Terra

### Changed

- Chat: polish model settings labels and UI copy

[0.14.0]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.14.0

## [0.13.0] - 2026-07-12

### Added

- Business: report edit mode and App View interactions
- Chat: persist model intelligence settings in session
- Desktop: multi-window support and OAuth popups
- Desktop: create folders in the project picker dialog

### Changed

- Settings: segmented tabs for appearance controls
- Chat: refine empty prompt library headline

[0.13.0]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.13.0

## [0.12.0] - 2026-07-09

### Added

- Business experience mode with chat forking, accordion prompt library, and refined empty-chat UX
- ChatGPT browser OAuth credentials with device-code fallback
- Desktop native menus and guarded reload shortcuts
- Chat structured API errors with billing action links
- Notebook App View table-of-contents rail in business mode
- Agent: merge Orion metadata when inserting or overwriting cells; resolve absolute paths against Jupyter root
- Orion UI: column descriptions on `ui.table()`
- UI: scrollable shortcut lists on the empty editor card

### Changed

- Agent: Orion notebook terminology in Business View
- Chat: reorder pinned models and refresh selector on change
- Business: refine experience mode UX and error recovery

### Fixed

- Credentials: harden ChatGPT browser OAuth sign-in flow
- Desktop: draggable title bar gaps in header toolbars

[0.12.0]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.12.0

## [0.11.3] - 2026-07-06

### Added

- Agent: Research mode (beta) replaces the deep EDA controller with notebook-native investigation sessions, step budgets, and visual evidence handling
- Editor: autosave toggle and interval controls in Appearance settings, with transient save feedback
- Notebook: Orion UI table (`ui.table()`) for large DataFrames with paginated and virtual modes, filter, sort, and export
- Publish: optional password when publishing notebooks to Orion Cloud

### Changed

- Agent: orion-settings skill now covers settings backup and recovery from `~/.orion/settings-backup`

### Fixed

- Cloud: reject oversized notebook publish payloads with a clear error before hitting the API limit
- Notebook: scope global `<style>` tags in HTML outputs to avoid leaking CSS into the notebook

[0.11.3]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.11.3

## [0.11.2] - 2026-06-29

### Changed

- Desktop: improve macOS window chrome and theme background sync
- Notebook: remove the restart-and-run-all toolbar action

### Fixed

- CLI: reuse the portable Node runtime before prompting to download Node.js
- CLI: show download progress when fetching Node.js

[0.11.2]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.11.2

## [0.11.1] - 2026-06-23

### Fixed

- Desktop: return install state from the in-app updater, enable quit-time update install on macOS, and surface download/restart errors in the UI

### Changed

- CI: publish macOS Intel desktop releases independently from Apple Silicon builds

[0.11.1]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.11.1

## [0.11.0] - 2026-06-23

### Added

- Credentials: persist provider API keys and OAuth tokens server-side in `~/.orion/credentials.json` with client-safe configured summaries in settings
- Agent: deep EDA investigation workflow with ledger state and a loadable `deep-eda` built-in skill
- Agent: implicit skill routing from user intent without an explicit `load_skill` call
- Agent: expanded tool schemas, context optimizer, and improved chat sidebar subagent UX
- Settings: configurable empty-editor shortcut cards and unsupported-file handling (chat mention or external open)
- Editor: warning card before opening very large files
- Kernel: normalized Jupyter connection URL parsing in kernel dialogs
- Updates: shared install-command logic between in-app updater, CLI, and Python launcher
- Desktop: ad-hoc code signing for macOS builds when `ORION_ADHOC_MAC_SIGNING=1`

### Changed

- Auth: removed in-app password reset page and account-tab password change form
- Cloud: streamlined OAuth dialog and shared OAuth helpers

### Fixed

- Docs: centralized user-docs link helper with required `.html` suffix
- Chat: composer placeholder copy aligned with queue-mode UI

[0.11.0]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.11.0

## [0.10.2] - 2026-06-21

### Added

- Desktop: daily update checks on startup and every 24 hours, plus manual **Check for Updates** menu action
- Updates: unified in-app update flow with settings menu/sidebar controls and API route
- CLI: `orion update` subcommand and startup update prompts for npm and PyPI launchers

### Fixed

- Desktop: hide the Next.js server subprocess on Windows so no terminal window appears
- CI: run `install.ps1` in the same shell on Windows install smoke
- CI: reuse app-bundle artifact in desktop release, cache runtime downloads, and trim smoke matrix on PRs

[0.10.2]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.10.2

## [0.10.1] - 2026-06-19

### Fixed

- Desktop: embed Orion Cloud config in CI-built Windows and macOS installers so sign-in and notebook publish work

[0.10.1]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.10.1

## [0.10.0] - 2026-06-19

### Added

- Desktop: Electron app with bundled Node/Python runtimes, auto-updater, and macOS notarization
- Desktop: release/smoke CI workflows and installer upload script
- Notebook: stream agent cell execution with live output and source diffs on tool cards
- Agent: `create-rule` built-in skill for authoring workspace `AGENTS.md` and `CLAUDE.md` rules

### Fixed

- CLI: prevent HTTP 431 by raising `--max-http-header-size` for bundled app, dev server, and Python launcher
- CLI: run npm/pip/uv uninstall during `orion uninstall` with deferred self-removal
- Terminal: fix panel sizing when the bottom sidebar is collapsed

### Changed

- Notebook: route agent `execute_cell` through shared `runCells` with queued/start/progress events

[0.10.0]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.10.0

## [0.9.1] - 2026-06-15

### Added

- CLI: `orion doctor` subcommand for install diagnostics (`--json`, `--setup`)

### Fixed

- CI: harden Windows `uv` install in install smoke workflow

[0.9.1]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.9.1

## [0.9.0] - 2026-06-14

### Added

- Chat: `node:sqlite` adapter with in-memory fallback when native SQLite is unavailable
- CLI: download progress bar for app bundle extraction
- CLI: improved platform support for Windows and ARM64
- Cloud: unpublish notebooks from the publish dialog
- Notebook: skeleton placeholder for queued cells awaiting execution
- orion-ui: `DateRangeSlider` timeline control for interactive outputs

### Fixed

- Notebook: show kernel busy status while cells execute
- Docs: append `.html` suffix to user documentation URLs
- Python: move PyPI classifiers to `[project]` in `pyproject.toml`

### Changed

- Notebook: share queued output skeleton component in app view
- Notebook: reuse execution info in cell status rendering

[0.9.0]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.9.0

## [0.8.0] - 2026-06-12

### Added

- Cloud: publish notebooks to Orion Cloud with shareable links at `app.orion-agent.ai/p/<slug>`
- Cloud: sign in with email/password or Google from the settings menu
- Cloud: account tab for profile, password change, and sign out
- Cloud: import published notebooks into local Orion via **Open in Orion**
- Cloud: update an existing publication from the publish dialog
- Cloud: optional source `.ipynb` download for published viewers
- Notebook: **Publish to Orion Cloud** toolbar action (Notebook view and App View)
- Auth: password reset flow for Orion Cloud accounts

### Changed

- App bundle: strip dev logs from standalone copy to keep npm tarball under registry limits

[0.8.0]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.8.0

## [0.7.0] - 2026-06-08

### Added

- Agent: customizable interaction modes (Plan, Agent, Debug, Ask) with editable prompts
- Agent: inject workspace `AGENTS.md` and `CLAUDE.md` rules into the system prompt
- Agent: persist models.dev catalog to disk cache for faster startup
- Chat: immediate slash command submission mode
- Chat: mention notebook cell outputs from context menus
- Chat: improved stop handling and sidebar integrations
- Notebook: serialize cell runs with an execution queue
- Settings: reorganized dialog with dedicated Agent and Notebook tabs
- Settings: backup user settings before overwrite
- Settings: custom model display labels
- Settings: improved models tab search ranking
- Workspace: pinned files in the combobox and file tree

### Fixed

- Chat: exclude title generation from cost summaries
- Editor: register Python Monaco tokenizer for multiline f-strings

### Changed

- Agent: remove notebook management tools (cells handled via UI and kernel)
- Notebook: store presentation hide flag in session storage
- Settings: shorten interaction mode prompt labels

[0.7.0]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.7.0

## [0.6.7] - 2026-06-04

### Added

- Models: extensible provider registry with merged models.dev catalog and composite `provider/model` selection keys
- Models: BYOK base URLs, custom OpenAI-compatible endpoints, and additional cloud providers (Groq, Cerebras, Vercel, etc.)
- Settings: visible-providers toggle and provider logos in the providers tab and chat model picker
- Agents: Academic Researcher and Polymarket Analyst example sub-agents

[0.6.7]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.6.7

## [0.6.6] - 2026-06-04

### Added

- Settings: advanced `agent`, `shell`, and notebook tuning keys in `settings.json` with sparse compaction on save
- Settings: centralized built-in defaults and expanded `orion-settings` skill field reference

### Fixed

- Notebook: fullscreen output dialog sizes HTML tables, data resources, and Plotly charts to natural width

### Changed

- UI: remove redundant vertical separators in the editor toolbar

[0.6.6]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.6.6

## [0.6.5] - 2026-06-03

### Fixed

- CLI: rebuild bundled `better-sqlite3` when the native module fails to load (app server start, Python launcher, and npm postinstall) so cross-platform app bundles work after install

[0.6.5]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.6.5

## [0.6.4] - 2026-06-02

### Added

- Chat: edit checkpoints with undo/redo on user messages
- Chat: drag-drop and paste image attachments in the composer
- Chat: grouped subagent activity rows with tool timings
- Chat: cross-surface composer events; App View empty state launches the create-app skill
- CLI: `dev:notebook` script with shared Jupyter bootstrap
- Notebook: JupyterLab class hooks; reject metadata CSS
- Notebook: App View driven from Orion UI output MIME only
- Orion UI: Plotly table traces styled like chat tables

### Fixed

- UI: align folder icons with file icons in the file tree
- UI: bind recent files shortcut to Cmd/Ctrl+P
- Settings: ignore workspace overrides at the Jupyter server root

[0.6.4]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.6.4

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
