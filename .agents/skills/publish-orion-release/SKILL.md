---
name: publish-orion-release
description: Publishes an Orion release end-to-end — version bump, build, tag, GitHub release, npm/PyPI publish via scripts/publish-release.sh (NPM_TOKEN + PyPI token in ~/.zprofile), then post-release verification. Use when the user asks to publish a release, ship a version, bump and publish orion-notebook or orion-ui, or cut a new npm/PyPI release.
---

# Publish Orion Release

Orion ships three publishable packages:

| Channel | Package | Ships in package |
| --- | --- | --- |
| npm | `orion-notebook` | CLI + app bundle |
| PyPI | `orion-notebook` | Python launcher only (app bundle downloaded from GitHub release) |
| PyPI | `orion-ui` | Notebook UI library (`import orion_ui`) for kernel environments |

The Python module directory stays `python/orion_agent/`; only `[project].name` in `python/pyproject.toml` is `orion-notebook`. The `orion-ui` package is built from `python/orion-ui/` and ships `python/orion-ui/orion_ui/`. Managed Orion runtimes pin `orion-ui==<Orion version>` via `python/orion_agent/managed_packages.py` — keep versions in lockstep on every release.

The legacy npm package `@nicolasakf/orion-agent` should be deprecated after the first `orion-notebook` npm publish (see registry publish notes).

