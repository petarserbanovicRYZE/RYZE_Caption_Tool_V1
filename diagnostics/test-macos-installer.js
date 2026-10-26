'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const {checkListing,receipt,checkReceipt}=require('../mac-builder/package/scripts/installer-support');
const row=' Enabled    RYZE Caption Tool                                            1.0.7';
assert.deepEqual(checkListing('2 extensions installed for Premiere Pro (ver 26.5.2)\r\n'+row),['26.5.2']);
assert.deepEqual(checkListing('1 extension installed for Premiere Pro 2026 (ver 27.0.0)\n'+row),['27.0.0']);
assert.deepEqual(checkListing('1 extension installed for Premiere Pro (ver 25.6.0)\n'+row),['25.6.0']);
for(const text of [
 '1 extension installed for Photoshop 2026 (ver 27.0.0)\n'+row,
 '1 extension installed for Premiere Pro (ver 25.5.0)\n'+row,
 '1 extension installed for Premiere Pro (ver 26.5.2)\n'+row.replace('Enabled','Disabled'),
 '1 extension installed for Premiere Pro (ver 26.5.2)\n'+row.replace('1.0.7','1.0.70'),
 '1 extension installed for Premiere Pro (ver 26.5.2)\n'+row.replace('Caption Tool','Caption Tool Other'),
 '0 extensions installed for Premiere Pro (ver 26.5.2)\n1 extension installed for Others\n'+row,
 '1 extension installed for Premiere Pro (ver 26.5.2)\n Enabled RYZE Caption Tool 1.0.6\n Enabled Other Tool 1.0.7',
 'Failed: RYZE Caption Tool 1.0.7'
])assert.throws(()=>checkListing(text),/UPIA did not confirm/);
const info=require('../cep/build-info.json'),target='/Users/Team "A"/Library/RYZE',value=receipt(target,'/Library/RYZE',info);
assert.equal(JSON.parse(JSON.stringify(value)).cepTarget,target,'Receipt paths must survive JSON escaping');
assert.equal(value.revision,info.revision);checkReceipt(value);
assert.throws(()=>checkReceipt({...value,uxpId:'another.plugin'}));
for(const version of ['1.0.8','1.1.0','2.0.0'])assert.throws(()=>checkReceipt({...value,version}),/downgrade/);
checkReceipt({...value,version:'1.0.6'});
assert.throws(()=>receipt(target,'/Library/RYZE',{version:'1.0.7'}));
const script=fs.readFileSync(path.join(__dirname,'../mac-builder/package/scripts/postinstall'),'utf8');
assert(script.includes('check-list "$INSTALL_TMP/upia-list.txt"'));
assert(script.includes('STATE_BACKUP'));
assert(!script.includes('chown -R "$CONSOLE_USER":staff "$DATA_DIR"'),'Do not recursively chown user data');
assert(script.includes('run_as_user /bin/mkdir -p "$DATA_DIR"'),'Fresh config parent folders must belong to the signed-in user');
assert(script.includes('run_as_user /bin/mkdir -p "$CEP_PARENT" "$UXP_STORAGE"'),'Fresh Adobe parent folders must belong to the signed-in user');
assert(!/^\/bin\/mkdir -p.*\$(DATA_DIR|CEP_PARENT|UXP_STORAGE)/m.test(script),'Do not create private per-user parent directories as root');
assert(script.includes('could not all be restored'),'Do not falsely report successful rollback after a restore failure');
console.log('PASS macOS installer: enabled plugin/host/version registration, escaped receipts, revision, and failure rollback safeguards.');
