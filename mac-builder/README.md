# RYZE Caption Tool V1 — macOS builder

This is a separate macOS packaging path for the existing RYZE Caption Tool V1. It does not call or modify `BUILD.cmd`, `builder/Build.ps1`, Inno Setup, or the Windows installer scripts.

The macOS helper uses two cooperating parts. CEP retains the existing conversion engine because it calls Premiere ExtendScript. `helper/macos-launcher.js` creates a private per-user Unix-socket bridge and uses Node `child_process.spawn` to start `helper/macos-helper-process.js`, which owns the authenticated loopback service on `127.0.0.1:48771`. No LaunchAgent or LaunchDaemon is installed.

## Requirements

Build the final package on macOS with:

- macOS on Intel or Apple Silicon.
- Xcode Command Line Tools, providing `pkgbuild`, `productbuild`, `pkgutil`, `codesign`, and `security`.
- The standard macOS `zip`, `unzip`, `openssl`, `sed`, and shell tools.
- Adobe Creative Cloud Desktop on the target Mac. Its Unified Plugin Installer Agent (UPIA) is required during installation.
- Internet access on the build runner to download the official Node.js 22.23.3 distributions. SHA-256 checksums and upstream code signatures are verified. Intel and Apple Silicon runtimes and their license files are included in the package; teammates do not install Node separately.
- Premiere Pro 26.5.1 for the V1 runtime that the extension currently gates and has been tested against.
- Optional: a current macOS `ZXPSignCmd`, CEP `.p12`, and password for a production-loadable signed CEP payload.
- Optional: Apple `Developer ID Installer` and `Developer ID Application` identities in the build Mac keychain.

The package installs system-owned helper material under `/Library/Application Support/RYZE`, so macOS administrator authorization is required by Installer. CEP and UXP are installed for the desktop user who is signed in when Installer runs. No elevated runtime service is created.

## Build

From the project root:

```bash
chmod +x mac-builder/build.sh mac-builder/verify-mac-build.sh
chmod +x mac-builder/package/scripts/preinstall mac-builder/package/scripts/postinstall
./mac-builder/build.sh
```

The result is:

```text
mac-builder/output/RYZE_Caption_Tool_Mac.pkg
```

Every run validates the current source IDs, version, port, pairing placeholder, MOGRT presence, and macOS config fallback. It then refreshes `payload/UXP` and `payload/CEP` from the authoritative `uxp/` and `cep/` source folders. This avoids maintaining a divergent application copy.

The Mac CEP payload also includes the authoritative `helper/macos-launcher.js` and `helper/macos-helper-process.js`. The package installs the reconnect command at `/Library/Application Support/RYZE/CaptionToolV1/bin/ryze-caption-helper`. The ordinary Windows build still packages `cep/` directly, so it does not include or invoke any of these Mac-only files.

## Building Mac installer without owning a Mac

The repository includes `.github/workflows/mac-build.yml`, which builds the real package on GitHub's `macos-latest` hosted runner. It does not use Docker and does not manufacture a package on Linux.

1. Push the complete repository to GitHub, including `.github/`, `mac-builder/`, `uxp/`, and `cep/`.
2. Open the repository's **Actions** tab.
3. Select **Mac Build**.
4. Choose **Run workflow** and wait for `Build unsigned macOS installer` to finish.
5. Open the completed workflow run and download the `RYZE_Caption_Tool_Mac` artifact.
6. Extract the artifact to obtain `RYZE_Caption_Tool_Mac.pkg`.

The workflow verifies that it is running on Darwin and that `pkgbuild` and `productbuild` are present. It runs `mac-builder/ci-check.sh`, builds the package, expands and verifies its contents through `verify-mac-build.sh`, and uploads only the resulting real macOS package. No Apple certificate is required for this unsigned internal-testing build.

The existing environment variables remain the signing placeholders for a future certificate-enabled GitHub workflow:

- `INSTALLER_SIGNING_IDENTITY` — `Developer ID Installer` identity installed in the runner keychain.
- `APPLICATION_SIGNING_IDENTITY` — `Developer ID Application` identity for signing the bundled native runtimes, preserving their V8 entitlements.
- Notarization — run `xcrun notarytool` and `xcrun stapler` after signing, using credentials imported from encrypted GitHub Actions secrets.

