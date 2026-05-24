---
name: publish-orion-release
description: Publishes an Orion CLI release in two phases — the agent prepares version bump, build, tag, and GitHub release, then the user manually runs npm/PyPI publish (OTP/credentials); when the user says "done", the agent runs post-release verification. Use when the user asks to publish a release, ship a version, bump and publish orion-notebook, or cut a new npm/PyPI release.
---

# Publish Orion Release

Orion ships two packages that both install the `orion` command under the same name:

| Channel | Package | Ships in package |
| --- | --- | --- |
| npm | `orion-notebook` | CLI + app bundle |
| PyPI | `orion-notebook` | Python launcher only (app bundle downloaded from GitHub release) |

The Python module directory stays `python/orion_agent/`; only `[project].name` in `python/pyproject.toml` is `orion-notebook`. The legacy npm package `@nicolasakf/orion-agent` should be deprecated after the first `orion-notebook` npm publish (see Phase 2).

Detailed reference: [CONTRIBUTING.md — Publishing The CLI](../../../CONTRIBUTING.md#publishing-the-cli)

## Two-phase workflow

**Phase 1 — Agent (automated):** pre-flight → version bump → commit → build → tag/push → GitHub release → build PyPI artifacts → **stop and hand off manual steps**.

**Phase 2 — User (manual):** `npm publish` and `twine upload` (require OTP / interactive credentials — the agent must **not** run these).

**Phase 3 — Agent (on "done"):** when the user replies **"done"** (or equivalent: "published", "finished", "manual steps complete"), run **post-release verification** only.

If the user invokes this skill and has already completed Phase 1 (tag + GitHub release exist for the target version), skip to the manual handoff or Phase 3 as appropriate.

## Prerequisites

- Clean `main` (or an agreed release branch) with changes merged
- `gh` authenticated (`gh auth status`)
- User has npm publish access (`npm whoami`)
- User has PyPI credentials for `orion-notebook` (`twine` or `uv publish`)
- Node.js 20+, Python 3.8+ locally for build/test

The agent checks `gh auth status` and `npm whoami` during pre-flight but does **not** need to be logged into PyPI.

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
Phase 1 — Agent
- [ ] 1. Pre-flight validation
- [ ] 2. Decide version (patch / minor / major)
- [ ] 3. Update CHANGELOG.md
- [ ] 4. Bump all version files
- [ ] 5. Commit release prep
- [ ] 6. Build and smoke-test npm package
- [ ] 7. Tag and push
- [ ] 8. GitHub release + app bundle asset
- [ ] 9. Build PyPI artifacts (twine check only)
- [ ] 10. Clean up temp release files (e.g. `CHANGELOG-excerpt.md`, `npm pack` `.tgz`); print manual publish instructions → STOP

Phase 2 — User (manual)
- [ ] 11. npm publish
- [ ] 12. PyPI publish (orion-notebook)
- [ ] 13. Reply "done"

Phase 3 — Agent (after "done")
- [ ] 14. Post-release verification
```

---

## Phase 1 — Agent steps

### Step 1: Pre-flight validation

From repo root:

```bash
git status --short
npm test
npx tsc --noEmit
npm run lint
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

Include user-visible CLI/app changes. Link the version heading to the GitHub release URL (can be filled in during Phase 1 step 8).

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

### Step 4: Build and smoke-test (before handoff)

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

Create the release **before** the user runs PyPI upload:

```bash
gh release create v<version> \
  dist/orion-app-<version>.tar.gz \
  --title "v<version>" \
  --notes-file CHANGELOG-excerpt.md
```

Write `CHANGELOG-excerpt.md` locally from the new `CHANGELOG.md` section (do not commit it). Use `--notes "..."` for a one-liner instead if preferred.

After the release is created, delete `CHANGELOG-excerpt.md` and any other scratch files from the release (e.g. `orion-notebook-*.tgz` from `npm pack`). Do not leave them untracked in the repo.

To replace a bad asset after rebuilding: `gh release upload v<version> dist/orion-app-<version>.tar.gz --clobber`

Verify the asset URL responds:

```bash
curl -I "https://github.com/nicolasakf/Orion-app/releases/download/v<version>/orion-app-<version>.tar.gz"
```

### Step 7: Build PyPI artifacts (do not upload)

Confirm `python/pyproject.toml` has `name = "orion-notebook"` and the version matches npm.

```bash
cd python
rm -rf dist/ build/ orion_notebook.egg-info/ orion_agent.egg-info/
python3 -m pip install build twine
python3 -m build
twine check dist/*
```

Stop here. Do **not** run `twine upload` or `npm publish`.

### Step 8: Hand off to user — STOP

Print the manual instructions below (substitute `<version>`), then **stop**. Do not attempt npm/PyPI publish. Tell the user to reply **"done"** when both publishes succeed.

Use this template in the handoff message:

---

**Manual publish required** (npm OTP + PyPI credentials). Run from your terminal:

**npm** (repo root):

```bash
cd /path/to/Orion-app
npm whoami
npm publish --access public
```

Enter your npm one-time password when prompted. `prepack` rebuilds automatically.

**PyPI** (`python/`):

```bash
cd /path/to/Orion-app/python
twine upload dist/*
# or: python3 -m twine upload dist/*
```

Use `twine upload --verbose dist/*` if PyPI returns a generic `400 Bad Request`.

When both commands succeed, reply **done** and I will run post-release verification.

---

---

## Phase 2 — User manual steps

The agent does **not** run these. Reference for the handoff message and troubleshooting.

### npm publish

```bash
npm whoami
npm publish --access public
```

`prepack` runs again automatically via the `prepack` lifecycle script.

**npm auth tips:**

```bash
npm login
# or:
npm config set //registry.npmjs.org/:_authToken npm_<your-token>
```

If publish returns `401` then polls `/-/v1/done?authId=...` and ends in `404`, the web-login flow timed out — log in with a token and retry.

After the first successful `orion-notebook` npm publish, deprecate the legacy scoped package (one-time):

```bash
npm deprecate @nicolasakf/orion-agent "Renamed to orion-notebook. Install with: npm install -g orion-notebook"
```

### PyPI publish (`orion-notebook`)

Artifacts should already exist under `python/dist/` from Phase 1. If missing, rebuild:

```bash
cd python
rm -rf dist/ build/ orion_notebook.egg-info/
python3 -m build
twine check dist/*
twine upload dist/*
```

Publish order: GitHub release asset **must** exist before PyPI upload (Phase 1 step 6 handles this).

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

Known unavailable names: `orion-agent`, `orion-cli`, `orionagent`, `orion`, `orionai`.

---

## Phase 3 — Post-release verification (when user says "done")

Trigger: user replies **"done"**, **"published"**, **"finished"**, or confirms manual steps are complete.

Read the target version from `package.json` (or the release tag just cut). Run all checks; report pass/fail for each.

### Registry version checks

```bash
npm view orion-notebook version
pip index versions orion-notebook
```

Both must match the release version (e.g. `0.5.1`).

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
- [ ] GitHub release lists `orion-app-<version>.tar.gz`
- [ ] GitHub asset URL returns a redirect/200
- [ ] (optional) `npx orion-notebook@<version> --yes` starts Orion
- [ ] (optional) fresh `pip install orion-notebook==<version>` downloads bundle successfully

If any check fails, diagnose using the troubleshooting table and tell the user what to fix — do **not** re-run publish commands automatically.

---

## Publish order (critical)

1. Version bump + CHANGELOG commit
2. Tag + push
3. `npm run prepack` (if not already run)
4. **GitHub release with app bundle** ← PyPI depends on this
5. **User:** npm publish
6. **User:** PyPI publish (`orion-notebook`)
7. **Agent:** post-release verification (on "done")

Publishing PyPI before the GitHub release asset exists will break first-run `pip install orion-notebook` users.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| npm `EOTP` | 2FA required | User runs `npm publish` manually and enters OTP |
| npm `413 Payload Too Large` | `logs/` included in app bundle | Re-run `prepack`; confirm `prepare-app-bundle.mjs` strips `logs/` |
| npm `401` then `404` on `/-/v1/done` | Not logged in; web auth timed out | `npm login` or set `_authToken`; retry |
| npm `404` on `orion-notebook` at publish | Name taken or not logged in | Confirm `npm whoami`; check registry with `npm view orion-notebook` |
| PyPI `400` name too similar | Normalized name conflicts with existing project | Pick a distinct name (current: `orion-notebook`); use `--verbose` to confirm |
| PyPI `400` generic | Bad metadata or description | `twine check dist/*`; use `--verbose` for details |
| Verification: npm still on old version | Publish not finished or wrong registry | User re-runs `npm publish`; wait a minute and re-check |
| Verification: pip install 404 on bundle | PyPI published before GitHub asset | Upload GitHub asset first, then tell users to retry |

## Notes

- Do not run `npm run dev` during release unless the user asks; use `prepack` / production build.
- Do not run `npm publish` or `twine upload` — always hand off to the user.
- Do not force-push tags or rewrite published versions without explicit user approval.
- For breaking changes, bump minor/major semver and call them out in CHANGELOG.
- npm package size is large (~160 MB compressed, includes app bundle); PyPI wheel stays small by design.
- User-facing install commands: `npm install -g orion-notebook` and `pip install orion-notebook`.

## Additional Resources

- User install docs: [README.md — Quick start](../../../README.md#quick-start)
- PyPI-specific behavior: [python/README.md](../../../python/README.md)
