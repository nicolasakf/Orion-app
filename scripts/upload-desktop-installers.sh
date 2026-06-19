#!/usr/bin/env bash
# Upload locally built desktop installers to a GitHub release.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(node -p "require('./package.json').version")"
TAG="v${VERSION}"
REPO="${GITHUB_REPOSITORY:-nicolasakf/Orion-app}"
DIST_DIR="${ROOT}/dist/electron"

usage() {
  cat <<EOF
Usage: scripts/upload-desktop-installers.sh [--tag v${VERSION}]

Uploads desktop installer assets from dist/electron to a GitHub release.
Expected assets:
  Orion-${VERSION}-mac-arm64.dmg
  Orion-${VERSION}-mac-arm64.zip
  Orion-${VERSION}-mac-x64.dmg
  Orion-${VERSION}-mac-x64.zip
  Orion-Setup-${VERSION}-win-x64.exe

Environment:
  GITHUB_REPOSITORY  Optional owner/repo override. Defaults to ${REPO}.
  GH_TOKEN           Required by gh when not already authenticated.
EOF
}

while (($# > 0)); do
  case "$1" in
    --tag)
      TAG="${2:?--tag requires a value}"
      VERSION="${TAG#v}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required." >&2
  exit 1
fi

if [[ ! -d "${DIST_DIR}" ]]; then
  echo "Desktop build output was not found at ${DIST_DIR}." >&2
  echo "Run npm run prepack:desktop and electron-builder first." >&2
  exit 1
fi

declare -a candidates=(
  "Orion-${VERSION}-mac-arm64.dmg"
  "Orion-${VERSION}-mac-arm64.zip"
  "Orion-${VERSION}-mac-x64.dmg"
  "Orion-${VERSION}-mac-x64.zip"
  "Orion-Setup-${VERSION}-win-x64.exe"
  "latest-mac.yml"
  "latest.yml"
)

declare -a assets=()
for name in "${candidates[@]}"; do
  if [[ -f "${DIST_DIR}/${name}" ]]; then
    assets+=("${DIST_DIR}/${name}")
  fi
done

while IFS= read -r blockmap; do
  assets+=("${blockmap}")
done < <(find "${DIST_DIR}" -maxdepth 1 -type f -name "*.blockmap" -print)

if ((${#assets[@]} == 0)); then
  echo "No desktop installer assets were found in ${DIST_DIR}." >&2
  exit 1
fi

if ! gh release view "${TAG}" --repo "${REPO}" >/dev/null 2>&1; then
  gh release create "${TAG}" --repo "${REPO}" --title "${TAG}" --notes "Desktop installers for ${TAG}."
fi

printf "Uploading %s assets to %s %s:\n" "${#assets[@]}" "${REPO}" "${TAG}"
printf "  %s\n" "${assets[@]##*/}"
gh release upload "${TAG}" "${assets[@]}" --repo "${REPO}" --clobber
