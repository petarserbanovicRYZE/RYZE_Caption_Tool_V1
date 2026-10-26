# Premiere compatibility policy

RYZE V1.0.7 source now permits Premiere **25.6.0 and newer**, including 26.3.0.
This is installation eligibility plus runtime checks, not certification of every
Premiere release. Existing distributed installers still contain their old rules.

## Why 25.6 is the minimum

Adobe's released Premiere UXP platform starts at 25.6. RYZE uses caption track
identity, enumeration, timing, `isMuted` and `setMute`; the current Adobe reference
documents those caption APIs from 25.6. Premiere 25.5 and earlier are not supported
by this architecture. Supporting them would require a separately designed legacy
path, not just a manifest edit.

- [Adobe's UXP release announcement](https://blog.developer.adobe.com/en/publish/2025/12/uxp-arrives-in-premiere-a-new-era-for-plugin-development)
- [CaptionTrack API](https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/captiontrack)
- [Sequence API](https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/sequence)

## Newer versions

UXP has a `25.6.0` minimum and no `maxVersion`. CEP uses `Version="25.6"`:
Adobe's `RangedVersion` schema defines a single version as a minimum with no
maximum. There is no artificial 26.9 or 99.9 ceiling.
The CEP panel size elements also follow the schema's Height-before-Width order;
the dimensions themselves are unchanged.

- [UXP manifest](https://developer.adobe.com/uxp/guides/explanation/concepts/manifest/)
- [Adobe CEP manifest schema, RangedVersion](https://github.com/Adobe-CEP/CEP-Resources/blob/master/CEP_7.x/ExtensionManifest_v_7_0.xsd)

The old exact `26.5.1` runtime check is replaced with a minimum check and a
read-only preflight for snapshot export, MOGRT import and the QE track APIs.
UXP checks caption visibility-write availability during the initial snapshot,
before sending conversion commands. Missing APIs cause a diagnostic failure.
English Motion controls, template readback, original timeline identity guards,
caption-serialization validation, and guarded Undo remain unchanged.

No version rule can guarantee future API behavior. RYZE still depends on CEP,
ExtendScript/QE, and a strict reader for the observed 26.5.1 project serialization.
A future Adobe change, different serialization, or incompatible MOGRT rendering
may require another update. Never bypass those safeguards to force conversion.

## Installer behavior

Windows preflight now explains the required and detected Premiere versions before
copying the CEP helper or creating pairing data. It accepts the same enabled RYZE
registration listed under multiple Premiere versions; duplicate rows under one
host and disabled registrations still fail. Ambiguous name-based uninstall remains
blocked: use Creative Cloud to remove only RYZE 1.0.7 if multiple entries prevent
the existing conservative uninstaller from proving a unique removal target.

Rerunning Windows Setup now automatically installs, upgrades or repairs recognized
V1 installations. A Start Menu repair shortcut invokes the same validated installer.
Missing/damaged receipts are recovered only from a recognized V1 helper manifest;
valid receipts also permit restoring missing helper files. Foreign/newer receipts,
unknown helper folders and linked paths are refused. Valid pairing data is kept
byte-for-byte; damaged pairing is backed up before a new per-user token is generated.
Old helper files and receipts are retained in private repair backups. Adobe failure
restores the previous helper; UPIA registration cannot be rolled back reliably and
is explicitly reported as requiring a retry. No name-based removal is used in repair.
Disabled Adobe registrations still require enabling in Creative Cloud first.
Concurrent installers are blocked with a per-user mutex. Interrupted conversion
checkpoints still stop repair; completed Undo state is backed up and preserved.

The Windows build/signing commands, protocol, IDs, port and conversion engine are
unchanged. Inno Setup adds only the repair shortcut. The CEP manifest/JSX must be re-signed
through the existing Windows builder; do not edit an already signed payload.
Rebuild Windows Setup and the separate Mac package to distribute these changes.

## Verification and release checklist

Automated tests cover version gates (25.6, 26.3, 26.5.1, and synthetic future
versions), missing APIs before edits, multi-version UPIA listings, and mock
conversion/Undo/rollback for V3, V5 and Stroke. Mocking a version string is **not**
testing that actual version of Premiere.

Before distributing a compatibility build, use a saved copy of a real project on
25.6 and 26.3, then the current release, on each target OS:

1. Install with Premiere closed and verify UXP registration and CEP/helper startup.
2. Convert native captions using V3, V5 and Stroke; verify text, timing and scale.
3. Verify original captions hide only after success, then Undo restores them.
4. Test overlapping caption tracks, a saved/reopened project and an existing
   completed RYZE conversion; confirm no unrelated timeline content changes.
5. Retain bug reports on failure. Do not delete checkpoints to bypass a refusal.

No real older-version Premiere acceptance run or new signed Windows installer is
claimed by the source changes alone.
