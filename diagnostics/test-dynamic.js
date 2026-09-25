'use strict';
const assert=require('assert'),make=require('./test-host'),createEngine=require('../cep/engine'),createFlow=require('../uxp/workflow'),createVisibility=require('../uxp/visibility');
const clone=x=>JSON.parse(JSON.stringify(x));
function setup(){
 const h=make('good'),seq=h.seq,guid='12345678-1234-1234-1234-123456789012';seq.sequenceID=guid;h.qs.guid=guid;
 seq.videoTracks.push(h.track('8'),h.track('19'));
 let captions=[{id:'5',muted:false,items:[{start:'0',end:'20',text:'First caption'}]},{id:'9',muted:true,items:[{start:'0',end:'20',text:'Second caption'}]},{id:'10',muted:false,items:[]}];
 let failMute=false,hashOK=true,batch=0,saved=null;const history=[],logs=[],commands=[];
 const uTrack=(t,i,caption)=>({id:t.id,name:caption?'Subtitle':t.name,isMuted:async()=>caption?t.muted:false,setMute:async v=>{t.muted=v;if(failMute&&i===1&&v){failMute=false;throw Error('Second hide mutated then failed');}},getTrackItems:async()=> (caption?t.items:t.clips).map(c=>({getStartTime:async()=>({ticks:caption?c.start:c.start.ticks}),getEndTime:async()=>({ticks:caption?c.end:c.end.ticks})}))});
 const uSeq={guid,name:seq.name,getVideoTrackCount:async()=>seq.videoTracks.length,getAudioTrackCount:async()=>0,getCaptionTrackCount:async()=>captions.length,getVideoTrack:async i=>uTrack(seq.videoTracks[i],i,false),getCaptionTrack:async i=>uTrack(captions[i],i,true)};
 const vis=createVisibility({Constants:{TrackItemType:{CLIP:1}},Project:{getActiveProject:async()=>({getActiveSequence:async()=>uSeq})}});
 const native=()=>({sequenceID:guid,sequenceName:seq.name,tracks:captions.map((t,index)=>({index,frameTicks:'1',cues:t.items.map(c=>({startTicks:c.start,endTicks:c.end,startFrame:+c.start,endFrame:+c.end,text:c.text}))}))});
 const io={host:async(m,...a)=>h.run(m,...a),snapshot:native,templatePath:()=>'/template.mogrt',hash:()=>hashOK?'22e6acb94b560e24ba4b025afac6b989dc151100cf6f01bf87898513738757bd':'wrong',id:()=>String(++batch),pause:async()=>{},append:(f,n,t)=>logs.push(t),write:()=>{},plan:cues=>cues.map(c=>({...c,top:c.text,bottom:''})),checkpoint:s=>{saved=clone(s);},archive:s=>history.push(clone(s))};
 const engine=createEngine(io),api={command:async(op,a)=>{commands.push(op);try{return await engine.dispatch(op,a);}catch(e){e.state=engine.state();throw e;}}};
 const flow=createFlow(api,vis,()=>{});
 return {h,vis,flow,engine,api,io,history,logs,commands,get captions(){return captions;},set captions(v){captions=v;},failHide:()=>{failMute=true;},badHash:()=>{hashOK=false;},checkpoint:()=>saved};
}
(async()=>{
 const x=setup(),before=await x.vis.capture();
 await x.flow.run('V3');assert.equal(x.engine.state().outputs.length,2);assert.equal(x.h.seq.videoTracks.length,5);
 assert.equal(x.h.seq.videoTracks[3].clips.length,1);assert.equal(x.h.seq.videoTracks[4].clips.length,1);
 assert.equal(JSON.parse(x.h.seq.videoTracks[3].clips[0].getMGTComponent().properties[0].getValue()).textEditValue,'First caption');
 assert.equal(JSON.parse(x.h.seq.videoTracks[4].clips[0].getMGTComponent().properties[0].getValue()).textEditValue,'Second caption');
 assert(x.captions.slice(0,2).every(t=>t.muted));await x.flow.undo();assert.deepStrictEqual(await x.vis.capture(),before);
 // Reattach a serialized completed multi-track checkpoint after helper restart.
 const restart=setup(),restartBefore=await restart.vis.capture();await restart.flow.run('V3');
 const hostSaved=JSON.stringify(restart.h.api.state),nodeSaved=restart.checkpoint();restart.h.api.state=null;
 const restartIO={...restart.io,load:()=>clone(nodeSaved),restoreHost:async()=>{const result=JSON.parse(require('vm').runInContext('RYZEV1.restoreCompleted('+hostSaved+')',restart.h.ctx));if(!result.ok)throw Error(result.error);}};
 const restartEngine=createEngine(restartIO),restartFlow=createFlow({command:(op,args)=>restartEngine.dispatch(op,args)},restart.vis,()=>{});
 assert((await restartFlow.attach()).converted);await restartFlow.undo();assert.deepStrictEqual(await restart.vis.capture(),restartBefore);
 // Partial multi-track hide must restore distinct original mute states before deleting output.
 const y=setup();y.captions[1].muted=false;const yBefore=await y.vis.capture();y.failHide();
 await assert.rejects(()=>y.flow.run('V3'),/Second hide/);assert.deepStrictEqual(await y.vis.capture(),yBefore);assert.equal(y.engine.state().phase,'finished');
 // A new caption layout and additional existing video track cannot be blocked by old Undo history.
 const z=setup();await z.flow.run('V3');const oldBatch=z.engine.state().batch;
 z.h.seq.videoTracks[3].clips.splice(0);z.h.seq.videoTracks.push(z.h.track('80'));
 z.captions=[{id:'90',muted:false,items:[]},{id:'91',muted:false,items:[]},{id:'92',muted:false,items:[{start:'50',end:'80',text:'New active captions'}]}];
 const fresh=await z.vis.capture(),flow2=createFlow(z.api,z.vis,()=>{});assert((await flow2.attach()).converted);
 await assert.rejects(()=>flow2.undo(),/Undo refused/);assert.deepStrictEqual(await z.vis.capture(),fresh);
 await flow2.run('V3');assert.notEqual(z.engine.state().batch,oldBatch);assert.equal(z.history.length,1);assert.equal(z.history[0].batch,oldBatch);
 assert.equal(z.engine.state().outputs[0].trackIndex,fresh.video.length);assert.equal(z.h.seq.videoTracks.at(-1).clips.length,1);
 await flow2.undo();assert.deepStrictEqual(await z.vis.capture(),fresh,'Latest Undo preserves all earlier outputs/edits');
 // Invalid new begin cannot roll back or replace the previous completed batch.
 const b=setup();await b.flow.run('V3');const intact=await b.vis.capture(),savedBatch=b.engine.state().batch;b.badHash();
 await assert.rejects(()=>b.flow.run('V3'),/hash mismatch/);assert.deepStrictEqual(await b.vis.capture(),intact);assert.equal(b.engine.state().batch,savedBatch);assert.equal(b.history.length,0);
 // Track-add may mutate then throw: reconcile the new empty highest track before cleanup.
 const a=setup(),aBefore=await a.vis.capture(),add=a.h.qs.addTracks;let adds=0;
 a.h.qs.addTracks=(...args)=>{add(...args);if(++adds===2)throw Error('Second add threw after mutation');};
 await assert.rejects(()=>a.flow.run('V3'),/Second add threw/);assert.deepStrictEqual(await a.vis.capture(),aBefore);assert.equal(a.engine.state().phase,'finished');
 // A track API error BEFORE mutation must also clean earlier owned lanes safely.
 for(const failAt of [1,2]){
  const n=setup(),nBefore=await n.vis.capture(),nativeAdd=n.h.qs.addTracks;let calls=0;
  n.h.qs.addTracks=(...args)=>{if(++calls===failAt)throw Error('Add refused without mutation');nativeAdd(...args);};
  await assert.rejects(()=>n.flow.run('V3'),/Add refused/);assert.deepStrictEqual(await n.vis.capture(),nBefore);assert(['finished','abandoned'].includes(n.engine.state().phase));
 }
 // Unknown clips in ANY owned track block cleanup before a single deletion.
 const u=setup();await u.flow.run('V3');const foreign={...u.h.seq.videoTracks[3].clips[0],nodeId:'foreign'};u.h.seq.videoTracks[3].clips.push(foreign);
 const count=u.h.seq.videoTracks[4].clips.length;assert(!u.h.run('removeOne').ok);assert.equal(u.h.seq.videoTracks[4].clips.length,count);
 console.log('PASS dynamic current caption tracks, overlapping sources on separate highest video tracks, mixed visibility Undo, partial hide rollback, changed timeline/new Convert, archived completed history, rejected begin safety, add-then-throw rollback and foreign-clip refusal (mocks).');
})().catch(e=>{console.error(e);process.exitCode=1;});
