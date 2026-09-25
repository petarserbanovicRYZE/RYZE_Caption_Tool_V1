'use strict';
const assert=require('assert'),make=require('./test-host');
const defaults=JSON.stringify({textEditValue:'default',fontTextRunLength:[7]});
const text=JSON.stringify({textEditValue:'new',fontTextRunLength:[3]});
function ready(mode){const h=make(mode);assert(h.run('prepare').ok);assert(h.run('add').ok);assert(h.run('checkAdded').ok);return h;}
for(const mode of ['good','setfail','scalefail','animatedscale','throwafterimport','nullafterimport']){
 const h=ready(mode);let guards=0;const guard=h.api.assertOriginals;h.api.assertOriginals=function(seq){guards++;return guard(seq);};
 const r=h.run('importSet','/template.mogrt','0','20',defaults,defaults,text,text);
 assert.equal(h.api.state.created.length,1);assert.equal(r.ok,mode==='good',JSON.stringify(r));
 if(r.ok){
  assert(r.fused);assert.equal(r.clip.motionScale,80);assert.equal(r.clip.end,'20');assert.equal(JSON.parse(r.clip.topRaw).textEditValue,'new');
  assert.equal(guards,3,'Full originals guard before/after import AND after editing');
  assert.deepStrictEqual(h.uiFlags,[['Top Text',false],['Bottom Text',false],['Scale',false]]);
  assert(h.run('complete').ok);assert.deepStrictEqual(h.uiFlags.at(-1),['Scale',true]);
 }
 const states=h.writes.map(x=>JSON.parse(x));
 const owned=states.findIndex(x=>x.created&&x.created.length===1);
 const edit=states.findIndex(x=>x.intent&&x.intent.operation==='text_trim_and_scale');
 if(edit>=0)assert(owned<edit,'Ownership must be written BEFORE any edit intent');
 const removed=h.run('removeChunk');assert(removed.ok);assert.equal(removed.removed,1);assert.equal(removed.count,0);
 assert(h.run('removeOne').empty);assert(h.run('remove').ok);assert(h.run('finish').avRestored);
}
for(const delayed of [true,false]){
 const h=ready('good'),raw=h.api.raw;let first=true;
 if(delayed)h.api.raw=function(item){if(first){first=false;throw Error('MGT component not ready');}return raw(item);};
 const result=h.run('importSet','/template.mogrt','0','20',delayed?defaults:'different',defaults,text,text);
 assert(result.ok&&!result.fused);assert(delayed?result.pending:result.fallback);assert.equal(h.uiFlags.length,0);
 const original=result.clip||h.run('inspectClip',result.id).clip;
 assert(original);assert(h.run('setClip',result.id,text,text,'20',true).ok);
 assert.equal(h.api.state.created.length,1,'Fallback must never import again');
}
{
 const h=ready('good');h.seq.videoTracks[0].name='External edit';
 assert(!h.run('importSet','/template.mogrt','0','20',defaults,defaults,text,text).ok);
 assert.equal(h.seq.videoTracks[1].clips.length,0,'Changed originals must stop before import');
}
console.log('PASS fused path: 3 full AV guards, ownership before edits, delayed/default-mismatch fallback without reimport, text/scale/import failures and rollback, deferred UI refresh. Mocks only.');
