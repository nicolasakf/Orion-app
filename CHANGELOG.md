# Changelog

All notable changes to Orion are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Changed

- npm package renamed from `@nicolasakf/orion-agent` to `orion-notebook` (same name as PyPI)
- `orion uninstall` removes pip-downloaded app cache under `~/.orion/app/<version>/` before package uninstall

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
