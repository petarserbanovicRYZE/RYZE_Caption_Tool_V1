# Local diagnostics

Run from the builder root:

    node builder/validate.js
    node diagnostics/test-host.js
    node diagnostics/test-fast.js
    node diagnostics/test-transport.js
    node diagnostics/test-integration.js
    node diagnostics/test-checkpoint.js

These exercise the actual JS/JSX with a mock Premiere DOM and an actual localhost
HTTP server. They cover import-then-throw/null ownership, scale/text failures,
strict ownership deletion, fast-read fallback without reimport, single-pass
workflow, visibility failure rollback, idempotent transport and exact-match
completed-checkpoint reattachment/refusal. They DO NOT validate Premiere runtime
APIs, Windows PowerShell, Adobe installation or the Inno compiler.

The unchanged reader/layout/text/match modules and exact bundled MOGRT bytes come
from the runtime-tested 09S package. See RELEASE_STATUS.md for boundaries.


1.0.1: see RELEASE_STATUS.md for fused host calls and per-install UXP pairing.
The shared installer-config.json MUST have token:null; installer changes only
this entry on the recipient PC. Signed CEP is never modified. uxp/connect.js
retries discovery only; conversion/Undo never run from reconnect logic.


1.0.3: outputs[] describes one fresh highest track per populated caption source;
plan cards carry lane indices. Host ownedTracks[] is journaled per verified add;
created clip records include trackIndex. Legacy single-output checkpoints remain
readable for guarded Undo and installer backup. The latest checkpoint is the sole
interactive Undo target. Completed predecessor checkpoints are saved durably under
%APPDATA%/RYZE/CaptionToolV1/history before beginning a new batch. This is not a
multi-level Undo stack. Fresh conversion never uses a previous base snapshot.

1.0.4: workflow stepGroup reduces HTTP/UI updates. engine groups up to three cards
through importBatch; result arrays feed the existing per-card verifier/checkpoint.
The host invokes importSetResult for each card and stops before another import on
fallback or non-exact serialized readback. Bridge invoke wraps known allowlisted
methods with timers, without executing untrusted code or new Premiere APIs.
performance.json category nesting is documented in README_TEAM.txt.

1.0.5: in-flight host-state journalSchema=2 contains baselineFile, full created[]
ownership and current intent, but no duplicated AV snapshots. host-baseline.json
is written once before first import. Successful completion writes the original
full checkpoint shape; no migration/parser change is required for restart Undo.
Do not try restoreCompleted on an in-flight journal. same() compares all measured
fields directly. No measured AV guard was removed or deferred by this release.

1.0.6: groupContext is a local object allocated by importBatch, never serialized
or retained globally. importResult's lighter post-import snapshot is followed by
setClipResult's full AV check. Fallback verifies a full boundary before returning.
Engine exportReport is a separate non-editing dispatch path with no checkpoint
write. UI uses it directly, without replacing workflow session state. report.js
bounds and redacts report text; host creates a unique Desktop TXT. UXP falls back
to getFileForSaving if the helper is unavailable. No permission expansion required.
