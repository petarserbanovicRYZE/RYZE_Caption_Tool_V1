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
| UXP starts before CEP listener | Automatic startup uses read-only retries without opening Terminal. Only explicit Reconnect may invoke the helper command. |
| Windows accidentally launches Mac command | Panel regression test covers a Windows executable path; Mac process code is only added by the Mac builder. |
| MOGRT regressions | Original templates, text, layout and parsing algorithms are unchanged. Shared startup/recovery/diagnostics and compatibility guards have changed and are regression-tested. |

## Undo archive follow-up — 2026-10-22

Current revision: `recovery-audit-20261022.1`; public version remains `1.0.7`.

A failed new preparation archives and then retains the previous completed batch.
Read-only Undo checks were changing its host-call and journal timing counters,
causing the next preparation to fail with `Saved history differs`. The earlier
checkpoint-timing fix did not cover these counters.

Undo checks and the final pre-cleanup guard now journal their host responses
without changing the completed checkpoint's measurements. Conversion and cleanup
measurements remain enabled. Archive comparison, clip/sequence ownership guards,
visibility restoration, and timeline mutation logic are unchanged. Existing
divergent archive files are not silently overwritten or cleared by this fix.

The new `diagnostics/test-undo-history.js` failed before the fix and passes after
it. It exercises successful/refused checks in both modes, clip mismatches,
not-ready retries, transport/journal/host-restoration failures, reconnect, and a
subsequent valid preparation. It also verifies that genuine archive differences
still stop before host calls. All 23 JavaScript suites pass locally; real Premiere
and macOS integration still require the acceptance tests below. No new installer
was built or published.

## Recovery and failure-injection pass — 2026-10-21

Build revision: `recovery-audit-20261021.1`; public version remains `1.0.7`.

The supplied installation log records a direct-spawn build in September, then an
older startup flow installed on October 19. The submitted checkpoint has the exact
legacy pre-preparation shape, with no conversion folder or ownership journal.
The old host's exact `26.5.1` guard rejects the reported `26.5.2` host after that
checkpoint is written. Reproducing this path yields the same checkpoint shape
without timeline edits. It is a plausible cause, not proof of the original
exception: that exception and the later helper shutdown were not captured.
The report does not establish an OS incompatibility or a firewall problem.

Changes verified with regression/failure-injection tests:

- Confirmed read-only preparation refusals restore previous host/engine state,
  including completed Undo history. Transport failures still retain the marker.
- The exact legacy preparation-only marker can be archived and abandoned only
  after the active sequence matches its entire baseline, host state is safe, and
  a durable backup succeeds. Actual conversion, hiding, Undo, unknown or changed
  sessions remain blocked. No automatic deletion of `session.json` or timeline
  edits are used for this repair.
- Invalid/unreadable checkpoints keep diagnostics available but block mutations
  and never overwrite the original. Status discovery is now read-only.
- Terminal checkpoint timing no longer alters archived completed-record identity
  after a rejected attempt, avoiding a repeat-attempt `Saved history differs` lock.
- HTTP child health checks skip active engine commands, tolerate brief idle
  failures, and exit nonzero on sustained bridge loss to request a bounded restart.
  Spawn errors and thrown startup failures also use bounded retries.
- Response-body reads now share the HTTP timeout; command retry retains the same
  identity. Mixed panel/helper revisions are refused clearly. Reports retain
  startup diagnostics, record revision/host/platform, and fit the transport limit.
- Installer registration verifies an enabled exact name/version in a supported
  Premiere section, not unrelated words anywhere in UPIA output. Receipt JSON
  safely escapes paths and records revision. Future version downgrades are refused.
- Installer failures restore pairing/runtime/receipt backups and the previous CEP
  copy where possible. Failed backups are retained for investigation. User data is
  no longer recursively chowned. Symlink destinations are rejected before writes.
- Fresh per-user RYZE/Adobe parent folders are created as the signed-in user, so
  private permissions do not strand them behind root-owned parent directories.
  Failed rollback copies are reported as failures rather than successful restores.
- A failed package build retains the previous good output. Full package inspection
  compares every application file and installer support script with source. The
  Actions artifact includes `BUILD_INFO.json` with commit, revision, run URL and
  package SHA-256 so identically named old downloads can be distinguished.
- CI runs all discovered JavaScript suites, Windows installer repair fixtures,
  and the real Darwin process/socket suite before publishing an artifact.

Local evidence: 22 JavaScript suites, source/template validation, two PowerShell
installer suites (11 isolated repair scenarios), Bash syntax, YAML parsing,
macOS source/payload consistency and unchanged Windows installer pre-audit hashes.
These tests use mock Adobe APIs. No new `.pkg`, deployment, signing, or real
Premiere integration test was performed on this Windows workstation.

The current Mac requires a rebuilt package from this revision. Reinstalling an
older downloaded `1.0.7` package will not include these fixes. For the preparation
repair, open the original unchanged sequence and reconnect after installing the
new package; if it refuses, save diagnostics rather than deleting saved state.

The GitHub workflow builds on `macos-latest`, expands the actual package, checks
its binaries, and runs `diagnostics/test-macos-runtime.js` with the packaged native
Node. That test uses real Unix sockets, detached processes, and the production
HTTP factory; its engine is a fixture because GitHub runners lack Premiere.

## Checks that still require a teammate Mac

1. Install over the prior RYZE build with Premiere closed; verify UPIA registers
   the same UXP ID and that the pairing token remains unchanged.
2. Open an eligible Premiere version (25.6+; test each target version), load the panel,
   and confirm the report records a reachable port and a PID. Test a second launch
   after quitting Premiere, then Reconnect. Adobe's command-launch permission may
   prompt the user.
3. Convert with V3, V5, and Stroke, then Undo; repeat with overlapping captions,
   a saved/reopened project, and a project path containing non-ASCII characters.
4. Verify Adobe CEP lifecycle and permission prompts on Intel and Apple Silicon.
   Hosted Node tests cannot establish that Premiere loads the hidden CEP engine.
5. Exercise UPIA reinstall/failure behavior. Installer preserves prior CEP and
   per-user config, but Adobe UPIA and macOS Installer are separate transactions.
   The system payload/Adobe registry cannot be rolled back atomically by this
   script; interrupted UPIA or receipt-write failure still requires reinstalling.

Apple signing, notarization, and public CEP signing remain release prerequisites.
Unsigned internal builds can still encounter Gatekeeper prompts. This audit does
not disable Gatekeeper, change macOS privacy settings, or claim a successful Premiere
integration test. The later cross-platform compatibility update replaces the 26.5.1
gate with a 25.6 minimum and capability checks; see [COMPATIBILITY.md](../COMPATIBILITY.md).

References: [Adobe CEP 12 cookbook](https://github.com/Adobe-CEP/CEP-Resources/blob/master/CEP_12.x/Documentation/CEP%2012%20HTML%20Extension%20Cookbook.md),
[Node distribution checksums](https://nodejs.org/dist/v22.23.3/SHASUMS256.txt).
