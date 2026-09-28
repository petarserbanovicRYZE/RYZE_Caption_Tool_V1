#!/usr/bin/env bash
set -euo pipefail

umask 022
export COPYFILE_DISABLE=1

MAC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$MAC_DIR/.." && pwd)"
SOURCE_UXP="$PROJECT_ROOT/uxp"
SOURCE_CEP="$PROJECT_ROOT/cep"
SOURCE_MAC_LAUNCHER="$PROJECT_ROOT/helper/macos-launcher.js"
SOURCE_MAC_PROCESS="$PROJECT_ROOT/helper/macos-helper-process.js"
SOURCE_MAC_COMMAND="$PROJECT_ROOT/helper/launch-mac-helper"
PAYLOAD_UXP="$MAC_DIR/payload/UXP"
PAYLOAD_CEP="$MAC_DIR/payload/CEP"
PAYLOAD_HELPER="$MAC_DIR/payload/helper"
OUTPUT_DIR="$MAC_DIR/output"
FINAL_PKG="$OUTPUT_DIR/RYZE_Caption_Tool_Mac.pkg"
PACKAGE_IDENTIFIER="com.ryze.captiontool.v1.macos.pkg"
COMPONENT_NAME="RYZE_Caption_Tool_Mac_Component.pkg"
PREPARE_ONLY=0

if [[ "${1:-}" == "--prepare-only" ]]; then
  PREPARE_ONLY=1
