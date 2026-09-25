# RYZE Caption Tool V1.0.6 candidate — 2026-09-24

This is a source + Windows EXE builder deliverable, not a certified production
release. There is no precompiled EXE in this ZIP. No Windows compiler or Premiere
runtime was available in the build workspace.

## Evidence already observed on the user's Premiere 26.5.1

- Native caption reading via an exported active-sequence snapshot.
- Verified new highest track creation/removal.
- V3, V5 and Stroke MOGRT text, duration and intrinsic Motion Scale 80 readback.
- V3 integrated visibility, injected partial-import rollback, and extension Undo.
- 09S fast-path V3 conversion and Undo, including original visibility restoration.
- 68-card measured conversion: baseline 71,699 ms; fast 61,624 ms (14.1% less time).
  This does not establish 50% improvement or performance on other machines.

## Changes in this candidate

Single full conversion per click; three style buttons; no automatic fault or
baseline benchmark. Arbitrary sequence names accepted, saved project required,
exact host version gated, max 500 cards. Existing strict text/timing/scale,
original-track, ownership and non-ripple cleanup guards retained. Request limit
now refuses only new batches so cleanup of an active batch is not blocked by it.

Per-user random local authentication outside signed CEP. Setup injects the
credential into the unsigned UXP CCX only on the recipient PC, then verifies
all other package entries unchanged. The shared CCX contains a null placeholder.
UXP reads its plugin folder, retries read-only helper discovery and verifies
helper build 1.0.1. It no longer uses first-run file-picker pairing. No public network endpoint,
telemetry, hardcoded team token, private certificate or registry-debug changes.
UXP network permission remains `all`, because the explicit loopback manifest
entry failed in this user's runtime; code contacts only 127.0.0.1:48771.

Atomic Node checkpoint after commands, pending-preparation marker, interrupted
session block, completed-batch reattachment only if saved project, sequence,
track/clip IDs and full measured AV snapshot still match, followed by generated
text readback before Undo. Host journal remains the proven diagnostic journal;
this does not implement arbitrary mid-command crash recovery. Any ambiguous
checkpoint/identity stops instead of deleting guessed targets.

## Gates before a team production release

1. Windows builder: ZXPSignCmd sign/verify, CCX/CEP content checks, Inno compilation.
2. Fresh installation and automatic helper start without UDT or CEP debug mode;
   UXP pairing and all three styles through the new UI.
3. Save/reopen completed batch and guarded Undo; refusal on changed IDs/timeline.
4. Interrupted conversion/Undo recovery needs implementation and runtime testing
   before claiming the original full crash-recovery requirement is fulfilled.

Project-bin cleanup and complete native Undo history are not implemented.
One active batch only. New UI, pairing, checkpoint reattachment and installer
are locally checked source, not user-runtime-verified features.

## Packaging references

- Adobe UXP package format (CCX is ZIP, no digital signature required):
  https://developer.adobe.com/premiere-pro/uxp/plugins/distribution/package/
- Adobe UPIA Windows install/remove/list:
  https://developer.adobe.com/premiere-pro/uxp/plugins/distribution/install/
- Adobe Windows CEP signing tool and platform caveats:
  https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD
  https://github.com/Adobe-CEP/CEP-Resources/blob/master/ZXPSignCMD/KnownIssue2024.md
- Inno Setup compiler:
  https://jrsoftware.org/ishelp/

The builder uses current Windows ZXPSignCmd supplied by the builder operator,
never historical project signing credentials. Optional fresh CEP certificate is
created outside this source tree. EXE Authenticode signing is a separate step.

## 1.0.1 optimization / acceptance boundaries

After the first card establishes text serialization defaults, import, writing,
trimming and scaling run in one synchronous host call per card. Each imported
instance must match the cached defaults exactly; a delayed component or changed
default falls back to the original read/write path WITHOUT a second import.
The import guards, ownership journal before text writes, post-edit full AV guard,
text/timing/scale readback, rollback and Undo remain. One redundant AV scan
between import and edit is omitted only inside this synchronous call.
Fused cards suppress control-panel refresh; commit refreshes Scale once.
For 68 compatible cards: 69 import/edit calls instead of 136, not a claim of
49% wall-clock speedup. Existing 61,624 ms measurement belongs to 09S, NOT 1.0.1.
Actual speed and deferred UI refresh must be verified in Premiere.

Linux tests pass for fused failure handling, fallback, all template engine paths,
automatic connection (mocked UXP), live HTTP authentication/replay protection,
visibility rollback and completed-state guards. PowerShell files parse locally.
The builder also runs a real PowerShell CCX-personalization regression on Windows
BEFORE signing. Windows UPIA installation/upgrade and Premiere are unavailable
here; no Windows or host acceptance pass is claimed.

