'use strict';
const assert=require('assert'),make=require('./test-host');
const raw=t=>JSON.stringify({textEditValue:t,fontTextRunLength:[t.length]}),defaults=raw('default');
const rows=Array.from({length:3},(_,i)=>[String(i*20),String((i+1)*20),'0',raw('Card '+i),raw('')].map(encodeURIComponent).join('|')).join('\n');
function ready(mode='good'){const h=make(mode);for(const m of ['prepare','add','checkAdded'])assert(h.run(m).ok);return h;}
function invoke(h,name,...args){return JSON.parse(h.api.invoke(name,args.map(x=>encodeURIComponent(String(x)))));}
function clean(h){const removed=h.run('removeChunk');assert(removed.ok);assert.equal(removed.count,0);assert(h.run('removeOne').empty);assert(h.run('remove').ok);assert(h.run('finish').avRestored);}
{
 const h=ready(),result=invoke(h,'importBatch','/template.mogrt',defaults,defaults,rows);
 assert(result.ok);assert.equal(result.results.length,3);assert.equal(h.api.state.created.length,3);
 for(let i=0;i<3;i++){assert.equal(JSON.parse(result.results[i].clip.topRaw).textEditValue,'Card '+i);assert.equal(result.results[i].clip.motionScale,80);}
 for(const key of ['hostTotal','snapshot','persist','raw','importMGT','textWrite','trim','scaleWrite'])assert(result.perf[key].calls>0,key);
 assert.equal(result.perf.importMGT.calls,3);assert.equal(result.perf.scaleWrite.calls,3);assert(h.run('complete').ok);clean(h);
}
for(const pending of [false,true]){
 const h=ready();if(pending){const original=h.api.raw;let first=true;h.api.raw=function(it){if(first){first=false;throw Error('MGT component not ready');}return original(it);};}
 const result=invoke(h,'importBatch','/template.mogrt',pending?defaults:'different',defaults,rows);
 assert(result.ok);assert.equal(result.results.length,1);assert(!result.results[0].fused);assert.equal(h.api.state.created.length,1,'A fallback must stop the group without reimport');
 assert(h.run('setClip',result.results[0].id,raw('Card 0'),raw(''),'20',true).ok);clean(h);
}
for(const mode of ['setfail','scalefail','animatedscale','throwafterimport','nullafterimport']){
 const h=ready(mode),result=invoke(h,'importBatch','/template.mogrt',defaults,defaults,rows);assert(!result.ok);assert.equal(h.api.state.created.length,1);clean(h);
}
{
 const h=ready(),original=h.seq.importMGT;let n=0;
 h.seq.importMGT=(...args)=>{const result=original(...args);if(++n===2)throw Error('Second grouped import threw after creation');return result;};
 const result=invoke(h,'importBatch','/template.mogrt',defaults,defaults,rows);assert(!result.ok);assert.equal(h.api.state.created.length,2);clean(h);
}
{
 const h=ready();assert(!invoke(h,'importBatch','/template.mogrt',defaults,defaults,rows+'\n'+rows).ok);assert.equal(h.seq.videoTracks[1].clips.length,0);
}
console.log('PASS grouped host calls: independent text/scale, component/schema fallback without reimport, stop on failure, rollback after second partial import, group size bound, real timing wrapper categories (mocks).');