elif [[ $# -gt 0 ]]; then
  printf 'Usage: %s [--prepare-only]\n' "$0" >&2
  exit 2
fi

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

note() {
  printf '%s\n' "$*"
}

need_file() {
  [[ -f "$1" ]] || fail "$2 not found: $1"
}

need_dir() {
  [[ -d "$1" ]] || fail "$2 not found: $1"
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

json_string() {
  local key="$1" file="$2"
  sed -nE "s/^[[:space:]]*\"${key}\"[[:space:]]*:[[:space:]]*\"([^\"]+)\".*/\\1/p" "$file" | head -n 1
}

xml_attribute() {
  local attribute="$1" file="$2"
  sed -nE "s/.*[[:space:]]${attribute}=\"([^\"]+)\".*/\\1/p" "$file" | head -n 1
}

# Check Apple-only tooling before changing or staging any payload during a full
# build. --prepare-only deliberately remains portable for Docker preflight.
if [[ $PREPARE_ONLY -eq 0 ]]; then
  [[ "$(uname -s)" == "Darwin" ]] || fail "A real .pkg must be built on macOS; use --prepare-only on Linux/Docker"
  need_command pkgbuild
  need_command productbuild
  need_command pkgutil
fi

need_command sed
need_command cp
need_command find
need_command cmp
need_command file
need_command zip
need_command unzip

need_dir "$MAC_DIR/payload" "macOS payload directory"
need_dir "$PAYLOAD_UXP" "UXP payload directory"
need_dir "$PAYLOAD_CEP" "CEP payload directory"
need_dir "$PAYLOAD_HELPER" "helper payload directory"
need_dir "$MAC_DIR/package/scripts" "package scripts directory"
need_file "$SOURCE_UXP/manifest.json" "UXP manifest"
need_file "$SOURCE_UXP/installer-config.json" "UXP pairing placeholder"
need_file "$SOURCE_CEP/CSXS/manifest.xml" "CEP manifest"
need_file "$SOURCE_CEP/bridge.js" "CEP helper entry point"
need_file "$SOURCE_CEP/server.js" "CEP loopback service"
need_file "$SOURCE_MAC_LAUNCHER" "macOS helper launcher"
need_file "$SOURCE_MAC_PROCESS" "macOS helper child process"
need_file "$SOURCE_MAC_COMMAND" "macOS helper launch command"
need_file "$SOURCE_CEP/assets/mogrts/RYZE_Box_V3.mogrt" "V3 MOGRT"
need_file "$SOURCE_CEP/assets/mogrts/RYZE_Box_V5.mogrt" "V5 MOGRT"
need_file "$SOURCE_CEP/assets/mogrts/RYZE_Stroke_V1.mogrt" "Stroke MOGRT"
need_file "$MAC_DIR/package/Distribution.xml" "Distribution template"
need_file "$MAC_DIR/package/scripts/preinstall" "preinstall script"
need_file "$MAC_DIR/package/scripts/postinstall" "postinstall script"
need_file "$PAYLOAD_HELPER/helper-info.json" "helper metadata"

UXP_ID="$(json_string id "$SOURCE_UXP/manifest.json")"
VERSION="$(json_string version "$SOURCE_UXP/manifest.json")"
CEP_ID="$(xml_attribute ExtensionBundleId "$SOURCE_CEP/CSXS/manifest.xml")"
CEP_VERSION="$(xml_attribute ExtensionBundleVersion "$SOURCE_CEP/CSXS/manifest.xml")"

[[ "$UXP_ID" == "com.ryze.captiontool.v1.uxp" ]] || fail "Unexpected UXP ID: $UXP_ID"
[[ "$CEP_ID" == "com.ryze.captiontool.v1.bridge" ]] || fail "Unexpected CEP ID: $CEP_ID"
[[ "$VERSION" == "$CEP_VERSION" ]] || fail "UXP/CEP version mismatch: $VERSION vs $CEP_VERSION"
grep -Eq '"build"[[:space:]]*:[[:space:]]*"1\.0\.7"' "$SOURCE_UXP/installer-config.json" || fail "Pairing build does not match V1.0.7"
grep -Eq '"port"[[:space:]]*:[[:space:]]*48771' "$SOURCE_UXP/installer-config.json" || fail "Pairing port is not 48771"
grep -Eq '"token"[[:space:]]*:[[:space:]]*null' "$SOURCE_UXP/installer-config.json" || fail "Shared pairing token must remain null"
grep -Fq '127.0.0.1:48771' "$SOURCE_UXP/index.js" || fail "UXP loopback endpoint changed"
grep -Fq "server.listen(48771,'127.0.0.1')" "$SOURCE_CEP/server.js" || fail "CEP loopback listener changed"
grep -Fq "env.APPDATA" "$SOURCE_CEP/bridge.js" || fail "Windows config discovery was removed"
grep -Fq "'Library','Application Support'" "$SOURCE_CEP/bridge.js" || fail "macOS config discovery is missing"
grep -Fq "helper','macos-launcher.js" "$SOURCE_CEP/bridge.js" || fail "CEP does not load the macOS helper launcher"
grep -Fq 'HELPER_PORT_LISTENING' "$SOURCE_MAC_PROCESS" || fail "macOS child listening diagnostic is missing"
grep -Fq 'childProcess.spawn' "$SOURCE_MAC_LAUNCHER" || fail "macOS helper does not use direct child_process spawning"
grep -Fq '        ""' "$SOURCE_UXP/manifest.json" || fail "UXP executable launch permission is missing"

HELPER_UXP_ID="$(json_string uxpId "$PAYLOAD_HELPER/helper-info.json")"
HELPER_CEP_ID="$(json_string cepBundleId "$PAYLOAD_HELPER/helper-info.json")"
HELPER_VERSION="$(json_string version "$PAYLOAD_HELPER/helper-info.json")"
[[ "$HELPER_UXP_ID" == "$UXP_ID" ]] || fail "helper-info UXP ID mismatch"
[[ "$HELPER_CEP_ID" == "$CEP_ID" ]] || fail "helper-info CEP ID mismatch"
[[ "$HELPER_VERSION" == "$VERSION" ]] || fail "helper-info version mismatch"

mkdir -p "$OUTPUT_DIR"

sync_tree() {
  local source="$1" destination="$2"
  case "$destination" in
    "$MAC_DIR"/payload/UXP|"$MAC_DIR"/payload/CEP) ;;
    *) fail "Refusing to refresh unexpected payload path: $destination" ;;
  esac
  rm -rf -- "$destination"
  mkdir -p "$destination"
  cp -R "$source/." "$destination/"
}

verify_cep_source_equality() {
  local candidate="$1" rel mismatch=0
  while IFS= read -r rel; do
    if [[ ! -f "$candidate/$rel" ]] || ! cmp -s "$MAC_CEP_SOURCE/$rel" "$candidate/$rel"; then
      printf 'CEP payload differs from source: %s\n' "$rel" >&2
      mismatch=1
    fi
  done < <(cd "$MAC_CEP_SOURCE" && find . -type f -print | sed 's#^\./##' | LC_ALL=C sort)
  [[ $mismatch -eq 0 ]] || fail "CEP payload source verification failed"

  while IFS= read -r rel; do
    rel="${rel#./}"
    if [[ ! -f "$MAC_CEP_SOURCE/$rel" && "$rel" != mimetype && "$rel" != META-INF/* ]]; then
      fail "Unexpected file in signed CEP payload: $rel"
    fi
  done < <(cd "$candidate" && find . -type f -print | LC_ALL=C sort)
}

WORK_DIR="$(mktemp -d "$MAC_DIR/.build.XXXXXX")"
cleanup() {
  rm -rf -- "$WORK_DIR"
}
trap cleanup EXIT INT TERM

MAC_CEP_SOURCE="$WORK_DIR/cep-source"
mkdir -p "$MAC_CEP_SOURCE/helper"
cp -R "$SOURCE_CEP/." "$MAC_CEP_SOURCE/"
cp "$SOURCE_MAC_LAUNCHER" "$MAC_CEP_SOURCE/helper/macos-launcher.js"
cp "$SOURCE_MAC_PROCESS" "$MAC_CEP_SOURCE/helper/macos-helper-process.js"

sync_tree "$SOURCE_UXP" "$PAYLOAD_UXP"

CEP_MODE="unsigned source (internal testing)"
CEP_CONFIG_COUNT=0
[[ -n "${CEP_SIGN_TOOL:-}" ]] && CEP_CONFIG_COUNT=$((CEP_CONFIG_COUNT + 1))
[[ -n "${CEP_CERTIFICATE:-}" ]] && CEP_CONFIG_COUNT=$((CEP_CONFIG_COUNT + 1))
[[ -n "${CEP_CERT_PASSWORD:-}" ]] && CEP_CONFIG_COUNT=$((CEP_CONFIG_COUNT + 1))

if [[ $CEP_CONFIG_COUNT -ne 0 && $CEP_CONFIG_COUNT -ne 3 ]]; then
  fail "CEP signing requires CEP_SIGN_TOOL, CEP_CERTIFICATE, and CEP_CERT_PASSWORD together"
fi

CEP_INPUT_MODES=0
[[ $CEP_CONFIG_COUNT -eq 3 ]] && CEP_INPUT_MODES=$((CEP_INPUT_MODES + 1))
[[ -n "${CEP_ZXP_FILE:-}" ]] && CEP_INPUT_MODES=$((CEP_INPUT_MODES + 1))
[[ -n "${CEP_SIGNED_SOURCE:-}" ]] && CEP_INPUT_MODES=$((CEP_INPUT_MODES + 1))
[[ $CEP_INPUT_MODES -le 1 ]] || fail "Choose only one CEP signing input mode"

if [[ $CEP_CONFIG_COUNT -eq 3 ]]; then
  need_file "$CEP_SIGN_TOOL" "CEP ZXPSignCmd"
  need_file "$CEP_CERTIFICATE" "CEP signing certificate"
  SIGNED_ZXP="$WORK_DIR/RYZE_Caption_Tool_Helper.zxp"
  "$CEP_SIGN_TOOL" -sign "$MAC_CEP_SOURCE" "$SIGNED_ZXP" "$CEP_CERTIFICATE" "$CEP_CERT_PASSWORD" -tsa "${CEP_TIMESTAMP_URL:-http://timestamp.digicert.com/}"
  "$CEP_SIGN_TOOL" -verify "$SIGNED_ZXP"
  rm -rf -- "$PAYLOAD_CEP"
  mkdir -p "$PAYLOAD_CEP"
  unzip -q "$SIGNED_ZXP" -d "$PAYLOAD_CEP"
  CEP_MODE="signed with ZXPSignCmd"
elif [[ -n "${CEP_ZXP_FILE:-}" ]]; then
  need_file "$CEP_ZXP_FILE" "pre-signed CEP ZXP"
  rm -rf -- "$PAYLOAD_CEP"
  mkdir -p "$PAYLOAD_CEP"
  unzip -q "$CEP_ZXP_FILE" -d "$PAYLOAD_CEP"
  CEP_MODE="pre-signed ZXP"
elif [[ -n "${CEP_SIGNED_SOURCE:-}" ]]; then
  [[ -d "$CEP_SIGNED_SOURCE" ]] || fail "Pre-signed CEP folder not found: $CEP_SIGNED_SOURCE"
  sync_tree "$CEP_SIGNED_SOURCE" "$PAYLOAD_CEP"
  CEP_MODE="pre-signed extracted CEP"
else
  sync_tree "$MAC_CEP_SOURCE" "$PAYLOAD_CEP"
fi

verify_cep_source_equality "$PAYLOAD_CEP"
if [[ "$CEP_MODE" != "unsigned source (internal testing)" ]]; then
  need_file "$PAYLOAD_CEP/META-INF/signatures.xml" "CEP signature"
elif [[ "${RYZE_REQUIRE_SIGNED_CEP:-0}" == "1" ]]; then
  fail "RYZE_REQUIRE_SIGNED_CEP=1 but no signed CEP input was provided"
fi

UXP_CCX="$WORK_DIR/RYZE_Caption_Tool.ccx"
(cd "$PAYLOAD_UXP" && zip -X -q -r "$UXP_CCX" . -x '*/.DS_Store')
need_file "$UXP_CCX" "generated UXP CCX"

STAGE_ROOT="$WORK_DIR/root"
INSTALL_BASE="$STAGE_ROOT/Library/Application Support/RYZE/CaptionToolV1"
mkdir -p "$INSTALL_BASE/helper" "$INSTALL_BASE/bin" "$INSTALL_BASE/packages" "$INSTALL_BASE/metadata"
cp -R "$PAYLOAD_CEP/." "$INSTALL_BASE/helper/"
cp "$SOURCE_MAC_COMMAND" "$INSTALL_BASE/bin/ryze-caption-helper"
cp "$UXP_CCX" "$INSTALL_BASE/packages/RYZE_Caption_Tool.ccx"
cp "$PAYLOAD_HELPER/helper-info.json" "$INSTALL_BASE/metadata/helper-info.json"

find "$STAGE_ROOT" -type d -exec chmod 0755 {} +
find "$STAGE_ROOT" -type f -exec chmod 0644 {} +
chmod 0755 "$INSTALL_BASE/bin/ryze-caption-helper"

if [[ $PREPARE_ONLY -eq 0 ]]; then
  bash "$MAC_DIR/bundle-node.sh" "$INSTALL_BASE/runtime"
fi

# Preserve executable mode for any real native helper added in a later release.
while IFS= read -r -d '' binary; do
  if file -b "$binary" | grep -q 'Mach-O'; then
    chmod 0755 "$binary"
  fi
done < <(find "$INSTALL_BASE/helper" -type f -print0)

if [[ -n "${APPLICATION_SIGNING_IDENTITY:-}" ]]; then
  [[ "$(uname -s)" == "Darwin" ]] || fail "Developer ID Application signing is available only on macOS"
  need_command codesign
  need_command security
  security find-identity -v -p codesigning | grep -Fq "\"$APPLICATION_SIGNING_IDENTITY\"" || fail "Application signing identity not found: $APPLICATION_SIGNING_IDENTITY"
  SIGNED_APPLICATION_TARGETS=0
  while IFS= read -r -d '' binary; do
    if file -b "$binary" | grep -q 'Mach-O'; then
      codesign --force --preserve-metadata=entitlements --options runtime --timestamp --sign "$APPLICATION_SIGNING_IDENTITY" "$binary"
      SIGNED_APPLICATION_TARGETS=$((SIGNED_APPLICATION_TARGETS + 1))
    fi
  done < <(find "$INSTALL_BASE" -type f -print0)
  while IFS= read -r app; do
    [[ -n "$app" ]] || continue
    codesign --force --deep --options runtime --timestamp --sign "$APPLICATION_SIGNING_IDENTITY" "$app"
    SIGNED_APPLICATION_TARGETS=$((SIGNED_APPLICATION_TARGETS + 1))
  done < <(find "$INSTALL_BASE/helper" -type d -name '*.app' -print | LC_ALL=C sort -r)
  if [[ $SIGNED_APPLICATION_TARGETS -eq 0 ]]; then
    note "Developer ID Application identity supplied, but the current helper is JavaScript/CEP and has no native Mach-O target to sign."
  fi
fi

note "Prepared macOS payload: UXP $UXP_ID, CEP $CEP_ID, version $VERSION"
note "CEP payload mode: $CEP_MODE"

if [[ $PREPARE_ONLY -eq 1 ]]; then
  note "Preparation complete. pkgbuild/productbuild were intentionally not invoked."
  note "Linux Docker can validate and prepare this payload, but only macOS can produce the .pkg."
  "$MAC_DIR/verify-mac-build.sh" --source-only
  exit 0
fi

chmod 0755 "$MAC_DIR/package/scripts/preinstall" "$MAC_DIR/package/scripts/postinstall"

COMPONENT_PKG="$WORK_DIR/$COMPONENT_NAME"
pkgbuild \
  --root "$STAGE_ROOT" \
  --scripts "$MAC_DIR/package/scripts" \
  --identifier "$PACKAGE_IDENTIFIER" \
  --version "$VERSION" \
  --install-location / \
  "$COMPONENT_PKG"

RESOLVED_DISTRIBUTION="$WORK_DIR/Distribution.xml"
sed "s/__VERSION__/$VERSION/g" "$MAC_DIR/package/Distribution.xml" > "$RESOLVED_DISTRIBUTION"

rm -f -- "$FINAL_PKG"
if [[ -n "${INSTALLER_SIGNING_IDENTITY:-}" ]]; then
  need_command security
  security find-identity -v | grep -Fq "\"$INSTALLER_SIGNING_IDENTITY\"" || fail "Installer signing identity not found: $INSTALLER_SIGNING_IDENTITY"
  productbuild \
    --distribution "$RESOLVED_DISTRIBUTION" \
    --package-path "$WORK_DIR" \
    --sign "$INSTALLER_SIGNING_IDENTITY" \
    "$FINAL_PKG"
else
  note "No INSTALLER_SIGNING_IDENTITY supplied; building an unsigned internal-testing package."
  productbuild \
    --distribution "$RESOLVED_DISTRIBUTION" \
    --package-path "$WORK_DIR" \
    "$FINAL_PKG"
fi

need_file "$FINAL_PKG" "final package"
"$MAC_DIR/verify-mac-build.sh" "$FINAL_PKG"
note "BUILT: $FINAL_PKG"
