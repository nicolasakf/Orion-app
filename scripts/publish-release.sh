#!/usr/bin/env bash
# Publish orion-notebook to npm and orion-ui / orion-notebook to PyPI using env credentials.
# Requires: NPM_TOKEN, TWINE_PASSWORD (or PYPI_TOKEN). Optional: TWINE_USERNAME (default __token__).
# Credentials are read from the environment; sources ~/.zprofile when vars are unset.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

load_credentials() {
  if [[ -z "${NPM_TOKEN:-}" || -z "${TWINE_PASSWORD:-}${PYPI_TOKEN:-}" ]]; then
    if [[ -f "${HOME}/.zprofile" ]]; then
      # shellcheck disable=SC1091
      source "${HOME}/.zprofile"
    fi
  fi

  if [[ -n "${PYPI_TOKEN:-}" && -z "${TWINE_PASSWORD:-}" ]]; then
    export TWINE_PASSWORD="${PYPI_TOKEN}"
  fi

  export TWINE_USERNAME="${TWINE_USERNAME:-__token__}"
}

require_credentials() {
  local missing=()
  [[ -n "${NPM_TOKEN:-}" ]] || missing+=("NPM_TOKEN")
  [[ -n "${TWINE_PASSWORD:-}" ]] || missing+=("TWINE_PASSWORD or PYPI_TOKEN")

  if ((${#missing[@]} > 0)); then
    echo "Missing publish credentials: ${missing[*]}" >&2
    echo "Set them in ~/.zprofile or export before running this script." >&2
    exit 1
  fi
}

# Requires only the PyPI credential for targeted recovery publishes.
require_pypi_credentials() {
  if [[ -z "${TWINE_PASSWORD:-}" ]]; then
    echo "Missing publish credentials: TWINE_PASSWORD or PYPI_TOKEN" >&2
    echo "Set them in ~/.zprofile or export before running this script." >&2
    exit 1
  fi
}

NPMRC_FILE=""

setup_npm_auth() {
  NPMRC_FILE="$(mktemp)"
  chmod 600 "${NPMRC_FILE}"
  printf '//registry.npmjs.org/:_authToken=%s\n' "${NPM_TOKEN}" > "${NPMRC_FILE}"
}

cleanup_npm_auth() {
  if [[ -n "${NPMRC_FILE}" && -f "${NPMRC_FILE}" ]]; then
    rm -f "${NPMRC_FILE}"
  fi
}

publish_npm() {
  setup_npm_auth
  trap cleanup_npm_auth EXIT
  npm whoami --userconfig "${NPMRC_FILE}"
  npm publish --access public --userconfig "${NPMRC_FILE}"
}

# Builds fresh PyPI artifacts and optionally skips files already uploaded by a partial release.
publish_pypi() {
  local dir="$1"
  local label="$2"
  local skip_existing="${3:-false}"
  local release_dist
  local upload_args=(--non-interactive)

  # Build into a fresh directory so stale artifacts can never be re-uploaded.
  release_dist="$(mktemp -d "${TMPDIR:-/tmp}/orion-${label}.XXXXXX")"
  python3 -m build "${dir}" --outdir "${release_dist}"
  python3 -m twine check "${release_dist}"/*
  if [[ "${skip_existing}" == "true" ]]; then
    upload_args+=(--skip-existing)
  fi
  TWINE_USERNAME="${TWINE_USERNAME}" TWINE_PASSWORD="${TWINE_PASSWORD}" \
    python3 -m twine upload "${upload_args[@]}" "${release_dist}"/*
  rm -rf "${release_dist}"
}

check_only() {
  load_credentials
  require_credentials
  setup_npm_auth
  trap cleanup_npm_auth EXIT
  local npm_user
  npm_user="$(npm whoami --userconfig "${NPMRC_FILE}")"
  echo "Publish credentials OK (npm: ${npm_user}, PyPI token set)."
}

main() {
  cd "${ROOT}"

  case "${1:-}" in
    --check)
      check_only
      return 0
      ;;
    --help|-h)
      cat <<'EOF'
Usage: scripts/publish-release.sh [--check|--pypi-only]

Publishes orion-notebook to npm, then orion-ui and orion-notebook to PyPI.

Environment (typically in ~/.zprofile):
  NPM_TOKEN          npm granular token with write + bypass 2FA
  TWINE_PASSWORD     PyPI API token (or set PYPI_TOKEN)
  TWINE_USERNAME     optional; defaults to __token__

Options:
  --check   Verify credentials without publishing
  --pypi-only  Build fresh PyPI artifacts and publish orion-ui then orion-notebook
EOF
      return 0
      ;;
  esac

  load_credentials

  if [[ "${1:-}" == "--pypi-only" ]]; then
    require_pypi_credentials

    echo "==> PyPI publish (orion-ui)"
    publish_pypi "${ROOT}/python/orion-ui" "orion-ui" true

    echo "==> PyPI publish (orion-notebook)"
    publish_pypi "${ROOT}/python" "orion-notebook" true

    echo "==> Both PyPI packages published."
    return 0
  fi

  require_credentials

  echo "==> npm publish (orion-notebook)"
  publish_npm

  echo "==> PyPI publish (orion-ui)"
  publish_pypi "${ROOT}/python/orion-ui" "orion-ui"

  echo "==> PyPI publish (orion-notebook)"
  publish_pypi "${ROOT}/python" "orion-notebook"

  echo "==> All three registries published."
}

main "$@"
