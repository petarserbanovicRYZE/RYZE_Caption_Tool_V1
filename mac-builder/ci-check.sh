#!/usr/bin/env bash
set -euo pipefail

MAC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$MAC_DIR/.." && pwd)"

EXPECTED_UXP_ID="com.ryze.captiontool.v1.uxp"
EXPECTED_CEP_ID="com.ryze.captiontool.v1.bridge"

fail() {
  printf 'CI CHECK ERROR: %s\n' "$*" >&2
  exit 1
}

need_dir() {
  [[ -d "$1" ]] || fail "$2 not found: $1"
}

need_file() {
  [[ -f "$1" ]] || fail "$2 not found: $1"
}

json_string() {
  local key="$1" file="$2"
  sed -nE "s/^[[:space:]]*\"${key}\"[[:space:]]*:[[:space:]]*\"([^\"]+)\".*/\\1/p" "$file" | head -n 1
}

xml_bundle_id() {
  sed -nE 's/.*ExtensionBundleId="([^"]+)".*/\1/p' "$1" | head -n 1
}

need_dir "$PROJECT_ROOT/mac-builder" "mac-builder directory"
need_dir "$MAC_DIR/payload" "payload directory"
need_dir "$MAC_DIR/payload/CEP" "CEP payload directory"
need_dir "$MAC_DIR/payload/UXP" "UXP payload directory"
need_dir "$MAC_DIR/payload/helper" "helper payload directory"

need_file "$PROJECT_ROOT/cep/CSXS/manifest.xml" "source CEP manifest"
need_file "$PROJECT_ROOT/cep/bridge.js" "source CEP bridge"
need_file "$PROJECT_ROOT/cep/server.js" "source CEP service"
need_file "$PROJECT_ROOT/helper/macos-launcher.js" "source macOS helper launcher"
need_file "$PROJECT_ROOT/helper/macos-helper-process.js" "source macOS helper child process"
need_file "$PROJECT_ROOT/helper/launch-mac-helper" "source macOS reconnect command"
need_file "$PROJECT_ROOT/uxp/manifest.json" "source UXP manifest"
need_file "$PROJECT_ROOT/uxp/index.js" "source UXP entry point"
need_file "$MAC_DIR/payload/CEP/CSXS/manifest.xml" "payload CEP manifest"
need_file "$MAC_DIR/payload/CEP/bridge.js" "payload CEP bridge"
need_file "$MAC_DIR/payload/CEP/server.js" "payload CEP service"
need_file "$MAC_DIR/payload/UXP/manifest.json" "payload UXP manifest"
need_file "$MAC_DIR/payload/UXP/index.js" "payload UXP entry point"
need_file "$MAC_DIR/payload/helper/helper-info.json" "helper-info.json"
need_file "$MAC_DIR/package/Distribution.xml" "Distribution.xml"
need_file "$MAC_DIR/package/scripts/preinstall" "preinstall script"
need_file "$MAC_DIR/package/scripts/postinstall" "postinstall script"

SOURCE_UXP_ID="$(json_string id "$PROJECT_ROOT/uxp/manifest.json")"
PAYLOAD_UXP_ID="$(json_string id "$MAC_DIR/payload/UXP/manifest.json")"
SOURCE_CEP_ID="$(xml_bundle_id "$PROJECT_ROOT/cep/CSXS/manifest.xml")"
PAYLOAD_CEP_ID="$(xml_bundle_id "$MAC_DIR/payload/CEP/CSXS/manifest.xml")"
HELPER_UXP_ID="$(json_string uxpId "$MAC_DIR/payload/helper/helper-info.json")"
HELPER_CEP_ID="$(json_string cepBundleId "$MAC_DIR/payload/helper/helper-info.json")"

[[ "$SOURCE_UXP_ID" == "$EXPECTED_UXP_ID" ]] || fail "source UXP bundle ID mismatch: ${SOURCE_UXP_ID:-<empty>}"
[[ "$PAYLOAD_UXP_ID" == "$EXPECTED_UXP_ID" ]] || fail "payload UXP bundle ID mismatch: ${PAYLOAD_UXP_ID:-<empty>}"
[[ "$HELPER_UXP_ID" == "$EXPECTED_UXP_ID" ]] || fail "helper UXP bundle ID mismatch: ${HELPER_UXP_ID:-<empty>}"
[[ "$SOURCE_CEP_ID" == "$EXPECTED_CEP_ID" ]] || fail "source CEP bundle ID mismatch: ${SOURCE_CEP_ID:-<empty>}"
[[ "$PAYLOAD_CEP_ID" == "$EXPECTED_CEP_ID" ]] || fail "payload CEP bundle ID mismatch: ${PAYLOAD_CEP_ID:-<empty>}"
[[ "$HELPER_CEP_ID" == "$EXPECTED_CEP_ID" ]] || fail "helper CEP bundle ID mismatch: ${HELPER_CEP_ID:-<empty>}"
grep -Fq 'HELPER_LAUNCH_ATTEMPTED' "$PROJECT_ROOT/helper/macos-launcher.js" || fail "launcher attempt diagnostic missing"
grep -Fq 'HELPER_PROCESS_STARTED' "$PROJECT_ROOT/helper/macos-launcher.js" || fail "launcher process diagnostic missing"
grep -Fq 'HELPER_PORT_LISTENING' "$PROJECT_ROOT/helper/macos-helper-process.js" || fail "child listening diagnostic missing"
grep -Fq 'childProcess.spawn' "$PROJECT_ROOT/helper/macos-launcher.js" || fail "direct child_process spawn missing"
grep -Fq '        ""' "$PROJECT_ROOT/uxp/manifest.json" || fail "UXP executable launch permission missing"

printf 'CI CHECK PASSED: UXP=%s CEP=%s\n' "$EXPECTED_UXP_ID" "$EXPECTED_CEP_ID"
