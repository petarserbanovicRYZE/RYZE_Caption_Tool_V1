RYZE V1 Installer Fix 02 (includes Builder Fix 01)

Close the failed Setup window and Premiere. Copy the included installer and
builder folders into the existing RYZE_Caption_Tool_V1_Builder folder; replace
the two files when asked. Run BUILD.cmd with the working certificate.
Then run the NEW dist/RYZE_Caption_Tool_Setup.exe. No manual removal of
RYZE Caption Tool 0.7.0 is needed.

Cause: Adobe installed version 1.0.0 successfully, but our validator looked
for a manifest ID in a name/version table. Cleanup by that ID also failed.
The fix parses the Premiere name/version rows, recognizes the installed V1,
and reinstalls the missing helper/configuration without reinstalling UXP.
It leaves older RYZE versions untouched.

UPIA removal uses the listed display name only when unambiguous. If version
0.7.0 and 1.0.0 share the name, automatic removal refuses; remove only 1.0.0
in Creative Cloud Manage Plugins before retrying uninstall.
Textual UPIA failures are now detected even when the process exit code is 0.

Validation: regex fixtures from the supplied installer.log passed.
Windows PowerShell/Adobe execution of this patch is still pending.
Reference: https://helpx.adobe.com/vn_vi/creative-cloud/help/working-from-the-command-line.html
