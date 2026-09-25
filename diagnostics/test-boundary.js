'use strict';
const assert=require('assert'),make=require('./test-host');
const raw=t=>JSON.stringify({textEditValue:t,fontTextRunLength:[t.length]}),defaults=raw('default');
const rows=Array.from({length:3},(_,i)=>[String(i*20),String((i+1)*20),'0',raw('Card '+i),raw('')].map(encodeURIComponent).join('|')).join('\n');
function ready(){const h=make('good');for(const op of ['prepare','add','checkAdded'])assert(h.run(op).ok);return h;}
{
 const h=ready();let scans=0;const snapshot=h.api.snapshot;h.api.snapshot=function(seq){scans++;return snapshot(seq);};
 assert(h.run('importBatch','/template.mogrt',defaults,defaults,rows).ok);assert.equal(scans,4,'Full scan at group entry plus after every edited card');
 h.seq.videoTracks[0].name='User edit between host calls';const before=h.api.state.created.length;
 assert(!h.run('importBatch','/template.mogrt',defaults,defaults,rows).ok);assert.equal(h.api.state.created.length,before,'No cache may cross a host call');
}
for(const pending of [false,true]){
 const h=ready(),native=h.seq.importMGT;let imports=0;
 h.seq.importMGT=(...args)=>{imports++;const item=native(...args);h.seq.videoTracks[0].name='Unexpected original mutation';return item;};
 if(pending)h.api.raw=()=>{throw Error('MGT component not ready');};
 const r=h.run('importBatch','/template.mogrt',defaults,defaults,rows);
 assert(!r.ok);assert.equal(imports,1,'Original mutation must stop before second import, including fallback');assert.equal(h.api.state.created.length,1);
 assert(!h.run('removeOne').ok,'Changed footage baseline prevents unsafe automatic cleanup');
}
{
 const h=ready(),native=h.seq.importMGT;let n=0;
 h.seq.importMGT=(...args)=>{const it=native(...args);if(++n===2)h.seq.videoTracks[1].clips[0].end.ticks='changed';return it;};
 assert(!h.run('importBatch','/template.mogrt',defaults,defaults,rows).ok);assert.equal(n,2,'Prior-output mutation stops the group');
}
console.log('PASS synchronous group scope: 4 full scans for 3 cards, no cache across calls, original mutation detected before next import, pending fallback full guard and prior-output mutation refusal (mocks).');
