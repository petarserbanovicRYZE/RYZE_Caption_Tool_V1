'use strict';
const {setText,textValue}=require('./text');const match=require('./match');
const templates={V3:['RYZE_Box_V3.mogrt','22e6acb94b560e24ba4b025afac6b989dc151100cf6f01bf87898513738757bd'],V5:['RYZE_Box_V5.mogrt','72418fd40cb4233cbd54a426a791732dca332af29094d6ace8d2e00d0b6f86b8'],Stroke:['RYZE_Stroke_V1.mogrt','21ad2731dd319a952c5cfb166b2cedf9e0ed06003b6b311b029e1159a24e1813']};
module.exports=function createEngine(io){
 let s=io.load?io.load():null; let restoredHost=false;let queued=[];
 const checkpoint=()=>{const t=Date.now();if(io.checkpoint)io.checkpoint(s);if(s&&s.profile)s.profile.checkpointMs+=Date.now()-t;};
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 function log(text){const t=Date.now();s.lines.push(text);io.append(s.folder,'report.txt',text+'\n');if(s.profile)s.profile.logMs+=Date.now()-t;}
 function event(kind,value){const t=Date.now();io.append(s.folder,'journal.ndjson',JSON.stringify({time:new Date().toISOString(),kind,value})+'\n');if(s.profile)s.profile.logMs+=Date.now()-t;}
 function state(){return s?{batch:s.batch,phase:s.phase,folder:s.folder,lines:s.lines.slice(),base:s.base,next:s.next,total:s.plan?s.plan.length:0,hideAttempted:s.hideAttempted,owned:s.owned,output:s.output,outputs:s.outputs,fast:s.fast,conversionMs:s.conversionMs,cleanupMs:s.cleanupMs}: {phase:'idle',lines:[]};}
 async function host(method,...args){const started=Date.now();const r=await io.host(method,...args);const m=s.timing[method]||(s.timing[method]={calls:0,totalMs:0});m.calls++;m.totalMs+=Date.now()-started;if(s.profile){s.profile.bridgeMs+=Date.now()-started;for(const key of Object.keys(r.perf||{})){const target=s.profile.host[key]||(s.profile.host[key]={calls:0,ms:0});target.calls+=r.perf[key].calls;target.ms+=r.perf[key].ms;}}event(method,r);if(!r.ok)throw Error(method+': '+r.error);return r;}
 async function inspect(id){for(let i=0;i<12;i++){try{return(await host('inspectClip',id)).clip;}catch(e){if(!String(e).includes('not ready')||i===11)throw e;await io.pause(500);}}}
 async function begin(a){
  const beginStarted=Date.now();
  if(s&&!['finished','abandoned','converted'].includes(s.phase))throw Error('An unfinished batch must be recovered first');
  if(!a||!Object.prototype.hasOwnProperty.call(templates,a.template)||typeof a.fast!=='boolean'||typeof a.fault!=='boolean'||!a.base||typeof a.base.name!=='string')throw Error('Invalid preparation');
  const populated=a.base.caption.filter(t=>t.items.length);if(!populated.length||populated.some(t=>typeof t.muted!=='boolean'))throw Error('Invalid caption baseline');
  const definition=templates[a.template],mogrt=io.templatePath(definition[0]);if(io.hash(mogrt)!==definition[1])throw Error('Bundled MOGRT hash mismatch');
  // Archive completed history before replacing its checkpoint. No timeline edits here.
  if(s&&s.phase==='converted'){if(!io.archive)throw Error('Session archiving unavailable');io.archive(s);}
  restoredHost=false;queued=[];
  s={batch:io.id(),phase:'interrupted',lines:[],base:a.base};checkpoint();
  const batch=s.batch;
  const prep=await io.host('prepare');if(!prep.ok)throw Error(prep.error);
  s={batch,phase:'preparing',folder:prep.folder,prep,base:a.base,template:a.template,fault:a.fault,fast:a.fast,started:beginStarted,grouped:a.grouped===true,profile:{preparationMs:Date.now()-beginStarted,host:{},bridgeMs:0,checkpointMs:0,logMs:0,groups:0},timing:{},importNativeMs:0,fusedCards:0,fallbackCards:0,lines:[],owned:false,hideAttempted:false,next:0,verified:[],mogrt};
  event('batch_begin',{batch:s.batch,base:s.base,template:a.template,fault:a.fault});
  log('RYZE_CAPTION_TOOL_V1 / '+new Date().toISOString()+' / '+s.template+' / '+(s.fault?'FAULT CHECK':'FULL CONVERSION'));
  try{
   const parseStart=Date.now();s.before=io.snapshot(prep.snapshot.path,prep.sequenceID);match(a.base,{ok:true,bridge:'RYZE08',captions:s.before});s.profile.captionReadMs=Date.now()-parseStart;
   const tracks=s.before.tracks.filter(t=>t.cues.length);s.outputs=[];s.sourceTracks=tracks.map(t=>t.index);s.plan=[];
   tracks.forEach((track,lane)=>{if(track.frameTicks!==prep.timebase)throw Error('Frame duration mismatch');s.plan.push(...io.plan(track.cues,track.frameTicks).map(card=>({...card,lane})));});if(!s.plan.length)throw Error('No captions to convert');if(s.plan.length>500)throw Error('V1 candidate supports up to 500 generated captions per batch');
   io.write(s.folder,'captions-before.json',s.before);io.write(s.folder,'conversion-plan.json',s.plan);
   log('BUILD = 1.0.7');log('MODE = '+(s.grouped?'GROUPED_FAST':s.fast?'FUSED_FAST':'BASELINE'));log('SOURCE_CUES = '+tracks.reduce((n,t)=>n+t.cues.length,0)+'; PLANNED_MOGRTS = '+s.plan.length+'; TRACKS = '+tracks.map(t=>'C'+(t.index+1)).join(', '));s.phase='ready';
  }catch(e){s.phase='failed';log('PREPARATION_STOP = '+String(e));throw e;}
  return state();
 }
 async function step(){
  if(!['ready','converting'].includes(s.phase))throw Error('Wrong conversion phase');
  try{
   while(s.outputs.length<s.sourceTracks.length){await host('add');const added=await host('checkAdded');if(added.noAdded)throw Error('Track addition created no track');s.owned=true;s.outputs.push({trackIndex:added.newTrackIndex,trackID:added.newTrackID,count:0,sourceTrackIndex:s.sourceTracks[s.outputs.length]});s.output=s.outputs[0];log('VERIFIED_NEW_HIGHEST_TRACK = V'+(added.newTrackIndex+1));checkpoint();}
   const card=s.plan[s.next];if(!card)throw Error('No remaining card');s.phase='converting';
   log('Converting '+(s.next+1)+'/'+s.plan.length+' — '+JSON.stringify(card.top)+' / '+JSON.stringify(card.bottom));
   const fused=s.fast&&s.textDefaults&&!(s.fault&&s.next===2);
   const imported=queued.length?queued.shift():(fused?await host('importSet',s.mogrt,card.startTicks,card.endTicks,s.textDefaults.topRaw,s.textDefaults.bottomRaw,setText(s.textDefaults.topRaw,card.top),setText(s.textDefaults.bottomRaw,card.bottom),card.lane):await host(s.fast?'importInspect':'importCard',s.mogrt,card.startTicks,card.endTicks,card.lane));
   s.importNativeMs+=imported.importMs||0;
   // Throw only after the third import has been ownership-journaled, before text/trim.
   if(s.fault&&s.next===2){s.injected=true;event('fault_injected',{id:imported.id});throw Error('RYZE_EXPECTED_FAILURE_AFTER_THIRD_IMPORT');}
   let actual;
   if(imported.fused){actual=imported.clip;s.fusedCards++;}else{
    if(fused)s.fallbackCards++;
    const original=imported.clip||await inspect(imported.id);if(original.start!==card.startTicks)throw Error('Imported start mismatch');
    const top=setText(original.topRaw,card.top),bottom=setText(original.bottomRaw,card.bottom);
    s.textDefaults={topRaw:original.topRaw,bottomRaw:original.bottomRaw};
    actual=(await host('setClip',imported.id,top,bottom,card.endTicks,s.fast)).clip;
   }
   if(actual.start!==card.startTicks||actual.end!==card.endTicks||textValue(actual.topRaw)!==card.top||textValue(actual.bottomRaw)!==card.bottom)actual=await inspect(imported.id);
   if(actual.start!==card.startTicks||actual.end!==card.endTicks||textValue(actual.topRaw)!==card.top||textValue(actual.bottomRaw)!==card.bottom||typeof actual.motionScale!=='number'||Math.abs(actual.motionScale-80)>0.000001)throw Error('Text/timing/scale readback mismatch');
   s.verified.push(actual);event('card_verified',actual);s.next++;s.outputs[card.lane].count++;return state();
  }catch(e){s.phase='failed';log('CONVERSION_STOP = '+String(e));throw e;}
 }
 async function stepGroup(){
  if(!s.grouped||!s.fast||s.fault||!s.textDefaults)return step();
  if(!['ready','converting'].includes(s.phase)||s.next>=s.plan.length)throw Error('Wrong grouped phase');
  try{
   const cards=s.plan.slice(s.next,s.next+3),rows=cards.map(c=>[c.startTicks,c.endTicks,c.lane,setText(s.textDefaults.topRaw,c.top),setText(s.textDefaults.bottomRaw,c.bottom)].map(x=>encodeURIComponent(String(x))).join('|')).join('\n');
   const result=await host('importBatch',s.mogrt,s.textDefaults.topRaw,s.textDefaults.bottomRaw,rows);
   if(!Array.isArray(result.results)||!result.results.length||result.results.length>cards.length)throw Error('Invalid grouped response');
   s.profile.groups++;queued=result.results.slice();
   while(queued.length){await step();checkpoint();}
   return state();
  }catch(e){queued=[];s.phase='failed';log('GROUP_STOP = '+String(e));throw e;}
 }
 async function guard(){if(s.fast){const all=(await host('inspectAll')).clips;if(!equal(all,s.verified))throw Error('Generated clip changed; refusing Undo');}else{await host('guard');for(const prior of s.verified){const actual=await inspect(prior.id);if(!equal(actual,prior))throw Error('Generated clip changed; refusing Undo');}}}
 async function complete(){
  if(s.phase!=='converting'||s.fault||s.next!==s.plan.length)throw Error('Incomplete conversion');
  await host('guard');const done=await host('complete'),after=io.snapshot(done.snapshot.path,s.prep.sequenceID);
  if(!equal(after,s.before))throw Error('Native captions changed during conversion');
  log('CONVERSION_READBACK_PASS = true');log('ALL_MOTION_SCALE_80_VERIFIED = true');log('ORIGINAL_CAPTIONS_UNCHANGED = true');s.phase='awaiting_visibility';s.conversionMs=Date.now()-s.started;log('CONVERSION_WALL_MS = '+s.conversionMs);log('PREMIERE_IMPORT_MS = '+s.importNativeMs);log('FUSED_CARDS = '+s.fusedCards+'; SAFE_FALLBACK_CARDS = '+s.fallbackCards);io.write(s.folder,'host-times.json',s.timing);if(s.profile){log('PERFORMANCE = '+JSON.stringify(s.profile));io.write(s.folder,'performance.json',s.profile);}return state();
 }
 async function cleanup(label){const cleanupStart=Date.now();
  if(s.hideAttempted)throw Error('Restore original caption visibility before deleting output');
  let hs=await host('status');
  if(hs.state&&hs.state.phase==='add_attempted'){const a=await host('checkAdded');if(!a.noAdded){s.owned=true;if(!s.outputs)s.outputs=[];s.outputs.push({trackIndex:a.newTrackIndex,trackID:a.newTrackID,count:0});s.output=s.outputs[0];}hs=await host('status');}
  if(!s.owned){if(hs.state&&hs.state.phase==='prepared'){await host('cancelPrepared');s.phase='abandoned';return state();}throw Error('Unverified ownership; cleanup stopped');}
  log(label+': removing only recorded clips and the verified new empty highest track.');
  let n=(await host('remaining')).count;while(n>0){if(s.fast){const r=await host('removeChunk');if(r.count>=n||r.removed!==n-r.count)throw Error('Chunk removal count mismatch');n=r.count;}else{await host('removeOne');const next=(await host('remaining')).count;if(next!==n-1)throw Error('Clip removal count mismatch');n=next;}}
  await host('removeOne');await host('remove');const end=await host('finish');const after=io.snapshot(end.snapshot.path,s.prep.sequenceID);
  if(!end.avRestored||!equal(after,s.before))throw Error('Original timeline/captions did not restore');
  io.write(s.folder,'captions-after.json',after);s.owned=false;s.phase='finished';log(label+'_TIMELINE_RESTORED = true');log('ORIGINAL_CAPTIONS_UNCHANGED = true');
  s.cleanupMs=Date.now()-cleanupStart;log('CLEANUP_WALL_MS = '+s.cleanupMs);io.write(s.folder,'host-times.json',s.timing);if(s.injected)log('INJECTED_FAILURE_ROLLBACK_PASS = true');event('finished',state());return state();
 }
 async function dispatchInner(op,a){
  if(op==='begin')return begin(a);
  if(op==='status')return state();
  if(!s||!a||a.batch!==s.batch)throw Error('Batch identity mismatch');
  if(op==='step')return step();
  if(op==='stepGroup')return stepGroup();
  if(op==='complete')return complete();
  if(op==='undoCheck'){if(!restoredHost&&io.restoreHost){await io.restoreHost(s.folder);restoredHost=true;}if(s.phase!=='converted')throw Error('Batch is not ready for Undo');await guard();return state();}
  if(op==='hideIntent'){if(s.phase!=='awaiting_visibility')throw Error('Wrong hide phase');event('hide_intent',{base:s.base});s.hideAttempted=true;s.phase='hiding';return state();}
  if(op==='hideAck'){if(s.phase!=='hiding'||a.muted!==true)throw Error('Invalid hide acknowledgment');event('hide_readback',{muted:true});s.phase='converted';log('SOURCE_CAPTION_HIDDEN_AFTER_SUCCESS = true');return state();}
  if(op==='restored'){if(!['hiding','converted','awaiting_visibility','failed'].includes(s.phase))throw Error('Wrong restore phase');const originals=s.base.caption.filter(t=>t.items.length).map(t=>({id:t.id,muted:t.muted}));if(a.states?!equal(a.states,originals):(originals.length!==1||a.muted!==originals[0].muted))throw Error('Wrong restored state');event('original_visibility_restored',{states:originals});s.hideAttempted=false;log('ORIGINAL_VISIBILITY_RESTORED = true');return state();}
  if(op==='undo'){if(s.phase!=='converted')throw Error('Wrong Undo phase');await host('guard');return cleanup('UNDO');}
  if(op==='rollback')return cleanup('ROLLBACK');
  throw Error('Unknown operation');
 }
 async function dispatch(op,a){if(op==='exportReport'){const text=require('./report')(a&&a.report,s),r=await io.host('exportBugReport',text);if(!r.ok)throw Error(r.error);return {reportPath:r.path};}try{const result=await dispatchInner(op,a);checkpoint();return result;}catch(e){checkpoint();throw e;}}
 return {dispatch,state};
};