Setup backs up a receipt-verified existing helper before replacement and restores
it on failure. An Adobe registration may already have changed if UPIA stops late;
that state is reported, not claimed as atomic installer rollback. No ambiguous
name-based Adobe removal occurs during failed upgrade. Retain installer.log.


## Installer upgrade fix (same 1.0.1 plugin payload)

The uploaded session records a completed conversion, not an interrupted one.
Setup now permits a structurally consistent completed checkpoint when a known
installation receipt and matching host ownership journal exist. It copies both
journals to a unique upgrade-backup folder and verifies hashes, without resetting
or moving the originals. Partial phases and inconsistent ownership still stop.
The runtime retains exact project/sequence/timeline/text guards before Undo;
installer checks do not prove that the current Premiere timeline is unchanged.
The connection credential is not included in backup deliverables or test fixtures.
PowerShell backup/gating tests run in BUILD.cmd on Windows before signing.


## Windows ZIP assembly fix

User installer log stopped before UXP packaging: System.IO.Compression.FileSystem
was loaded, but the ZipArchiveMode enum's System.IO.Compression assembly was not.
Both assemblies are now loaded explicitly in installer, builder and package tests.
The installer regression runs in a fresh Windows PowerShell process so prior
ZipFile operations in the builder cannot hide missing assembly dependencies.
Uploaded session/host-state backups were byte-identical to their originals.


## 1.0.2 restoration diagnostics (superseded by 1.0.3)

Automatic pairing reached completed-session verification on the user's machine.
The old report contained only a generic mismatch; it did not contain the current
snapshot, so the mismatch cause is unknown. This version reports the first exact
difference and both UXP snapshots during attach. All equality and ownership
guards remain; connection performs no timeline edits. The panel distinguishes
a connected helper with an unavailable prior Undo session from a transport error.
Mock tests cover sequence GUID, caption mute and timing differences, and confirm
that attach only calls status/capture. This is diagnostic instrumentation, not
a claim that the unknown restoration mismatch is fixed.


## 1.0.3 dynamic current-sequence conversion

Completed sessions no longer block panel attachment or a new Convert. Completed
history is archived before replacement; original output is retained. An unfinished
session remains blocked. Strict saved-state checks are used for Undo only.
Every Convert captures the active sequence and reads all populated native caption
tracks (including hidden ones), skipping empty tracks. Each populated source gets
one separately verified new video track above existing video tracks; overlapping
source times never share an output track. Separate outputs may overlap visually
because the bundled templates keep their existing positions.

Each add uses the already verified single-track QE call with the CURRENT video
track count. Every addition is checked against its immediately preceding snapshot.
Clip ownership, lane, text/timing and Scale 80 readback remain checked. A partial
hide restores each source's original mute state before output cleanup. Cleanup
checks all output lanes for foreign clips and removes empty tracks highest first.

Local mocks pass changed caption counts/indices, changed video track count, repeated
Convert with archived history, refused old Undo without edits, rejected new begin
without deleting old output, multi-track overlapping cues, partial hide failure,
add-then-throw rollback and unowned-clip refusal. All three MOGRT hashes unchanged.
Windows installer tests cover both legacy and multi-track checkpoint backup;
those PowerShell runtime tests run during BUILD.cmd on Windows. Locally only their
syntax is checked. This build is NOT runtime-certified in Premiere or compiled
as an EXE in Linux. Fused speed path is retained; no new speed percentage claimed.


## 1.0.4 grouped execution and measured bottlenecks

Uses only previously exercised Premiere calls, now grouped up to three cards in
one synchronous ExtendScript entry point. Every import still has its full before/
after guards and durable ownership record; each card retains text/timing/Scale 80
readback. Groups return early after 1500 ms between cards, on pending components,
or when instance defaults/raw serialized readbacks require JS inspection. Errors
stop subsequent imports; rollback includes all journaled clips even if JS has not
yet acknowledged them. Per-card Node checkpoints remain. UI/HTTP updates are per
group. Optional previous-speed mode uses the prior single-card command sequence.

Instrumentation reports host import, text write, trim, scale write, AV snapshot,
raw-property reading, host journal, export, total host, bridge elapsed, local log,
checkpoint, preparation and caption decoding time. Millisecond clock resolution
means short operations can report zero. Nested totals are not additive. No speed
percentage or runtime compatibility claim is made before a Windows/Premiere run.

