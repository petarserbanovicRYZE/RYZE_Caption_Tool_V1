'use strict';
const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const files=fs.readdirSync(__dirname).filter(n=>/^test-.*\.js$/.test(n)&&n!=='test-macos-runtime.js').sort();
let failed=0;
for(const file of files){
 const r=spawnSync(process.execPath,[path.join(__dirname,file)],{encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});
 if(r.status!==0||r.error){failed++;console.error('FAIL '+file+'\n'+(r.error||'')+'\n'+r.stdout+'\n'+r.stderr);}else console.log('PASS '+file);
}
console.log((files.length-failed)+'/'+files.length+' JavaScript suites passed. Real Darwin lifecycle tests run separately with the packaged Node runtime.');
process.exitCode=failed?1:0;