Do not set signing identity variables until the corresponding certificate and private key have been securely imported into the temporary runner keychain. The default workflow intentionally leaves all signing and notarization inputs unset.

With no certificates or signed CEP input, the command builds an unsigned package containing an unsigned CEP folder for internal testing. The installer enables `PlayerDebugMode=1` in the signed-in user's `com.adobe.CSXS.12` preferences, as documented by Adobe. This permits unsigned CEP 12 extensions for that user, including extensions other than RYZE. A signed CEP package does not change this preference. Public distribution requires valid CEP signing and Apple signing/notarization. To disable internal test loading later, run `defaults delete com.adobe.CSXS.12 PlayerDebugMode` and restart Premiere; an unsigned RYZE bridge will then no longer load.

To require a signed CEP and stop instead of producing an internal payload:

```bash
export RYZE_REQUIRE_SIGNED_CEP=1
```

Provide one of these CEP inputs:

```bash
# Sign current CEP source during this build.
export CEP_SIGN_TOOL="/path/to/ZXPSignCmd"
export CEP_CERTIFICATE="/secure/path/ryze-cep-signing.p12"
read -s CEP_CERT_PASSWORD
export CEP_CERT_PASSWORD

# Or use a pre-signed ZXP whose extension files exactly match current source.
export CEP_ZXP_FILE="/secure/path/RYZE_Caption_Tool_Helper.zxp"

# Or use an extracted, pre-signed CEP folder that includes META-INF/signatures.xml.
export CEP_SIGNED_SOURCE="/secure/path/signed-cep"
```

Do not set more than one signed-input mode. Signed inputs are compared byte-for-byte with current CEP source; only `META-INF/*` and the ZXP `mimetype` marker may be additional files.

## Apple signing

The final installer can be signed by setting its exact keychain identity:

```bash
export INSTALLER_SIGNING_IDENTITY="Developer ID Installer: Company Name (TEAMID)"
./mac-builder/build.sh
```

`Developer ID Application` support is reserved for real native helper content:

```bash
export APPLICATION_SIGNING_IDENTITY="Developer ID Application: Company Name (TEAMID)"
./mac-builder/build.sh
```

The helper remains JavaScript plus a shell reconnect command. Its bundled Node runtimes are real upstream-signed Mach-O executables. Without your own certificate, their existing signatures are verified and preserved. With `APPLICATION_SIGNING_IDENTITY`, the builder signs these executables before `pkgbuild`, preserving their entitlements. End-to-end notarization still requires testing with your Apple certificates.

For public distribution, sign first and then notarize/staple using your Apple account or a keychain profile, for example:

```bash
xcrun notarytool submit mac-builder/output/RYZE_Caption_Tool_Mac.pkg \
  --keychain-profile "RYZE_NOTARY" --wait
xcrun stapler staple mac-builder/output/RYZE_Caption_Tool_Mac.pkg
xcrun stapler validate mac-builder/output/RYZE_Caption_Tool_Mac.pkg
```

Notarization credentials are intentionally not stored in this project.

## Install

Save the Premiere project and close Premiere. Then double-click the package, or run:

```bash
sudo /usr/sbin/installer \
  -pkg mac-builder/output/RYZE_Caption_Tool_Mac.pkg \
  -target /
```

The installer refuses to continue while Premiere is running or when no normal desktop user is signed in. After success, restart Premiere and open **Window > UXP Plugins > RYZE Caption Tool**.

## Installed locations

- System helper/package source: `/Library/Application Support/RYZE/CaptionToolV1/`
- Reconnect command: `/Library/Application Support/RYZE/CaptionToolV1/bin/ryze-caption-helper`
- CEP helper runtime: `~/Library/Application Support/Adobe/CEP/extensions/com.ryze.captiontool.v1.bridge/`
- Adobe UXP storage base: `~/Library/Application Support/Adobe/UXP/PluginsStorage/`
- RYZE config/session data: `~/Library/Application Support/RYZE/CaptionToolV1/`
- Pairing config: `~/Library/Application Support/RYZE/CaptionToolV1/connection.json`
- Install receipt: `~/Library/Application Support/RYZE/CaptionToolV1/installed-mac.json`
- Recorded Node runtime: `~/Library/Application Support/RYZE/CaptionToolV1/runtime-mac.json`
- Bundled Node: `/Library/Application Support/RYZE/CaptionToolV1/runtime/{arm64,x64}/bin/node`
- Installer log: `~/Library/Application Support/RYZE/CaptionToolV1/installer-mac.log`
- Helper log: the macOS temporary directory, file `RYZE_Caption_Tool_V1_bridge.txt`