Detailed reference: [CONTRIBUTING.md — Publishing The CLI](../../../CONTRIBUTING.md#publishing-the-cli)

## Automated workflow

**Phase 1 — Prepare:** pre-flight → version bump → commit → build → tag/push → GitHub release → build PyPI artifacts.

**Phase 2 — Publish:** run `scripts/publish-release.sh` (npm + both PyPI packages, non-interactive via env tokens).

**Phase 3 — Verify:** post-release registry checks immediately after Phase 2 succeeds.

If the user invokes this skill and has already completed Phase 1 (tag + GitHub release exist for the target version), skip to Phase 2 (publish) or Phase 3 (verify only) as appropriate.

## Publish credentials (one-time setup)

Store tokens in `~/.zprofile` (or export manually). **Never commit tokens.**

| Variable | Purpose |
| --- | --- |
| `NPM_TOKEN` | npm granular access token — **Read and write**, scoped to `orion-notebook`, **Bypass 2FA** checked |
| `TWINE_PASSWORD` | PyPI API token (`pypi-AgEI…`) with upload access to `orion-ui` and `orion-notebook` |
| `PYPI_TOKEN` | Alias for `TWINE_PASSWORD` (either works) |
| `TWINE_USERNAME` | Optional; defaults to `__token__` |

Create the npm token at [npmjs.com → Access Tokens](https://www.npmjs.com/settings/~npm/access-tokens). Create PyPI tokens at [pypi.org → Account settings → API tokens](https://pypi.org/manage/account/token/).

Agent shells may not load `~/.zprofile` automatically. The publish script sources it when vars are missing; if pre-flight still fails, run `source ~/.zprofile` first.

## Prerequisites

- Clean `main` (or an agreed release branch) with changes merged
- `gh` authenticated (`gh auth status`)
- Publish credentials in environment (`bash scripts/publish-release.sh --check`)
- Node.js 20+, Python 3.8+ locally for build/test

Pre-flight runs `bash scripts/publish-release.sh --check` (validates `NPM_TOKEN`, PyPI token, and `npm whoami`).

## Version Files (keep in sync)

Bump the **same semver** in all of:

| File | Field |
| --- | --- |
| `package.json` | `"version"` |
| `package-lock.json` | top-level `"version"` and `"packages"."".version` |
| `python/pyproject.toml` | `[project].version` |
| `python/orion-ui/pyproject.toml` | `[project].version` |
| `python/orion_agent/__init__.py` | `__version__` |
| `python/orion-ui/orion_ui/__init__.py` | `__version__` |
| `python/orion_agent/cli.py` | `VERSION` and `DEFAULT_APP_BUNDLE_URL` path segment |

Prefer `npm version <x.y.z> --no-git-tag-version` for `package.json` + lockfile, then mirror the version in the Python files.

## Release Checklist

```
Phase 1 — Prepare
- [ ] 1. Pre-flight validation (+ credential check)
- [ ] 2. Decide version (patch / minor / major)
- [ ] 3. Update CHANGELOG.md
- [ ] 4. Bump all version files
- [ ] 5. Commit release prep
- [ ] 6. Build and smoke-test npm package
- [ ] 7. Tag and push
- [ ] 8. GitHub release + app bundle asset
- [ ] 9. Build PyPI artifacts (twine check only)

Phase 2 — Publish
- [ ] 10. Run scripts/publish-release.sh

Phase 3 — Verify
- [ ] 11. Post-release verification
- [ ] 12. Clean up temp release files (CHANGELOG-excerpt.md, npm pack .tgz)
```

---

## Phase 1 — Prepare

### Step 1: Pre-flight validation

From repo root:

```bash
git status --short
npm test
npx tsc --noEmit
npm run lint
bash scripts/publish-release.sh --check
```

Do not publish from a dirty tree unless the user explicitly wants unreleased local changes included. Resolve or stash unrelated work first.

Review `git log` since the last release tag to draft CHANGELOG entries.

If a release tag for the target version already exists and npm/PyPI still show an older version, bump to the next patch instead of reusing the tag.

### Step 2: CHANGELOG.md

Create or update `CHANGELOG.md` at repo root using [Keep a Changelog](https://keepachangelog.com/) format:

```markdown
# Changelog

All notable changes to Orion are documented here.

## [0.5.1] - 2026-05-22

### Fixed
- ...

[0.5.1]: https://github.com/nicolasakf/Orion-app/releases/tag/v0.5.1
```

Include user-visible CLI/app changes and **`orion-ui`** API or output-format changes. Link the version heading to the GitHub release URL (can be filled in during Phase 1 step 8).

### Step 3: Version bump commit

Only create the commit when the user asked to publish (invoking this skill counts).

Suggested commit message:

```text
chore(release): v0.5.1
```

Include in the commit:
- all version file updates
- `CHANGELOG.md`

Do **not** commit `CHANGELOG-excerpt.md` (release-notes scratch file).

### Step 4: Build and smoke-test

```bash
npm run prepack
```

`prepack` runs: `next build` → `build:cli` → `prepare:app-bundle` → `archive:app-bundle`

`scripts/prepare-app-bundle.mjs` strips `logs/` from the standalone copy. Dev log files can add ~500 MB and push the npm tarball over registry limits (`413 Payload Too Large`). Expect ~160 MB compressed after the strip.

Confirm bundle sanity:

```bash
test ! -d dist/orion-app/logs && echo "logs/ absent OK"
ls -lh dist/orion-app-<version>.tar.gz
npm pack --dry-run
```

Optional local install smoke test (agent may run if time permits):

```bash
npm pack
npm install -g ./orion-notebook-<version>.tgz
orion --yes --no-browser
npm uninstall -g orion-notebook
```

Confirm:
- Orion app starts and prints a local URL
- Jupyter handoff file exists at `~/.orion/runtime/jupyter-connection.json`
- `/api/local/jupyter/connection` returns the connection

### Step 5: Tag and push

```bash
git tag v<version>    # skip if tag already points at release commit
git push origin main
git push origin v<version>
```

Use the branch the user specifies if not `main`.

### Step 6: GitHub release (required before PyPI)

PyPI users download the app bundle from:

```text
https://github.com/nicolasakf/Orion-app/releases/download/v<version>/orion-app-<version>.tar.gz
```

Create the release **before** PyPI upload:

```bash
gh release create v<version> \
  dist/orion-app-<version>.tar.gz \
  --title "v<version>" \
  --notes-file CHANGELOG-excerpt.md
```

Write `CHANGELOG-excerpt.md` locally from the new `CHANGELOG.md` section (do not commit it). Use `--notes "..."` for a one-liner instead if preferred.

To replace a bad asset after rebuilding: `gh release upload v<version> dist/orion-app-<version>.tar.gz --clobber`

Verify the asset URL responds:

```bash
curl -I "https://github.com/nicolasakf/Orion-app/releases/download/v<version>/orion-app-<version>.tar.gz"
```

### Step 7: Build PyPI artifacts

Build both Python packages. Confirm each `pyproject.toml` version matches npm.

**`orion-ui`** (`python/orion-ui/pyproject.toml` → `name = "orion-ui"`):

```bash
cd python/orion-ui
rm -rf dist/ build/ *.egg-info/
python3 -m pip install build twine
python3 -m build
twine check dist/*
```

**`orion-notebook`** (`python/pyproject.toml` → `name = "orion-notebook"`):

```bash
cd ../
rm -rf dist/ build/ orion_notebook.egg-info/ orion_agent.egg-info/
python3 -m build
twine check dist/*
```

Optional `orion-ui` import smoke test (agent may run from repo root):

```bash
PYTHONPATH=python/orion-ui python3 -c "import orion_ui; print(orion_ui.__version__)"
cd python && python3 -m pytest tests/test_orion_ui.py tests/test_managed_packages.py -q
```

---

## Phase 2 — Publish registries

From repo root, after Phase 1 artifacts exist and the GitHub release asset is live:

```bash
bash scripts/publish-release.sh
```

The script:
1. Sources `~/.zprofile` if `NPM_TOKEN` / PyPI token are not already exported
2. Publishes **npm** (`orion-notebook`) — `prepack` runs again via the npm lifecycle
3. Publishes **PyPI `orion-ui`** first, then **`orion-notebook`**

Do **not** echo or log token values. On failure, diagnose from the error output and the troubleshooting table — do not re-run publish automatically unless the user asks.

### One-time legacy npm deprecation

After the first successful `orion-notebook` npm publish:

```bash
npm deprecate @nicolasakf/orion-agent "Renamed to orion-notebook. Install with: npm install -g orion-notebook"
```

---

## Phase 3 — Post-release verification

Run immediately after Phase 2 succeeds (no user "done" reply needed).

Read the target version from `package.json` (or the release tag just cut). Run all checks; report pass/fail for each.

### Registry version checks

```bash
npm view orion-notebook version
pip index versions orion-notebook
pip index versions orion-ui
```

All three must match the release version (e.g. `0.6.2`).

### GitHub release asset

```bash
curl -sI "https://github.com/nicolasakf/Orion-app/releases/download/v<version>/orion-app-<version>.tar.gz" | head -3
gh release view v<version> --json assets
```

Confirm `orion-app-<version>.tar.gz` is listed and the download URL responds.

### Optional live smoke tests (run if environment allows)

```bash
npx orion-notebook@<version> --yes --no-browser
pip install --upgrade orion-notebook==<version>
orion --yes --no-browser
```

For PyPI, confirm the launcher downloads the bundle from the GitHub release URL (no 404).

### Verification checklist

Report results for:

- [ ] `npm view orion-notebook version` matches release
- [ ] `pip index versions orion-notebook` includes release version
- [ ] `pip index versions orion-ui` includes release version
- [ ] GitHub release lists `orion-app-<version>.tar.gz`
- [ ] GitHub asset URL returns a redirect/200
- [ ] (optional) `npx orion-notebook@<version> --yes` starts Orion
- [ ] (optional) fresh `pip install orion-notebook==<version>` downloads bundle successfully

If any check fails, diagnose using the troubleshooting table and tell the user what to fix — do **not** re-run publish commands automatically.

### Cleanup

Remove release temp files: `CHANGELOG-excerpt.md`, local `npm pack` tarballs, and any other scratch artifacts — never commit them.

---

## Publish order (critical)

1. Version bump + CHANGELOG commit (all version files, including `orion-ui`)
2. Tag + push
3. `npm run prepack` (if not already run)
4. **GitHub release with app bundle** ← `orion-notebook` PyPI depends on this
5. Build PyPI artifacts for **`orion-ui`** and **`orion-notebook`**
6. **`scripts/publish-release.sh`** (npm, then PyPI `orion-ui`, then PyPI `orion-notebook`)
7. Post-release verification

Publishing `orion-notebook` to PyPI before the GitHub release asset exists will break first-run `pip install orion-notebook` users. Publishing `orion-notebook` before `orion-ui` will break managed runtime venv sync on first startup.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Missing publish credentials` | Vars not in agent shell | `source ~/.zprofile` or re-run terminal; verify with `--check` |
| npm `EOTP` | Token lacks Bypass 2FA | Regenerate npm granular token with **Bypass 2FA** checked |
| npm `413 Payload Too Large` | `logs/` included in app bundle | Re-run `prepack`; confirm `prepare-app-bundle.mjs` strips `logs/` |
| npm `401` | Invalid or expired `NPM_TOKEN` | Regenerate token; update `~/.zprofile` |
| npm `404` on `orion-notebook` at publish | Name taken or not logged in | Confirm `npm whoami`; check registry with `npm view orion-notebook` |
| PyPI `403` / `401` | Invalid `TWINE_PASSWORD` / `PYPI_TOKEN` | Regenerate PyPI API token; update `~/.zprofile` |
| PyPI `400` name too similar | Normalized name conflicts with existing project | Pick a distinct name (current: `orion-notebook`); use `--verbose` to confirm |
| PyPI `400` generic | Bad metadata or description | `twine check dist/*`; use `twine upload --verbose dist/*` for details |
| Verification: npm still on old version | Publish not finished or registry lag | Wait a minute and re-check; re-run `bash scripts/publish-release.sh` if publish failed |
| Verification: pip install 404 on bundle | PyPI published before GitHub asset | Upload GitHub asset first, then re-run PyPI publish |
| Managed runtime `ModuleNotFoundError: orion_ui` | `orion-ui` not on PyPI for this version | Publish `orion-ui` first; users retry after both PyPI packages are live |
| Verification: `orion-ui` missing on PyPI | Script failed mid-run | `cd python/orion-ui && twine upload dist/*` (with token env set) |

## Notes

- Do not run `npm run dev` during release unless the user asks; use `prepack` / production build.
- Do not print, commit, or log `NPM_TOKEN`, `TWINE_PASSWORD`, or `PYPI_TOKEN`.
- Do not force-push tags or rewrite published versions without explicit user approval.
- For breaking changes, bump minor/major semver and call them out in CHANGELOG.
- npm package size is large (~160 MB compressed, includes app bundle); both PyPI wheels stay small by design.
- User-facing install commands: `npm install -g orion-notebook`, `pip install orion-notebook`, and `pip install orion-ui` (external kernels only — managed runtimes sync `orion-ui` automatically).
- `orion-ui` is version-coupled to the Orion app: the Python output MIME format and the frontend renderer ship together. Do not publish a mismatched `orion-ui` version for a given Orion release.

## Additional Resources

- Publish script: [scripts/publish-release.sh](../../../scripts/publish-release.sh)
- User install docs: [README.md — Quick start](../../../README.md#quick-start)
- PyPI launcher behavior: [python/README.md](../../../python/README.md)
- `orion-ui` library docs: [python/orion-ui/README.md](../../../python/orion-ui/README.md)
