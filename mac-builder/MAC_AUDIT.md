# Mac runtime and installer audit

This audit covers the V1.0.7 Mac distribution path. It is not a claim that every
possible Premiere or macOS issue has been eliminated. No numeric failure
probabilities can be established without usage data from real Macs.

| Failure path | Resolution / evidence |
| --- | --- |
| Clean Mac has no Node, Homebrew, or shell PATH setup | Package includes official, checksum-pinned Node 22.23.3 for Intel and Apple Silicon, with upstream signatures and licenses. Installer executes the selected binary. |
| Intel/Apple Silicon mismatch, including a Rosetta installer | Hardware capability selects arm64 on Apple Silicon. Package verification inspects both architectures and executes native Node. |
| Separate processes use different TMPDIR values | Bridge uses a stable short socket path in a per-user 0700 directory under `/tmp`; socket permissions are 0600. |
| Duplicate CEP starts unlink a working socket | Live owner is probed and retained; only a refused, stale socket is removed. Real Mac lifecycle test covers duplicate owner shutdown. |
| CEP crashes and leaves a socket | New owner probes and removes a stale socket. Real Mac test terminates the owner with SIGKILL. |
| Reconnect repeatedly launches duplicate HTTP servers | Authenticated Mac health endpoint identifies the owning engine generation; redundant child exits. An unrelated port owner is never terminated. |
| HTTP child crashes | CEP retries child startup up to three times with backoff. Each child receives a new HTTP epoch; old requests are rejected. |
| CEP reload changes engine while old HTTP child survives | Generation pins each child to its original engine. Stale-generation dispatch is rejected and the old child exits. |
| Saved conversion/Undo state appears idle after restart | Initial bridge handshake reads the actual engine state before opening the port. |
| Client timeout permits overlapping engine mutations | Bridge serializes commands independently of HTTP clients; in-flight dispatch is not abandoned on a timer. Existing HTTP request-ID deduplication is retained. |
| Premiere closes while child remains detached | Health monitoring ends the child when the engine disappears; shutdown has a bounded fallback. |
| Unsigned CEP silently fails to load on a clean test Mac | Internal unsigned installer enables Adobe's CEP 12 PlayerDebugMode for the installing user. This is a user-wide CEP preference; signed CEP packages leave it alone. |
| Home folder contains spaces | Home directory parsing preserves spaces. Runtime process tests use paths containing spaces. |
| CEP copy fails midway during upgrade | Partial target is marked before copying, so rollback can remove it and restore the prior CEP copy. |
| Installer changes other Adobe extensions' ownership | Recursive ownership change is limited to the RYZE target, not the whole Adobe CEP tree. |
| Missing Creative Cloud / UPIA | Preinstall checks before system payload installation. UXP continues to use Adobe UPIA registration. |
| Installer runs while versioned Premiere process is open | Preinstall checks the actual Premiere app executable path as well as the legacy process name. |
| Installation targets a different macOS volume | Preinstall refuses a non-running target volume. Per-user registration requires a logged-in desktop session. |
| UXP starts before CEP listener | Existing read-only retries remain; Mac startup can invoke the helper command. Reconnect retains user-initiated retry. |
| Windows accidentally launches Mac command | Panel regression test covers a Windows executable path; Mac process code is only added by the Mac builder. |
| MOGRT/engine regressions | Shared engine, HTTP factory, JSX, and original MOGRT files are unchanged by this audit. Existing regression suite and template hashes are checked. |

The GitHub workflow builds on `macos-latest`, expands the actual package, checks
its binaries, and runs `diagnostics/test-macos-runtime.js` with the packaged native
Node. That test uses real Unix sockets, detached processes, and the production
HTTP factory; its engine is a fixture because GitHub runners lack Premiere.

## Checks that still require a teammate Mac

1. Install over the prior RYZE build with Premiere closed; verify UPIA registers
   the same UXP ID and that the pairing token remains unchanged.
2. Open the supported Premiere version (V1 currently gates 26.5.1), load the panel,
   and confirm the report records a reachable port and a PID. Test a second launch
   after quitting Premiere, then Reconnect. Adobe's command-launch permission may
   prompt the user.
3. Convert with V3, V5, and Stroke, then Undo; repeat with overlapping captions,
   a saved/reopened project, and a project path containing non-ASCII characters.
4. Verify Adobe CEP lifecycle and permission prompts on Intel and Apple Silicon.
   Hosted Node tests cannot establish that Premiere loads the hidden CEP engine.
5. Exercise UPIA reinstall/failure behavior. Installer preserves the previous CEP
   copy, but Adobe UPIA and macOS Installer are separate transactions; an interrupted
   UPIA operation may require reinstalling the package.

Apple signing, notarization, and public CEP signing remain release prerequisites.
Unsigned internal builds can still encounter Gatekeeper prompts. This audit does
not disable Gatekeeper, change macOS privacy settings, widen the supported Premiere
version range, or claim a successful Premiere integration test.

References: [Adobe CEP 12 cookbook](https://github.com/Adobe-CEP/CEP-Resources/blob/master/CEP_12.x/Documentation/CEP%2012%20HTML%20Extension%20Cookbook.md),
[Node distribution checksums](https://nodejs.org/dist/v22.23.3/SHASUMS256.txt).
