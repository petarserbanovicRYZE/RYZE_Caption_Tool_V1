#!/usr/bin/env bash
set -euo pipefail

# Official, pinned Node distributions. Keep checksums pinned with the version;
# never trust an archive merely because it downloaded successfully.
VERSION=22.23.3
DESTINATION="${1:?Usage: bundle-node.sh /absolute/staging/runtime}"
[[ "$(uname -s)" == Darwin ]] || { echo 'Bundling Node requires a real macOS build host.' >&2; exit 1; }
[[ "$DESTINATION" == /* ]] || { echo 'Runtime destination must be absolute.' >&2; exit 1; }
mkdir -p "$DESTINATION"
for arch in arm64 x64; do
  case "$arch" in
    arm64) checksum=23b25245dcfb9af7262f8ff142e9e2e0af025368117329e7a7458a51e5922f53 ;;
    x64) checksum=8a677b0219178efd6eb0e475457c4afb452b521a92f6e67845a73bd85727f2a8 ;;
  esac
  archive="node-v$VERSION-darwin-$arch.tar.gz"
  curl --fail --location --retry 3 --proto '=https' --tlsv1.2 \
    "https://nodejs.org/dist/v$VERSION/$archive" -o "$DESTINATION/$archive"
  (cd "$DESTINATION" && printf '%s  %s\n' "$checksum" "$archive" | shasum -a 256 -c -)
  tar -xzf "$DESTINATION/$archive" -C "$DESTINATION" \
    "node-v$VERSION-darwin-$arch/bin/node" "node-v$VERSION-darwin-$arch/LICENSE"
  mv "$DESTINATION/node-v$VERSION-darwin-$arch" "$DESTINATION/$arch"
  rm "$DESTINATION/$archive"
  file "$DESTINATION/$arch/bin/node" | grep -q 'Mach-O' || { echo 'Node binary is not Mach-O.' >&2; exit 1; }
  codesign --verify --verbose "$DESTINATION/$arch/bin/node"
done
native=x64
if [[ "$(sysctl -in hw.optional.arm64 2>/dev/null || true)" == 1 ]]; then native=arm64; fi
[[ "$("$DESTINATION/$native/bin/node" --version)" == "v$VERSION" ]]
printf 'Verified real Node %s for Intel and Apple Silicon.\n' "$VERSION"
