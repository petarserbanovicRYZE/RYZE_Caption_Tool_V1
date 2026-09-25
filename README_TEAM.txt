RYZE CAPTION TOOL 1.0.7 — TEAM PREVIEW

INSTALL
Save your project and close Premiere. Run RYZE_Caption_Tool_Setup.exe.
Creative Cloud Desktop must be installed. Open Premiere > Window > UXP Plugins
> RYZE Caption Tool. Connection is automatic. No Developer Tools are needed.
This build supports Premiere Pro 26.5.1 on Windows, with English Motion controls.

CONVERT
1. Transcribe the active sequence and choose Create captions.
2. Keep the captions native. Do not upgrade them to graphics.
3. Open RYZE, choose V3 / V5 / Stroke, then Convert captions.
4. Wait for Done before editing the timeline or changing sequences.

All populated caption tracks are converted, including hidden ones. Empty tracks
are skipped. Each source track gets a fresh video track above existing tracks.
Existing footage is never chosen as the output target. Simultaneous caption
sources use separate tracks but may overlap visually at the template position.
Cards use at most 3 words per line, 2 lines, and Motion Scale 80%.
Original captions remain in the project and are hidden after verified success.
The limit is 500 generated cards per conversion.

UNDO AND ANOTHER CONVERSION
Undo last conversion restores original caption visibility and removes only the
last batch's generated clips and empty output tracks. Use it before editing the
timeline. If the timeline changed, Undo may refuse to avoid deleting unrelated
work. A completed old session does not block a new Convert on current captions.
Another Convert keeps earlier output. To change style without duplicate output,
Undo the previous conversion first. Earlier archived records are diagnostic
history, not a multi-level Undo stack.

REPORT A BUG
Click Report bug. A uniquely named RYZE_Bug_Report_*.txt is saved on your Desktop.
Send that TXT to your team lead. Nothing is uploaded or sent automatically.
If the helper is unavailable, a Save dialog opens: choose your Desktop.
Reports include errors, timing, caption text and local diagnostic references.
Pairing configuration is not included; token-shaped strings are redacted.
Do not send connection.json, a personalized CCX or private signing certificates.

RECOVERY / LIMITS
Save a project copy before conversion. Automatic recovery from a crash halfway
through conversion/Undo is not implemented. An unfinished session blocks new
edits: keep diagnostics and contact the team lead rather than deleting checkpoints.
Restart Undo requires the same saved project, sequence and unchanged identities.
Project-panel MOGRT assets may remain after Undo; full native Undo history
restoration and project-bin cleanup are not claimed.
This build passed local simulated tests. Its latest speed path and Desktop report
export still need Premiere runtime confirmation; it is a team preview.

SUPPORT FILES
Detailed diagnostic folders: Desktop/RYZE_Caption_Tool_V1_*
Helper log: %TEMP%/RYZE_Caption_Tool_V1_bridge.txt
Installer log and session records: %APPDATA%/RYZE/CaptionToolV1
Keep the whole diagnostic folder, including host-baseline.json. These files
contain project information and survive uninstall intentionally.

UNINSTALL
Close Premiere and use Windows Installed apps > RYZE Caption Tool V1 Candidate.
