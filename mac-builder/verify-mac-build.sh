#!/usr/bin/env bash
set -euo pipefail

MAC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$MAC_DIR/.." && pwd)"
SOURCE_UXP="$PROJECT_ROOT/uxp"
SOURCE_CEP="$PROJECT_ROOT/cep"
SOURCE_MAC_LAUNCHER="$PROJECT_ROOT/helper/macos-launcher.js"
SOURCE_MAC_PROCESS="$PROJECT_ROOT/helper/macos-helper-process.js"
SOURCE_MAC_COMMAND="$PROJECT_ROOT/helper/launch-mac-helper"
PAYLOAD_UXP="$MAC_DIR/payload/UXP"
PAYLOAD_CEP="$MAC_DIR/payload/CEP"
HELPER_INFO="$MAC_DIR/payload/helper/helper-info.json"
DEFAULT_PACKAGE="$MAC_DIR/output/RYZE_Caption_Tool_Mac.pkg"
SOURCE_ONLY=0
PACKAGE_PATH="$DEFAULT_PACKAGE"

if [[ "${1:-}" == "--source-only" ]]; then
  SOURCE_ONLY=1
elif [[ $# -eq 1 ]]; then
  PACKAGE_PATH="$1"
elif [[ $# -gt 1 ]]; then
  printf 'Usage: %s [--source-only|/path/to/RYZE_Caption_Tool_Mac.pkg]\n' "$0" >&2
  exit 2
fi

fail() {
  printf 'VERIFY FAILED: %s\n' "$*" >&2
  exit 1
}

need_file() {
  [[ -f "$1" ]] || fail "missing file: $1"
}

json_string() {
  local key="$1" file="$2"
  sed -nE "s/^[[:space:]]*\"${key}\"[[:space:]]*:[[:space:]]*\"([^\"]+)\".*/\\1/p" "$file" | head -n 1
}

xml_attribute() {
  local attribute="$1" file="$2"
  sed -nE "s/.*[[:space:]]${attribute}=\"([^\"]+)\".*/\\1/p" "$file" | head -n 1
}

for required in \
  "$MAC_DIR/build.sh" \
  "$MAC_DIR/README.md" \
  "$MAC_DIR/Dockerfile" \
  "$MAC_DIR/docker-compose.yml" \
  "$MAC_DIR/package/Distribution.xml" \
  "$MAC_DIR/package/scripts/preinstall" \
  "$MAC_DIR/package/scripts/postinstall" \
  "$SOURCE_UXP/manifest.json" \
  "$SOURCE_UXP/installer-config.json" \
  "$SOURCE_CEP/CSXS/manifest.xml" \
  "$SOURCE_CEP/bridge.js" \
  "$SOURCE_CEP/server.js" \
  "$SOURCE_MAC_LAUNCHER" \
  "$SOURCE_MAC_PROCESS" \
  "$SOURCE_MAC_COMMAND" \
  "$HELPER_INFO"; do
  need_file "$required"
done

UXP_ID="$(json_string id "$SOURCE_UXP/manifest.json")"
UXP_VERSION="$(json_string version "$SOURCE_UXP/manifest.json")"
CEP_ID="$(xml_attribute ExtensionBundleId "$SOURCE_CEP/CSXS/manifest.xml")"
CEP_PANEL_ID="$(xml_attribute Id "$SOURCE_CEP/CSXS/manifest.xml")"
CEP_VERSION="$(xml_attribute ExtensionBundleVersion "$SOURCE_CEP/CSXS/manifest.xml")"

[[ "$UXP_ID" == "com.ryze.captiontool.v1.uxp" ]] || fail "source UXP ID changed: $UXP_ID"
[[ "$CEP_ID" == "com.ryze.captiontool.v1.bridge" ]] || fail "source CEP bundle ID changed: $CEP_ID"
[[ "$CEP_PANEL_ID" == "com.ryze.captiontool.v1.bridge.panel" ]] || fail "source CEP panel ID changed: $CEP_PANEL_ID"
[[ "$UXP_VERSION" == "$CEP_VERSION" ]] || fail "source extension versions differ"

[[ "$(json_string uxpId "$HELPER_INFO")" == "$UXP_ID" ]] || fail "helper metadata UXP ID mismatch"
[[ "$(json_string cepBundleId "$HELPER_INFO")" == "$CEP_ID" ]] || fail "helper metadata CEP ID mismatch"
[[ "$(json_string cepPanelId "$HELPER_INFO")" == "$CEP_PANEL_ID" ]] || fail "helper metadata CEP panel ID mismatch"
[[ "$(json_string version "$HELPER_INFO")" == "$UXP_VERSION" ]] || fail "helper metadata version mismatch"

grep -Fq "$UXP_ID" "$MAC_DIR/package/scripts/postinstall" || fail "postinstall does not preserve UXP ID"
grep -Fq "$CEP_ID" "$MAC_DIR/package/scripts/postinstall" || fail "postinstall does not preserve CEP ID"
grep -Fq 'Library/Application Support/Adobe/CEP/extensions' "$MAC_DIR/package/scripts/postinstall" || fail "CEP destination missing"
grep -Fq 'Library/Application Support/Adobe/UXP/PluginsStorage' "$MAC_DIR/package/scripts/postinstall" || fail "UXP PluginsStorage preparation missing"
grep -Fq '/Library/Application Support/RYZE/CaptionToolV1' "$MAC_DIR/package/scripts/postinstall" || fail "system helper destination missing"
grep -Fq 'UnifiedPluginInstallerAgent' "$MAC_DIR/package/scripts/postinstall" || fail "Adobe UPIA install step missing"
grep -Fq 'connection.json' "$MAC_DIR/package/scripts/postinstall" || fail "connection config name changed"
grep -Fq 'CaptionToolV1' "$MAC_DIR/package/scripts/postinstall" || fail "config folder name changed"
grep -Fq '48771' "$MAC_DIR/package/scripts/postinstall" || fail "helper port changed in postinstall"
grep -Fq 'com.adobe.csxs.events.ApplicationActivate' "$SOURCE_CEP/CSXS/manifest.xml" || fail "CEP startup registration changed"
grep -Fq "env.APPDATA" "$SOURCE_CEP/bridge.js" || fail "Windows application-data path support is missing"
grep -Fq "'Library','Application Support'" "$SOURCE_CEP/bridge.js" || fail "macOS application-data path support is missing"
grep -Fq '127.0.0.1:48771' "$SOURCE_UXP/index.js" || fail "UXP helper endpoint changed"
grep -Fq "server.listen(48771,'127.0.0.1')" "$SOURCE_CEP/server.js" || fail "CEP helper endpoint changed"
grep -Fq "helper','macos-launcher.js" "$SOURCE_CEP/bridge.js" || fail "CEP macOS launcher import missing"
grep -Fq 'HELPER_LAUNCH_ATTEMPTED' "$SOURCE_MAC_LAUNCHER" || fail "launcher attempt diagnostic missing"
grep -Fq 'HELPER_PROCESS_STARTED' "$SOURCE_MAC_LAUNCHER" || fail "launcher process diagnostic missing"
grep -Fq 'HELPER_PORT_LISTENING' "$SOURCE_MAC_PROCESS" || fail "child listening diagnostic missing"
grep -Fq 'childProcess.spawn' "$SOURCE_MAC_LAUNCHER" || fail "direct child_process spawn missing"
grep -Fq '        ""' "$SOURCE_UXP/manifest.json" || fail "UXP executable launch permission missing"
grep -Fq '/Library/Application Support/RYZE/CaptionToolV1/bin/ryze-caption-helper' "$SOURCE_UXP/index.js" || fail "UXP reconnect command path missing"
grep -Fq 'com.ryze.captiontool.v1.macos.pkg' "$MAC_DIR/package/Distribution.xml" || fail "package identifier changed"

for mogrt in RYZE_Box_V3.mogrt RYZE_Box_V5.mogrt RYZE_Stroke_V1.mogrt; do
  need_file "$SOURCE_CEP/assets/mogrts/$mogrt"
done

if [[ -d "$PAYLOAD_UXP" && -d "$PAYLOAD_CEP" ]]; then
  mismatch=0
  while IFS= read -r rel; do
    if [[ ! -f "$PAYLOAD_UXP/$rel" ]] || ! cmp -s "$SOURCE_UXP/$rel" "$PAYLOAD_UXP/$rel"; then
      printf 'UXP payload mismatch: %s\n' "$rel" >&2
      mismatch=1
    fi
  done < <(cd "$SOURCE_UXP" && find . -type f -print | sed 's#^\./##' | LC_ALL=C sort)
  while IFS= read -r rel; do
    rel="${rel#./}"
    [[ -f "$SOURCE_UXP/$rel" ]] || {
      printf 'Unexpected UXP payload file: %s\n' "$rel" >&2
      mismatch=1
    }
  done < <(cd "$PAYLOAD_UXP" && find . -type f -print | LC_ALL=C sort)

  while IFS= read -r rel; do
    if [[ ! -f "$PAYLOAD_CEP/$rel" ]] || ! cmp -s "$SOURCE_CEP/$rel" "$PAYLOAD_CEP/$rel"; then
      printf 'CEP payload mismatch: %s\n' "$rel" >&2
      mismatch=1
    fi
  done < <(cd "$SOURCE_CEP" && find . -type f -print | sed 's#^\./##' | LC_ALL=C sort)
  if [[ ! -f "$PAYLOAD_CEP/helper/macos-launcher.js" ]] || ! cmp -s "$SOURCE_MAC_LAUNCHER" "$PAYLOAD_CEP/helper/macos-launcher.js"; then
    printf 'CEP payload mismatch: helper/macos-launcher.js\n' >&2
    mismatch=1
  fi
  if [[ ! -f "$PAYLOAD_CEP/helper/macos-helper-process.js" ]] || ! cmp -s "$SOURCE_MAC_PROCESS" "$PAYLOAD_CEP/helper/macos-helper-process.js"; then
    printf 'CEP payload mismatch: helper/macos-helper-process.js\n' >&2
    mismatch=1
  fi
  while IFS= read -r rel; do
    rel="${rel#./}"
    if [[ ! -f "$SOURCE_CEP/$rel" && "$rel" != helper/macos-launcher.js && "$rel" != helper/macos-helper-process.js && "$rel" != mimetype && "$rel" != META-INF/* ]]; then
      printf 'Unexpected CEP payload file: %s\n' "$rel" >&2
      mismatch=1
    fi
  done < <(cd "$PAYLOAD_CEP" && find . -type f -print | LC_ALL=C sort)
  [[ $mismatch -eq 0 ]] || fail "payload copies are not source-identical"

  [[ "$(json_string id "$PAYLOAD_UXP/manifest.json")" == "$UXP_ID" ]] || fail "payload UXP ID mismatch"
  [[ "$(xml_attribute ExtensionBundleId "$PAYLOAD_CEP/CSXS/manifest.xml")" == "$CEP_ID" ]] || fail "payload CEP ID mismatch"
else
  fail "payload/UXP and payload/CEP must be prepared by build.sh"
fi

if [[ $SOURCE_ONLY -eq 1 ]]; then
  printf 'VERIFY PASS: mac builder structure, payload equality, IDs, version, config names, and helper protocol match source.\n'
  exit 0
fi

need_file "$PACKAGE_PATH"
[[ "$(basename "$PACKAGE_PATH")" == "RYZE_Caption_Tool_Mac.pkg" ]] || fail "unexpected package filename"
[[ -s "$PACKAGE_PATH" ]] || fail "package is empty"
[[ "$(uname -s)" == "Darwin" ]] || fail "full .pkg inspection requires macOS pkgutil"
command -v pkgutil >/dev/null 2>&1 || fail "pkgutil not found"

EXPAND_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ryze-pkg-verify.XXXXXX")"
cleanup() {
  rm -rf -- "$EXPAND_DIR"
}
trap cleanup EXIT INT TERM

pkgutil --expand-full "$PACKAGE_PATH" "$EXPAND_DIR/expanded"
EXPANDED_CEP_MANIFEST="$(find "$EXPAND_DIR/expanded" -type f -path '*/Payload/Library/Application Support/RYZE/CaptionToolV1/helper/CSXS/manifest.xml' -print | head -n 1)"
EXPANDED_MAC_LAUNCHER="$(find "$EXPAND_DIR/expanded" -type f -path '*/Payload/Library/Application Support/RYZE/CaptionToolV1/helper/helper/macos-launcher.js' -print | head -n 1)"
EXPANDED_MAC_PROCESS="$(find "$EXPAND_DIR/expanded" -type f -path '*/Payload/Library/Application Support/RYZE/CaptionToolV1/helper/helper/macos-helper-process.js' -print | head -n 1)"
EXPANDED_MAC_COMMAND="$(find "$EXPAND_DIR/expanded" -type f -path '*/Payload/Library/Application Support/RYZE/CaptionToolV1/bin/ryze-caption-helper' -print | head -n 1)"
EXPANDED_UXP_PACKAGE="$(find "$EXPAND_DIR/expanded" -type f -path '*/Payload/Library/Application Support/RYZE/CaptionToolV1/packages/RYZE_Caption_Tool.ccx' -print | head -n 1)"
EXPANDED_POSTINSTALL="$(find "$EXPAND_DIR/expanded" -type f -path '*/Scripts/postinstall' -print | head -n 1)"
EXPANDED_PACKAGE_INFO="$(find "$EXPAND_DIR/expanded" -type f -name PackageInfo -print | head -n 1)"

need_file "$EXPANDED_CEP_MANIFEST"
need_file "$EXPANDED_MAC_LAUNCHER"
need_file "$EXPANDED_MAC_PROCESS"
need_file "$EXPANDED_MAC_COMMAND"
need_file "$EXPANDED_UXP_PACKAGE"
need_file "$EXPANDED_POSTINSTALL"
need_file "$EXPANDED_PACKAGE_INFO"
grep -Fq "identifier=\"com.ryze.captiontool.v1.macos.pkg\"" "$EXPANDED_PACKAGE_INFO" || fail "component package ID mismatch"
grep -Fq "version=\"$UXP_VERSION\"" "$EXPANDED_PACKAGE_INFO" || fail "component package version mismatch"
[[ "$(xml_attribute ExtensionBundleId "$EXPANDED_CEP_MANIFEST")" == "$CEP_ID" ]] || fail "packaged CEP ID mismatch"
cmp -s "$SOURCE_MAC_LAUNCHER" "$EXPANDED_MAC_LAUNCHER" || fail "packaged macOS helper launcher differs from source"
cmp -s "$SOURCE_MAC_PROCESS" "$EXPANDED_MAC_PROCESS" || fail "packaged macOS helper child differs from source"
cmp -s "$SOURCE_MAC_COMMAND" "$EXPANDED_MAC_COMMAND" || fail "packaged macOS reconnect command differs from source"
[[ -x "$EXPANDED_MAC_COMMAND" ]] || fail "packaged macOS reconnect command is not executable"
EXPANDED_BASE="$(dirname "$(dirname "$EXPANDED_MAC_COMMAND")")"
for arch in arm64 x64; do
  binary="$EXPANDED_BASE/runtime/$arch/bin/node"
  need_file "$binary"
  need_file "$EXPANDED_BASE/runtime/$arch/LICENSE"
  [[ -x "$binary" ]] || fail "Node $arch is not executable"
  case "$arch" in arm64) expected=arm64 ;; x64) expected=x86_64 ;; esac
  file "$binary" | grep -q "Mach-O.*$expected" || fail "Wrong architecture for Node $arch"
  codesign --verify --verbose "$binary"
done
native=x64
if [[ "$(sysctl -in hw.optional.arm64 2>/dev/null || true)" == 1 ]]; then native=arm64; fi
[[ "$("$EXPANDED_BASE/runtime/$native/bin/node" --version)" == v22.23.3 ]] || fail "Bundled Node version mismatch"
if [[ "${RYZE_RUNTIME_TEST:-0}" == 1 ]]; then
  "$EXPANDED_BASE/runtime/$native/bin/node" "$PROJECT_ROOT/diagnostics/test-macos-runtime.js"
fi

mkdir -p "$EXPAND_DIR/uxp"
unzip -q "$EXPANDED_UXP_PACKAGE" -d "$EXPAND_DIR/uxp"
need_file "$EXPAND_DIR/uxp/manifest.json"
[[ "$(json_string id "$EXPAND_DIR/uxp/manifest.json")" == "$UXP_ID" ]] || fail "packaged UXP ID mismatch"
[[ "$(json_string version "$EXPAND_DIR/uxp/manifest.json")" == "$UXP_VERSION" ]] || fail "packaged UXP version mismatch"

pkgutil --check-signature "$PACKAGE_PATH" || true
printf 'VERIFY PASS: package exists and contains the expected helper, UXP package, scripts, IDs, and version.\n'
