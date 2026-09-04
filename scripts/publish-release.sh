#!/usr/bin/env bash
# Publish orion-ui and orion-notebook to PyPI using environment credentials.
# npm is published by desktop-release.yml through npm trusted publishing (OIDC).
# Requires: TWINE_PASSWORD (or PYPI_TOKEN). Optional: TWINE_USERNAME (default __token__).
# Credentials are read from the environment; sources ~/.zprofile when vars are unset.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

load_credentials() {
  if [[ -z "${TWINE_PASSWORD:-}${PYPI_TOKEN:-}" ]]; then
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
  if [[ -z "${TWINE_PASSWORD:-}" ]]; then
    echo "Missing publish credentials: TWINE_PASSWORD or PYPI_TOKEN" >&2
    echo "Set them in ~/.zprofile or export before running this script." >&2
    exit 1
  fi
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
  echo "PyPI publish credential is set. npm uses GitHub Actions OIDC."
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

Publishes orion-ui and orion-notebook to PyPI. npm publishing runs in the
Desktop Release GitHub Actions workflow through trusted publishing (OIDC).

Environment (typically in ~/.zprofile):
  TWINE_PASSWORD     PyPI API token (or set PYPI_TOKEN)
  TWINE_USERNAME     optional; defaults to __token__

Options:
  --check   Verify credentials without publishing
  --pypi-only  Compatibility alias for the default publish behavior
EOF
      return 0
      ;;
  esac

  load_credentials

  if [[ -n "${1:-}" && "${1}" != "--pypi-only" ]]; then
    echo "Unknown option: ${1}" >&2
    echo "Run with --help for usage." >&2
    exit 2
  fi

  require_credentials

  echo "==> PyPI publish (orion-ui)"
  publish_pypi "${ROOT}/python/orion-ui" "orion-ui" true

  echo "==> PyPI publish (orion-notebook)"
  publish_pypi "${ROOT}/python" "orion-notebook" true

  echo "==> Both PyPI packages published."
}

main "$@"
