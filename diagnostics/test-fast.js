'use strict';
const assert=require('assert'),make=require('./test-host');
function ready(mode){const h=make(mode);assert(h.run('prepare').ok);assert(h.run('add').ok);assert(h.run('checkAdded').ok);return h;}
for(const mode of ['good','setfail','scalefail','animatedscale','throwafterimport','nullafterimport']){
 const h=ready(mode),r=h.run('importInspect','/template.mogrt','0','20');assert.equal(h.api.state.created.length,1);
 if(r.ok){const text=JSON.stringify({textEditValue:'new',fontTextRunLength:[3]});const updated=h.run('setClip',r.id,text,text,'20',true);assert.equal(updated.ok,mode==='good');
  if(mode==='good'){assert.deepStrictEqual(h.uiFlags,[['Top Text',false],['Bottom Text',false],['Scale',true]]);assert.equal(h.run('inspectAll').clips[0].motionScale,80);}}
 else assert(['throwafterimport','nullafterimport','animatedscale'].includes(mode));
 const removed=h.run('removeChunk');assert(removed.ok);assert.equal(removed.removed,1);assert.equal(removed.count,0);
 assert(h.run('removeOne').empty);assert(h.run('remove').ok);assert(h.run('finish').avRestored);
}
{
 const h=ready('good'),original=h.api.raw;let first=true;
 h.api.raw=function(item){if(first){first=false;throw Error('MGT component not ready');}return original(item);};
 const r=h.run('importInspect','/template.mogrt','0','20');assert(r.ok&&r.pending);assert.equal(h.api.state.created.length,1);assert(h.run('inspectClip',r.id).ok);
}
{
 const h=ready('good');h.run('importInspect','/template.mogrt','0','20');h.seq.videoTracks[1].clips.push({nodeId:'outsider'});
 assert(!h.run('removeChunk').ok);assert.equal(h.seq.videoTracks[1].clips.numItems,2);
}
console.log('PASS fast paths: immediate read, pending-read fallback without reimport, UI refresh flags, failure ownership/cleanup, unowned-clip refusal.');
