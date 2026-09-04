---
name: publish-orion-release
description: Publishes an Orion release end-to-end — version bump, build, push release prep, wait for GitHub checks/install smoke, tag, GitHub/npm release through desktop-release.yml, PyPI publish via scripts/publish-release.sh, sync sibling tags, then verify. Use when the user asks to publish a release, ship a version, bump and publish orion-notebook or orion-ui, or cut a new npm/PyPI release.
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

Orion also ships as three GitHub repos that share the **same semver tag** (`v<version>`):

| Repo | Role | Release artifact |
| --- | --- | --- |
| `Orion-app` | CLI, desktop app, `orion-ui` Python lib | npm + PyPI + GitHub release with app bundle |
| `Orion-api` | Hosted Orion API / cloud backend | Git tag only (no GitHub release for now) |
| `Orion-docs` | User-facing documentation site | Git tag only (no GitHub release for now) |

Detailed reference: [CONTRIBUTING.md — Publishing The CLI](../../../CONTRIBUTING.md#publishing-the-cli)

## Automated workflow

**Phase 1 — Prepare and gate:** pre-flight → version bump → commit → build → push release prep → wait for GitHub checks (skip if pre-validated — see **Step 5**) → tag/push → wait for `Desktop Release` to publish the GitHub release and npm package through OIDC → build PyPI artifacts.

**Phase 1b — Sync sibling repos:** bump version markers in `Orion-api` and `Orion-docs`, commit, tag `v<version>`, push (no GitHub releases).

**Phase 2 — Publish:** run `scripts/publish-release.sh` for both PyPI packages (non-interactive via the PyPI token). npm is already published by `desktop-release.yml` through npm trusted publishing.

**Phase 3 — Verify:** post-release registry checks and sibling-repo tag checks immediately after Phase 2 succeeds.

If the user invokes this skill and the tag-triggered `Desktop Release` workflow already completed for the target version, skip to Phase 1b (if sibling tags are missing), Phase 2 (if PyPI is missing), or Phase 3 (verify only) as appropriate.

## Publish credentials (one-time setup)

Store tokens in `~/.zprofile` (or export manually). **Never commit tokens.**

| Variable | Purpose |
| --- | --- |
| `TWINE_PASSWORD` | PyPI API token (`pypi-AgEI…`) with upload access to `orion-ui` and `orion-notebook` |
| `PYPI_TOKEN` | Alias for `TWINE_PASSWORD` (either works) |
| `TWINE_USERNAME` | Optional; defaults to `__token__` |

The npm package uses a trusted-publisher connection for `nicolasakf/Orion-app` and `.github/workflows/desktop-release.yml`; no npm token is required. Create PyPI tokens at [pypi.org → Account settings → API tokens](https://pypi.org/manage/account/token/).

Agent shells may not load `~/.zprofile` automatically. The publish script sources it when vars are missing; if pre-flight still fails, run `source ~/.zprofile` first.

## Prerequisites

- Clean `main` (or an agreed release branch) with changes merged
- `gh` authenticated (`gh auth status`)
- PyPI publish credential in the environment (`bash scripts/publish-release.sh --check`)
- Node.js 20+, Python 3.8+ locally for build/test
- Passing GitHub checks before tagging or publishing, especially the cross-OS `Install Smoke` workflow — on the release prep commit **or** on the parent commit when the release prep commit is version-only (see **Step 5**)

Pre-flight runs `bash scripts/publish-release.sh --check` to confirm the PyPI token is present. npm authentication is validated only when the tag-triggered GitHub Actions job exchanges its OIDC identity with npm.

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

### Sibling repos (Orion-api, Orion-docs)

Use the **same semver** as `Orion-app`. These repos are not published to npm/PyPI — only a version marker commit + git tag.

Assume sibling checkouts next to `Orion-app` (adjust paths if the user's layout differs):

| Repo | Path (default) | Version files |
| --- | --- | --- |
| `Orion-api` | `../Orion-api` | `package.json` `"version"`, `package-lock.json` top-level `"version"` and `"packages"."".version` |
| `Orion-docs` | `../Orion-docs` | `package.json` `"version"` (add the field if missing) |

Prefer `npm version <x.y.z> --no-git-tag-version` in each repo when it has a `package.json`.

## Release Checklist

```
Phase 1 — Prepare and gate
- [ ] 1. Pre-flight validation (+ credential check)
- [ ] 2. Decide version (patch / minor / major)
- [ ] 3. Update CHANGELOG.md
- [ ] 4. Bump all version files
- [ ] 5. Commit release prep
- [ ] 6. Build and smoke-test npm package
- [ ] 7. Push release prep branch/main
- [ ] 8. Wait for GitHub checks to pass (`Install Smoke` is required), or skip if pre-validated (Step 5)
- [ ] 9. Tag and push `v<version>`
- [ ] 10. Wait for `Desktop Release` (GitHub release + npm trusted publish)
- [ ] 11. Build PyPI artifacts (twine check only)
- [ ] 11b. Sync Orion-api + Orion-docs (version commit, tag, push — no GitHub release)

Phase 2 — Publish
- [ ] 12. Run scripts/publish-release.sh (PyPI packages)

Phase 3 — Verify
- [ ] 13. Post-release verification
- [ ] 14. Clean up local npm pack tarballs and other scratch artifacts
```

---

## Phase 1 — Prepare and gate

### Step 1: Pre-flight validation

From repo root:

```bash
git status --short
npm test
npx tsc --noEmit
npm run lint
bash scripts/publish-release.sh --check
```

`npm run lint` is advisory for release gating. Run it and report any failures, but do not block a release solely on pre-existing lint debt or an unavailable/incompatible lint setup. Treat test, type-check, production build, package smoke tests, credentials, and required GitHub checks as the release blockers. Do not weaken or reconfigure lint rules merely to publish unless the user explicitly asks for that change.

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

Include user-visible CLI/app changes and **`orion-ui`** API or output-format changes. Link the version heading to the GitHub release URL (can be filled in during Phase 1 step 7).

### Step 3: Version bump commit

Only create the commit when the user asked to publish (invoking this skill counts).

Suggested commit message:

```text
chore(release): v0.5.1
```

Include in the commit:
- all version file updates
- `CHANGELOG.md`

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

### Step 5: Push release prep and wait for GitHub checks

```bash
git push origin main
```

Use the branch the user specifies if not `main`.

After pushing, wait for the GitHub checks on the release prep commit to pass before creating the release tag or publishing packages — **unless** the pre-validated skip applies (below). The `Install Smoke` workflow is a release gate because it installs Orion across Windows, macOS, and Linux using the public installer paths and artifact overrides.

#### Pre-validated skip (do not wait again)

Skip the wait when **all** of the following are true:

1. The release prep commit is **version-only** — its diff is limited to version files and `CHANGELOG.md` (a `chore(release): v<x.y.z>` commit with no code, workflow, or installer changes).
2. **CI** and **Install Smoke** already completed **successfully** on the parent commit (the last functional commit before the release prep commit), or the user explicitly confirms those checks passed on that commit.
3. No substantive commits since that validated parent are missing from the release (the release prep commit is the only new commit since validation).

Verify the parent commit passed both workflows:

```bash
PARENT=$(git rev-parse HEAD^)
gh run list --commit "$PARENT" --json name,conclusion,status \
  --jq '.[] | select(.name == "CI" or .name == "Install Smoke") | "\(.name): \(.status) \(.conclusion)"'
```

Both must show `completed success`. If either is missing, pending, or failed, **do not skip** — wait for checks on the release prep commit instead.

When the skip applies, push the release prep commit and proceed directly to Step 6 (tag). Note in the release summary that checks were pre-validated on the parent commit.

#### Standard wait (default when skip does not apply)

```bash
gh run list --branch main --limit 10
gh run watch <run-id>
```

If releasing from a pull request, wait for PR checks first, merge to `main`, then wait for the `main` checks on the merged release prep commit. Do not publish npm or PyPI packages from a commit whose required GitHub checks are still pending or failed.

### Step 6: Tag and push

```bash
git tag v<version>    # skip if tag already points at release commit
git push origin v<version>
```

The tag should point at the release prep commit that already passed GitHub checks.

### Step 6b: Sync Orion-api and Orion-docs (tag only)

After `Orion-app` is tagged and pushed, align the sibling repos to the **same** `v<version>` tag. Do **not** create GitHub releases for these repos.

For each repo (`Orion-api`, then `Orion-docs`):

1. `cd` to the repo (default: sibling of `Orion-app`).
2. Confirm the target branch is clean or only contains release-related changes the user wants tagged.
3. Bump version files to `<version>` (see **Sibling repos** table above).
4. Commit (only when publishing — invoking this skill counts):

   ```text
   chore(release): v<version>
   ```

5. Tag and push:

   ```bash
   git tag v<version>    # skip if tag already points at this release commit
   git push origin main  # or the branch the user specifies
   git push origin v<version>
   ```

**Orion-api** example:

```bash
cd ../Orion-api
npm version <version> --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore(release): v<version>"
git tag v<version>
git push origin main
git push origin v<version>
```

**Orion-docs** example (add `"version"` to `package.json` if the field is missing):

```bash
cd ../Orion-docs
npm version <version> --no-git-tag-version
git add package.json
git commit -m "chore(release): v<version>"
git tag v<version>
git push origin main
git push origin v<version>
```

If a sibling repo has **no changes** beyond the version bump, the commit may contain only the version file edits — that is expected.

If `v<version>` already exists on the remote for a sibling repo, skip that repo unless the user explicitly wants to move the tag (never force-push tags without explicit approval).

### Step 7: Wait for the automated GitHub and npm release

PyPI users download the app bundle from:

```text
https://github.com/nicolasakf/Orion-app/releases/download/v<version>/orion-app-<version>.tar.gz
```

Pushing `v<version>` triggers `.github/workflows/desktop-release.yml`. That workflow builds the desktop assets, creates or updates the GitHub release, then publishes the npm tarball through the configured npm trusted publisher. Wait for it to succeed:

```bash
gh run list --workflow desktop-release.yml --limit 5
gh run watch <run-id>
```

Do not run `npm publish` locally. The workflow has `id-token: write`, uses npm CLI 11.5.1, and is the only npm publishing path. It skips the npm step safely when the target version is already published, so failed workflow runs can be retried.

Verify the asset URL responds:

```bash
curl -I "https://github.com/nicolasakf/Orion-app/releases/download/v<version>/orion-app-<version>.tar.gz"
```

### Step 8: Build PyPI artifacts

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

From repo root, after `Desktop Release` succeeds and the GitHub release asset plus npm version are live:

```bash
bash scripts/publish-release.sh
```

The script:
1. Sources `~/.zprofile` if the PyPI token is not already exported
2. Publishes **PyPI `orion-ui`** first, then **`orion-notebook`**
3. Uses `--skip-existing` so a partial PyPI publish can be retried safely

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

### Sibling repo tags

From any directory, verify all three repos expose the same tag:

```bash
for repo in Orion-app Orion-api Orion-docs; do
  echo "=== $repo ==="
  git -C "../$repo" tag -l "v<version>"
  git -C "../$repo" show "v<version>" --no-patch --format="%H %s"
done
```

Or with `gh`:

```bash
gh api repos/nicolasakf/Orion-api/git/refs/tags/v<version> --jq .object.sha
gh api repos/nicolasakf/Orion-docs/git/refs/tags/v<version> --jq .object.sha
```

Both sibling tags must exist and point at commits whose message is `chore(release): v<version>` (or include the version bump in `package.json`).

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

Remove local `npm pack` tarballs and any other scratch artifacts — never commit them.

---

## Publish order (critical)

1. Version bump + CHANGELOG commit in **Orion-app** (all version files, including `orion-ui`)
2. `npm run prepack` and local sanity checks
3. Push the release prep commit to GitHub
4. Wait for required GitHub checks on that commit, especially `Install Smoke` — or skip if pre-validated on the parent commit (Step 5)
5. Tag + push **Orion-app**
6. Wait for **`Desktop Release`** to create the GitHub release and publish npm through OIDC
7. Build PyPI artifacts for **`orion-ui`** and **`orion-notebook`**
8. **Sync Orion-api + Orion-docs** — version commit, `v<version>` tag, push (no GitHub release)
9. **`scripts/publish-release.sh`** (PyPI `orion-ui`, then PyPI `orion-notebook`)
10. Post-release verification (registries + sibling tags)

Publishing `orion-notebook` to PyPI before the GitHub release asset exists will break first-run `pip install orion-notebook` users. Publishing `orion-notebook` before `orion-ui` will break managed runtime venv sync on first startup.

Publishing npm/PyPI before required GitHub checks pass can ship broken installers to users. Treat failed `Install Smoke` jobs as release blockers unless the user explicitly approves an emergency override. The Step 5 pre-validated skip is safe only when the release prep commit is version-only and CI + Install Smoke already succeeded on its parent; do not skip if the release prep commit changes code, workflows, or installers.

Sibling repo sync (step 8) can run in parallel with PyPI artifact build (step 7) if time is tight, but must finish before Phase 3 verification.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Missing publish credentials` | PyPI token not in agent shell | `source ~/.zprofile` or re-run terminal; verify with `--check` |
| npm `ENEEDAUTH` from `publish-npm` | OIDC trust or workflow permissions mismatch | Confirm npm trusts `nicolasakf/Orion-app` + `desktop-release.yml`, the job has `id-token: write`, and it runs on a GitHub-hosted runner |
| npm `413 Payload Too Large` | `logs/` included in app bundle | Re-run `prepack`; confirm `prepare-app-bundle.mjs` strips `logs/` |
| npm publish version mismatch | Tag or workflow input differs from `package.json` | Correct the version commit and create a new release tag; never move an already-pushed release tag without explicit approval |
| PyPI `403` / `401` | Invalid `TWINE_PASSWORD` / `PYPI_TOKEN` | Regenerate PyPI API token; update `~/.zprofile` |
| PyPI `400` name too similar | Normalized name conflicts with existing project | Pick a distinct name (current: `orion-notebook`); use `--verbose` to confirm |
| PyPI `400` generic | Bad metadata or description | `twine check dist/*`; use `twine upload --verbose dist/*` for details |
| Verification: npm still on old version | `publish-npm` failed or registry lag | Inspect and retry the `Desktop Release` workflow after fixing the reported OIDC/package error |
| Verification: pip install 404 on bundle | PyPI published before GitHub asset | Upload GitHub asset first, then re-run PyPI publish |
| Managed runtime `ModuleNotFoundError: orion_ui` | `orion-ui` not on PyPI for this version | Publish `orion-ui` first; users retry after both PyPI packages are live |
| Verification: `orion-ui` missing on PyPI | Script failed mid-run | `cd python/orion-ui && twine upload dist/*` (with token env set) |
| Sibling tag missing after release | Phase 1b skipped or push failed | Re-run Step 6b for the missing repo; do not force-push unless user approves |
| `npm version` fails in Orion-docs | No `"version"` field yet | Add `"version": "0.0.0"` to `package.json`, then re-run `npm version <x.y.z> --no-git-tag-version` |
| Sibling repo dirty tree | Uncommitted local work | Commit or stash unrelated changes before the release commit |

## Notes

- Do not run `npm run dev` during release unless the user asks; use `prepack` / production build.
- Do not print, commit, or log `TWINE_PASSWORD` or `PYPI_TOKEN`.
- Do not force-push tags or rewrite published versions without explicit user approval.
- For breaking changes, bump minor/major semver and call them out in CHANGELOG.
- npm package size is large (~160 MB compressed, includes app bundle); both PyPI wheels stay small by design.
- User-facing install commands: `npm install -g orion-notebook`, `pip install orion-notebook`, and `pip install orion-ui` (external kernels only — managed runtimes sync `orion-ui` automatically).
- `orion-ui` is version-coupled to the Orion app: the Python output MIME format and the frontend renderer ship together. Do not publish a mismatched `orion-ui` version for a given Orion release.
- **Orion-api** and **Orion-docs** stay version-aligned via git tags only — no npm/PyPI publish and no GitHub release assets for those repos yet.
- Sibling repo paths default to `../Orion-api` and `../Orion-docs` relative to the `Orion-app` root; ask the user if their checkout layout differs.

## Additional Resources

- Publish script: [scripts/publish-release.sh](../../../scripts/publish-release.sh)
- User install docs: [README.md — Quick start](../../../README.md#quick-start)
- PyPI launcher behavior: [python/README.md](../../../python/README.md)
- `orion-ui` library docs: [python/orion-ui/README.md](../../../python/orion-ui/README.md)