The helper log records `HELPER_LAUNCHER_PATH`, `HELPER_LAUNCH_METHOD`, `HELPER_LAUNCH_ATTEMPTED`, `HELPER_PROCESS_STARTED`, and `HELPER_PORT_LISTENING`. The panel also records the reachable port and PID after successful connection. These entries distinguish a missing CEP engine bridge, failed process spawn, and failed port listener without exposing the pairing token.

The engine socket has a stable path in a user-owned `0700` directory under `/tmp`; it does not depend on the environment's `TMPDIR`. A second CEP instance never takes over a live socket. Each engine has a unique generation, and each HTTP helper has a fresh epoch. A CEP restart rejects commands from the previous engine; a child restart rejects commands from the previous HTTP session. Commands stay serialized even if a client disconnects. The bridge restarts a crashed child up to three times, and the child exits when the CEP bridge disappears. This does not remove the existing engine's checkpoint/Undo safeguards.

Opening Premiere loads the hidden CEP engine bridge through the existing manifest lifecycle event. The bridge directly spawns the separate Node HTTP process; it does not try to launch Premiere. If the first connection is not ready, the UXP panel continues its read-only retry loop. The **Reconnect helper** button asks UXP for permission to run the dedicated no-extension reconnect command, then retries `127.0.0.1:48771`. Adobe requires user consent for this `shell.openPath()` action. Windows does not invoke this path.

`server.js` remains a factory module and is not a command-line entry point. Running `node server.js` directly is therefore not a valid helper test. The Mac child entry is `helper/macos-helper-process.js`; `macos-launcher.js` starts it with the Node path recorded by the installer.

UXP is installed through Adobe UPIA instead of guessing Adobe’s private `PluginsStorage` subdirectory structure. UPIA owns registration and final placement; the installer creates the documented base directory and verifies that UPIA lists RYZE Caption Tool `1.0.7` after install.

The token remains a random per-user 64-character hexadecimal value. The UXP CCX is personalized in a temporary user-owned directory, passed to UPIA, and deleted. The signed CEP content is never personalized.

## Verification

On macOS, verify the final flat package and its expanded payload:

```bash
./mac-builder/verify-mac-build.sh
```

The verifier checks the package filename and contents, component package ID/version, source-to-payload equality, UXP and CEP IDs, config names, helper port, startup event, and expected install paths. It verifies both Node architectures and code signatures and executes the native binary. The Actions run also uses the packaged Node to test real Unix sockets, HTTP authentication, duplicate starts, command deduplication, crash recovery, stale-socket recovery, and shutdown. The engine in this test is a fixture: Adobe UPIA, CEP lifecycle, permission prompts, and MOGRT behavior must still be tested inside Premiere on a teammate Mac. It also prints Apple package signature status through `pkgutil`.

For source/payload validation without a `.pkg`:

```bash
./mac-builder/verify-mac-build.sh --source-only
```

## Docker preflight

Docker cannot run Apple’s `pkgbuild`, `productbuild`, `codesign`, `security`, `notarytool`, or `stapler`. The Docker image therefore performs only the portable work: shell/XML checks, payload preparation, CCX creation, source equality checks, and ID/protocol verification. It never creates a fake macOS package or binary.

This builder uses its own Compose project and the dedicated container name `ryze-caption-tool-mac-builder`; it does not attach to or reuse another project’s containers.

```bash
docker compose -f mac-builder/docker-compose.yml \
  -p ryze-caption-tool-mac \
  up --build --abort-on-container-exit --force-recreate
```

The completed/stopped preflight container may be removed later with:

```bash
docker compose -f mac-builder/docker-compose.yml \
  -p ryze-caption-tool-mac down
```

A real `RYZE_Caption_Tool_Mac.pkg` must still be produced, signed, inspected, and runtime-tested on macOS.
