#!/usr/bin/env bash
set -euo pipefail

cd /workspace

shellcheck \
  mac-builder/build.sh \
  mac-builder/ci-check.sh \
  mac-builder/verify-mac-build.sh \
  mac-builder/docker-preflight.sh \
  mac-builder/package/scripts/preinstall \
  mac-builder/package/scripts/postinstall

xmllint --noout mac-builder/package/Distribution.xml
bash mac-builder/ci-check.sh
node builder/validate.js

node diagnostics/run-tests.js

bash mac-builder/build.sh --prepare-only

printf '%s\n' 'Docker preflight passed.'
printf '%s\n' 'Apple package/signing/notarization tools are unavailable in Linux; build the final .pkg on macOS.'