Node mocks cover both modes for all three templates, all prior rollback/Undo
regressions, delayed/default-mismatch fallback, second grouped import failure,
bounded groups and the actual timing wrapper. Windows builder additionally runs
its installer regression before signing. Native cloning remains unimplemented
until independence and actual runtime support can be verified.


## 1.0.5 compact in-flight journals and structural comparisons

Motivated by runtime 1.0.4 profiling: 65 V3 cards took 53.207 s grouped, with
18.330 s in host persistence and 12.365 s in snapshot collection. Single-card
run took 62.752 s on a different output track; not a controlled speedup proof.

Every conversion intent/ownership write remains. In-flight host-state records
omit repeated baseline/beforeAdd/added/expected snapshots; an immutable separate
host-baseline.json retains the original AV baseline. The complete in-memory state
and complete converted checkpoint remain unchanged. Restart Undo and installer
backup therefore keep their established completed-state shape. Partial sessions
still block startup. Compact records are diagnostic evidence, not an automatic
crash recovery promise. Old completed checkpoints remain readable.

All existing AV guard calls remain. Structural equality replaces expensive JSON
string allocation, with strict types, array order/length and object field checks.
Timeline collection counts are cached for the duration of a snapshot, not between
host calls. No new Premiere API is introduced. Both comparison modes use this code.

Local regressions cover compact ownership-before-edit, failed journal write after
import (no text write), rollback, full completed checkpoint restart Undo, original
field mutation refusal and all previous multi-track/grouped scenarios. A mocked
200-footage-clip example produced a 340-character compact final record versus
76,167 characters for the full state; this is not a Premiere timing measurement.
Windows build/installer and runtime conversion performance require user execution.


## 1.0.5 builder port fix

Only the HTTP regression harness uses an OS-assigned temporary port, with the
production Host header supplied explicitly. It verifies the production listener
still requests 127.0.0.1:48771 and checks bad Host rejection. No installed helper is
contacted or stopped. Payload files and plugin version remain unchanged.
Runtime feedback: 65 V3 cards completed in 28.042 s with text, Scale 80 and source
caption checks passing. Persistence measured 1.075 s, snapshot collection 11.774 s.
Earlier grouped run was 53.207 s on V9 versus V10 now; not identical baseline proof.
This report does not include a runtime Undo result for 1.0.5.


## 1.0.6 group-scoped guard optimization and team panel

The grouped host path takes a full baseline/expected-state check at group entry,
reads all owned output tracks after each import, and takes a full original AV
snapshot after each text/trim/scale edit before starting another import. The next
card reuses that verified snapshot only in the same synchronous importBatch call;
track identities/counts are checked again. No cache crosses a host-call boundary.
A pending component or differing text schema forces a full boundary check before
returning to the existing fallback. Three successful cards require four full
snapshots instead of nine in the local regression; output-track scans still run.
Single-card paths retain previous full guards. No new Premiere APIs are used.

Tests inject original mutation during import (including pending fallback), prior
output mutation, and external edits between groups. All stop before another unsafe
import; original-state mismatch blocks destructive rollback. Previously verified
ownership journals, non-ripple removal, all-track conversion and Undo are retained.
New full-guard arrangement still needs actual Premiere runtime acceptance.

Team panel removes the experimental checkbox and raw log. It shows style choices,
Convert, Undo, numeric progress and concise status. Retry appears on blocked
connection/session state. Report bug sends the in-memory report to the existing
CEP/ExtendScript bridge, which writes a unique UTF-8 TXT on Folder.desktop. This
uses the same Desktop/File APIs already exercised by diagnostic folders. If helper
export fails, the existing UXP save dialog is used. No report is sent externally;
no credentials/config files are read. Report export works without an active
sequence and does not update the checkpoint. Token-shaped strings are redacted.

Local tests cover report size bounds, Desktop path, no timeline/checkpoint edits,
connection failure, file-dialog cancellation, progress and secret redaction.
Actual UXP visual layout, Desktop export and new conversion timing need runtime
confirmation. All MOGRT hashes and builder port-isolation fix retained.


## 1.0.7 scrolling and Windows release evidence

UXP content now has a bounded flex layout, min-height zero and vertical scrolling.
Report bug and Retry connection live in a separate nonshrinking footer; report
status has its own bounded overflow. Conversion/Undo algorithms are unchanged.
Windows build emits final EXE hash/signature metadata and optionally signs the
outer EXE with an existing Windows code-signing certificate. Signing requires a
valid signature and trusted timestamp; default remains an unsigned preview.
No claims of zero detections or company approval; see SECURITY_REVIEW.txt.
Actual UXP layout and Windows signing cannot be validated on this Linux host.
