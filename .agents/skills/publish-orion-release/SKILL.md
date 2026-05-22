---
name: publish-orion-release
description: Publishes an Orion CLI release by bumping version, updating CHANGELOG, tagging, creating a GitHub release with the app bundle, and publishing to npm and PyPI. Use when the user asks to publish a release, ship a version, bump and publish @nicolasakf/orion-agent or orion-notebook, or cut a new npm/PyPI release.
---

# Publish Orion Release

Orion ships two packages that both install the `orion` command:

| Channel | Package | Ships in package |
| --- | --- | --- |
| npm | `@nicolasakf/orion-agent` | CLI + app bundle |
| PyPI | `orion-notebook` | Python launcher only (app bundle downloaded from GitHub release) |

The npm and PyPI **package names differ on purpose**. PyPI rejected `orion-agent` (too similar to `orionagent`) and `orion-cli` is already taken. The Python module directory stays `python/orion_agent/`; only `[project].name` in `python/pyproject.toml` is `orion-notebook`.

Detailed reference: [CONTRIBUTING.md — Publishing The CLI](../../../CONTRIBUTING.md#publishing-the-cli)

## Prerequisites

- Clean `main` (or an agreed release branch) with changes merged
- `gh` authenticated (`gh auth status`)
- npm logged in with publish access to `@nicolasakf/orion-agent` (`npm whoami` must succeed)
- PyPI credentials for `orion-notebook` (`twine` or `uv publish`)
- Node.js 20+, Python 3.8+ locally for build/test

### npm auth

Confirm before publish:

```bash
npm whoami
```

If not logged in, use a token (more reliable than web login in the terminal):

```bash
npm login
# or:
npm config set //registry.npmjs.org/:_authToken npm_<your-token>
```

If publish returns `401` then polls `/-/v1/done?authId=...` and ends in `404`, the web-login flow timed out — log in with a token and retry.

First publish of the scoped package requires `--access public`.

## Version Files (keep in sync)

Bump the **same semver** in all of:

| File | Field |
| --- | --- |
| `package.json` | `"version"` |
| `package-lock.json` | top-level `"version"` and `"packages"."".version` |
| `python/pyproject.toml` | `[project].version` |
| `python/orion_agent/__init__.py` | `__version__` |
| `python/orion_agent/cli.py` | `VERSION` and `DEFAULT_APP_BUNDLE_URL` path segment |

Prefer `npm version <x.y.z> --no-git-tag-version` for `package.json` + lockfile, then mirror the version in the Python files.

## Release Checklist

```
- [ ] 1. Pre-flight validation
- [ ] 2. Decide version (patch / minor / major)
- [ ] 3. Update CHANGELOG.md
- [ ] 4. Bump all version files
- [ ] 5. Commit release prep
- [ ] 6. Build and smoke-test npm package
- [ ] 7. Tag and push
- [ ] 8. GitHub release + app bundle asset
- [ ] 9. npm publish
- [ ] 10. PyPI publish (orion-notebook)
- [ ] 11. Post-release verification
```

## Step 1: Pre-flight validation

From repo root:

```bash
git status --short
npm test
npx tsc --noEmit
npm run lint
```

Do not publish from a dirty tree unless the user explicitly wants unreleased local changes included. Resolve or stash unrelated work first.

Review `git log` since the last release tag to draft CHANGELOG entries.

## Step 2: CHANGELOG.md

Create or update `CHANGELOG.md` at repo root using [Keep a Changelog](https://keepachangelog.com/) format:

```markdown
# Changelog

All notable changes to Orion are documented here.

## [0.5.0] - 2026-05-22

### Added
- CLI distribution via npm (`@nicolasakf/orion-agent`) and PyPI (`orion-notebook`)

### Changed
- ...

### Fixed
- ...
```

Include user-visible CLI/app changes. Link `[0.5.0]` to the GitHub release URL after publish.

## Step 3: Version bump commit

Only create the commit when the user asked to publish (invoking this skill counts).

Suggested commit message:

```text
chore(release): v0.5.0
```

Include in the commit:
- all version file updates
- `CHANGELOG.md`

## Step 4: Build and smoke-test (before publishing)

```bash
npm run prepack
```

`prepack` runs: `next build` → `build:cli` → `prepare:app-bundle` → `archive:app-bundle`

`scripts/prepare-app-bundle.mjs` strips `logs/` from the standalone copy. Dev log files can add ~500 MB and push the npm tarball over registry limits (`413 Payload Too Large`). Expect ~160 MB compressed after the strip.

Inspect tarball contents:

```bash
npm pack --dry-run
npm pack
npm install -g ./nicolasakf-orion-agent-<version>.tgz
orion --yes --no-browser
```

Confirm:
- Orion app starts and prints a local URL
- Jupyter handoff file exists at `~/.orion/runtime/jupyter-connection.json`
- `/api/local/jupyter/connection` returns the connection

Uninstall test global when done: `npm uninstall -g @nicolasakf/orion-agent`

## Step 5: Tag and push

```bash
git tag v<version>
git push origin main
git push origin v<version>
```

Use the branch the user specifies if not `main`.

## Step 6: GitHub release (required for PyPI)

PyPI users download the app bundle from:

```text
https://github.com/nicolasakf/Orion-app/releases/download/v<version>/orion-app-<version>.tar.gz
```

Create the release **before** PyPI publish:

```bash
gh release create v<version> \
  dist/orion-app-<version>.tar.gz \
  --title "v<version>" \
  --notes-file CHANGELOG-excerpt.md
```

Use a short excerpt from `CHANGELOG.md` for `--notes-file`, or `--notes "..."` for a one-liner.

To replace a bad asset after rebuilding: `gh release upload v<version> dist/orion-app-<version>.tar.gz --clobber`

Verify the asset URL returns 200:

```bash
curl -I "https://github.com/nicolasakf/Orion-app/releases/download/v<version>/orion-app-<version>.tar.gz"
```

## Step 7: npm publish

```bash
npm publish --access public
```

`prepack` runs again automatically via the `prepack` lifecycle script.

## Step 8: PyPI publish (`orion-notebook`)

Confirm `python/pyproject.toml` has `name = "orion-notebook"` and the version matches npm.

Rebuild cleanly before upload:

```bash
cd python
rm -rf dist/ build/ orion_agent.egg-info/
python -m pip install build twine
python -m build
twine check dist/*
twine upload dist/*
```

Use `twine upload --verbose dist/*` when PyPI returns a generic `400 Bad Request` — the response body explains rejections (e.g. name too similar to an existing project).

Optional local PyPI smoke test before upload:

```bash
export ORION_APP_BUNDLE_URL="https://github.com/nicolasakf/Orion-app/releases/download/v<version>/orion-app-<version>.tar.gz"
pip install -e .
orion --yes --no-browser
```

### PyPI name availability

There is no official availability API. Before renaming, check candidates:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "https://pypi.org/pypi/<name>/json"
```

- **404** → no published package with that name (good sign, not a guarantee)
- **200** → taken

PyPI normalizes `-`, `_`, and `.` as equivalent (`orion-agent` = `orionagent`). Upload can still fail with *"too similar to an existing project"* even when the exact name is free.

Known unavailable names: `orion-agent`, `orion-cli`, `orionagent`, `orion`, `orionai`.

## Step 9: Post-release verification

- [ ] `npm view @nicolasakf/orion-agent version` matches
- [ ] `pip index versions orion-notebook` (or PyPI web UI) matches
- [ ] Fresh `npx @nicolasakf/orion-agent --yes` works on a clean machine
- [ ] Fresh `pip install orion-notebook && orion --yes` downloads the bundle successfully
- [ ] GitHub release page lists `orion-app-<version>.tar.gz`

## Publish Order (critical)

1. Version bump + CHANGELOG commit
2. Tag + push
3. `npm run prepack` (if not already run)
4. **GitHub release with app bundle** ← PyPI depends on this
5. npm publish
6. PyPI publish (`orion-notebook`)

Publishing PyPI before the GitHub release asset exists will break first-run `pip install orion-notebook` users.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| npm `413 Payload Too Large` | `logs/` included in app bundle | Re-run `prepack`; confirm `prepare-app-bundle.mjs` strips `logs/` |
| npm `401` then `404` on `/-/v1/done` | Not logged in; web auth timed out | `npm login` or set `_authToken`; retry |
| npm `404` on `@nicolasakf/orion-agent` at publish | Missing scope publish access | Log in as owner of `@nicolasakf`; use `--access public` on first publish |
| PyPI `400` name too similar | Normalized name conflicts with existing project | Pick a distinct name (current: `orion-notebook`); use `--verbose` to confirm |
| PyPI `400` generic | Bad metadata or description | `twine check dist/*`; use `--verbose` for details |

## Notes

- Do not run `npm run dev` during release unless the user asks; use `prepack` / production build.
- Do not force-push tags or rewrite published versions without explicit user approval.
- For breaking changes, bump minor/major semver and call them out in CHANGELOG.
- npm package size is large (~160 MB compressed, includes app bundle); PyPI wheel stays small by design.
- User-facing install commands: `npm install -g @nicolasakf/orion-agent` and `pip install orion-notebook`.

## Additional Resources

- User install docs: [README.md — Quick start](../../../README.md#quick-start)
- PyPI-specific behavior: [python/README.md](../../../python/README.md)
