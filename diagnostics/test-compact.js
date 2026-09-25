'use strict';
const assert=require('assert'),make=require('./test-host'),vm=require('vm');
const h=make('good');
for(let i=0;i<200;i++)h.seq.videoTracks[0].clips.push({nodeId:'footage'+i,start:{ticks:String(i*30)},end:{ticks:String(i*30+30)},inPoint:{ticks:'0'},outPoint:{ticks:'30'},disabled:false});
for(const op of ['prepare','add','checkAdded'])assert(h.run(op).ok);
const defaults=JSON.stringify({textEditValue:'default',fontTextRunLength:[7]}),raw=JSON.stringify({textEditValue:'New',fontTextRunLength:[3]});
assert(h.run('importSet','/template.mogrt','0','20',defaults,defaults,raw,raw).ok);
const compact=h.writeRecords.filter(r=>JSON.parse(r.text).journalSchema===2),baseline=h.writeRecords.filter(r=>r.path.endsWith('/host-baseline.json'));
assert.equal(baseline.length,1);assert(compact.length>=5);
const fullBytes=h.api.json(h.api.state).length,compactBytes=compact.at(-1).text.length;
assert(compactBytes<fullBytes/10,'Compact record must not repeat large footage snapshots');
const ownIndex=h.writeRecords.findIndex(r=>{const v=JSON.parse(r.text);return v.created&&v.created.length===1;});
const editIndex=h.writeRecords.findIndex(r=>{const v=JSON.parse(r.text);return v.intent&&v.intent.operation==='text_trim_and_scale';});
assert(ownIndex<editIndex);assert(baseline[0].text.includes('footage199'));
const inFlight=JSON.parse(compact.at(-1).text);assert.equal(inFlight.created[0].id,'clip1');assert(!('baseline' in inFlight));assert(!('expected' in inFlight));
assert(h.run('complete').ok);
const completed=h.writeRecords.filter(r=>r.path.endsWith('/host-state.json')).at(-1);const saved=JSON.parse(completed.text);
assert.equal(saved.phase,'converted');assert(saved.baseline&&saved.expected&&saved.created);assert(!saved.journalSchema);
// A restarted host restores the complete checkpoint; existing baseline file must not block Undo.
h.api.state=null;h.api.baselineFolder=null;
assert(JSON.parse(vm.runInContext('RYZEV1.restoreCompleted('+completed.text+')',h.ctx)).ok);
assert(h.run('guard').ok);assert(h.run('removeChunk').ok);assert(h.run('removeOne').empty);assert(h.run('remove').ok);assert(h.run('finish').avRestored);
// Comparator rejects each measured clip/track change, without JSON serialization.
const base=vm.runInContext('({video:[{id:"1",name:"V1",mute:false,lock:false,clips:[{id:"c1",start:"0",end:"20",inPoint:"0",outPoint:"20",disabled:false}]}],audio:[]})',h.ctx);
for(const field of ['id','start','end','inPoint','outPoint','disabled']){
 const copy=JSON.parse(JSON.stringify(base));copy.video[0].clips[0][field]=field==='disabled'?true:'changed';
 const other=vm.runInContext('('+JSON.stringify(copy)+')',h.ctx);assert(!h.api.same(base,other),field);
}
for(const field of ['id','name','mute','lock']){
 const copy=JSON.parse(JSON.stringify(base));copy.video[0][field]=typeof copy.video[0][field]==='boolean'?true:'changed';assert(!h.api.same(base,vm.runInContext('('+JSON.stringify(copy)+')',h.ctx)),field);
}
// A write failure after ownership reconciliation stops editing; in-memory ownership permits rollback.
const fail=make('good');for(const op of ['prepare','add','checkAdded'])assert(fail.run(op).ok);
const writer=fail.api.writeJournal;let injected=false;
fail.api.writeJournal=function(path,value){if(!injected&&value.created&&value.created.length){injected=true;throw Error('Journal failure after import');}return writer(path,value);};
assert(!fail.run('importSet','/template.mogrt','0','20',defaults,defaults,raw,raw).ok);assert.equal(fail.uiFlags.length,0);assert.equal(fail.api.state.created.length,1);
assert(fail.run('removeChunk').ok);assert(fail.run('removeOne').empty);assert(fail.run('remove').ok);assert(fail.run('finish').avRestored);
console.log('PASS compact journal: baseline stored once, ownership before editing, '+compactBytes+' vs '+fullBytes+' bytes in a 200-footage-clip mock, full completed checkpoint/restart Undo, all measured field guards and write-failure rollback. Byte reduction is NOT a runtime speed measurement.');
