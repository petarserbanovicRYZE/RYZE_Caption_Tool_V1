/* ES3. V1 candidate conversion core: snapshot, verified highest
   track, owned MOGRT imports/text/trim, guarded batch removal, snapshot.
   Caption visibility is handled by UXP. Full crash recovery and project-bin cleanup are not implemented. */
var RYZEV1 = {state:null};
RYZEV1.json=function(v){
 function q(s){return '"'+String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/[\x00-\x1f\u2028\u2029]/g,function(c){return '\\u'+('0000'+c.charCodeAt(0).toString(16)).slice(-4);})+'"';}
 if(v===null||typeof v==='undefined')return 'null';
 if(typeof v==='string')return q(v);
 if(typeof v==='boolean'||typeof v==='number')return String(v);
 var a=[],k,i;if(v instanceof Array){for(i=0;i<v.length;i++)a.push(RYZEV1.json(v[i]));return '['+a.join(',')+']';}
 for(k in v)if(v.hasOwnProperty(k))a.push(q(k)+':'+RYZEV1.json(v[k]));return '{'+a.join(',')+'}';
};
// Compare the same measured fields directly, without allocating large JSON strings.
RYZEV1.same=function(a,b){
 if(a===b)return true;
 if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return false;
 var aa=a instanceof Array,bb=b instanceof Array,i,k,countA=0,countB=0;
 if(aa!==bb)return false;
 if(aa){if(a.length!==b.length)return false;for(i=0;i<a.length;i++)if(!RYZEV1.same(a[i],b[i]))return false;return true;}
 for(k in a)if(a.hasOwnProperty(k)){countA++;if(!b.hasOwnProperty(k)||!RYZEV1.same(a[k],b[k]))return false;}
 for(k in b)if(b.hasOwnProperty(k))countB++;
 return countA===countB;
};
RYZEV1.trackSnapshot=function(tr){
 var a={id:String(tr.id),name:String(tr.name),clips:[],mute:null,lock:null},clips=tr.clips,n=clips.numItems,c,it;
 if(typeof tr.isMuted==='function')a.mute=Boolean(tr.isMuted());
 if(typeof tr.isLocked==='function')a.lock=Boolean(tr.isLocked());
 for(c=0;c<n;c++){it=clips[c];a.clips.push({id:String(it.nodeId),start:String(it.start.ticks),end:String(it.end.ticks),inPoint:String(it.inPoint.ticks),outPoint:String(it.outPoint.ticks),disabled:Boolean(it.disabled)});}
 return a;
};
RYZEV1.snapshot=function(seq){
 var out={video:[],audio:[]},groups=[seq.videoTracks,seq.audioTracks],keys=['video','audio'],g,t,n,seen,id;
 for(g=0;g<groups.length;g++){
  seen={};n=groups[g].numTracks;
  for(t=0;t<n;t++){
   id=String(groups[g][t].id);if(id==='undefined'||id==='null'||seen['id'+id])throw Error('Track identity unavailable or ambiguous');seen['id'+id]=true;
   out[keys[g]].push(RYZEV1.trackSnapshot(groups[g][t]));
  }
 }
 return out;
};
// Valid ONLY inside one synchronous importBatch invocation. No cache crosses a host call.
RYZEV1.checkTopology=function(seq,expected){
 var groups=[seq.videoTracks,seq.audioTracks],records=[expected.video,expected.audio],g,i;
 for(g=0;g<groups.length;g++){
  if(groups[g].numTracks!==records[g].length)throw Error('Track count changed within group');
  for(i=0;i<records[g].length;i++)if(String(groups[g][i].id)!==records[g][i].id)throw Error('Track identity changed within group');
 }
};
RYZEV1.outputSnapshot=function(seq,prior){
 RYZEV1.checkTopology(seq,prior);
 var out={video:prior.video.slice(0),audio:prior.audio},tracks=RYZEV1.tracks(),i;
 for(i=0;i<tracks.length;i++)out.video[tracks[i].trackIndex]=RYZEV1.trackSnapshot(seq.videoTracks[tracks[i].trackIndex]);
 return out;
};
RYZEV1.current=function(){
 var s=RYZEV1.state;
 if(!s||String(app.project.path)!==s.projectPath||!app.project.activeSequence||String(app.project.activeSequence.sequenceID)!==s.sequenceID)throw Error('Active project/sequence changed; stopped');
 return app.project.activeSequence;
};
RYZEV1.exportSnapshot=function(seq,name){
 var s=RYZEV1.state,f=new File(s.folder+'/'+name);
 if(f.exists)throw Error('Refusing snapshot overwrite');
 var result=seq.exportAsProject(f.fsName);f=new File(f.fsName);
 if(!f.exists||f.length<1)throw Error('Snapshot export did not create a file');
 return {path:f.fsName,bytes:f.length,returnValue:String(result)};
};
RYZEV1.prepare=function(){
 try{
  if(RYZEV1.state && RYZEV1.state.phase!=='finished'&&RYZEV1.state.phase!=='converted')throw Error('An unfinished batch must be recovered before another run.');
  var seq=app.project.activeSequence;if(!seq)throw Error('No active sequence');
  if(String(app.version)!=='26.5.1')throw Error('This V1 candidate is validated only on Premiere 26.5.1.');
  if(!String(app.project.path))throw Error('Save the project before converting.');
  var baseline=RYZEV1.snapshot(seq);if(!baseline.video.length)throw Error('Test requires an existing video track');
  var folder=new Folder(Folder.desktop.fsName+'/RYZE_Caption_Tool_V1_'+new Date().getTime()+'_'+Math.floor(Math.random()*1000000));
  if(folder.exists||!folder.create())throw Error('Cannot create a new diagnostic folder');
  RYZEV1.state={phase:'prepared',folder:folder.fsName,projectPath:String(app.project.path),sequenceID:String(seq.sequenceID),baseline:baseline};
  var exported=RYZEV1.exportSnapshot(seq,'before.prproj');
  return RYZEV1.json({ok:true,folder:folder.fsName,sequenceID:seq.sequenceID,host:String(app.version),timebase:String(seq.timebase),baseline:baseline,snapshot:exported});
 }catch(e){return RYZEV1.json({ok:false,error:String(e)});}
};
RYZEV1.add=function(){
 try{
  var seq=RYZEV1.current(),s=RYZEV1.state;
  if(s.phase!=='prepared'&&s.phase!=='verified_added')throw Error('Invalid add phase');
  var before=RYZEV1.snapshot(seq),expected=s.added||s.baseline;
  if(!RYZEV1.same(expected,before))throw Error('Timeline changed before track addition');
  app.enableQE();var qeSeq=qe.project.getActiveSequence();if(!qeSeq)throw Error('QE sequence unavailable');
  // Only the active sequence is requested from each DOM; no QE sequence lookup guessing.
  if(String(qeSeq.name)!==String(seq.name))throw Error('QE/standard DOM sequence name mismatch');
  var qid=String(qeSeq.guid).replace(/[{}]/g,'').toLowerCase(),sid=String(seq.sequenceID).replace(/[{}]/g,'').toLowerCase();
  if(qid!==sid)throw Error('QE/standard sequence GUID mismatch: '+qid+' vs '+sid);
  if(typeof qeSeq.addTracks==='undefined'||typeof qeSeq.removeVideoTrack==='undefined')throw Error('Track API unavailable');
  s.beforeAdd=before;s.phase='add_attempted';s.args=[1,before.video.length,0];RYZEV1.persist();
  var value=qeSeq.addTracks(1,before.video.length,0);
  return RYZEV1.json({ok:true,args:s.args,returnValue:String(value)});
 }catch(e){return RYZEV1.json({ok:false,error:String(e),phase:RYZEV1.state?RYZEV1.state.phase:null});}
};
RYZEV1.checkAdded=function(){
 try{
  var seq=RYZEV1.current(),s=RYZEV1.state,now=RYZEV1.snapshot(seq),before=s.beforeAdd||s.baseline,n=before.video.length,i;
  if(s.phase!=='add_attempted')throw Error('Invalid test phase');
  if(RYZEV1.same(now,before)){s.phase=s.ownedTracks&&s.ownedTracks.length?'verified_added':'prepared';s.beforeAdd=null;RYZEV1.persist();return RYZEV1.json({ok:true,noAdded:true});}
  if(now.video.length!==n+1||!RYZEV1.same(now.audio,before.audio))throw Error('Unexpected track counts or audio change; no track removed');
  for(i=0;i<n;i++)if(!RYZEV1.same(now.video[i],before.video[i]))throw Error('Original video tracks changed; no track removed');
  if(now.video[n].clips.length)throw Error('New highest track contains clips; no track removed');
  for(i=0;i<n;i++)if(now.video[n].id===before.video[i].id)throw Error('Highest track identity not new');
  s.added=now;s.expected=now;s.newTrackID=now.video[n].id;s.newTrackIndex=n;
  if(!s.ownedTracks)s.ownedTracks=[];s.ownedTracks.push({trackIndex:n,trackID:s.newTrackID});s.phase='verified_added';RYZEV1.persist();
  return RYZEV1.json({ok:true,highestTrackVerified:true,newTrackIndex:n,newTrackID:s.newTrackID,afterAdd:now});
 }catch(e){return RYZEV1.json({ok:false,error:String(e),observed:typeof now==='undefined'?null:now});}
};
RYZEV1.tracks=function(){var s=RYZEV1.state;return s.ownedTracks||[{trackIndex:s.newTrackIndex,trackID:s.newTrackID}];};
RYZEV1.remove=function(){
 try{
  var seq=RYZEV1.current(),s=RYZEV1.state,now=RYZEV1.snapshot(seq),tracks=RYZEV1.tracks(),i,t;
  if(s.phase!=='verified_added'||!RYZEV1.same(now,s.added))throw Error('Timeline changed; no track removed');
  var qeSeq=qe.project.getActiveSequence();if(!qeSeq||String(qeSeq.name)!==String(seq.name)||String(qeSeq.guid).replace(/[{}]/g,'').toLowerCase()!==String(seq.sequenceID).replace(/[{}]/g,'').toLowerCase())throw Error('QE sequence mismatch');
  for(i=tracks.length-1;i>=0;i--){
   t=tracks[i];
   if(t.trackIndex!==now.video.length-1||now.video[t.trackIndex].id!==t.trackID||now.video[t.trackIndex].clips.length)throw Error('Removal target not proven empty/new/highest');
   s.phase='remove_attempted';s.intent={operation:'remove_track',trackID:t.trackID,trackIndex:t.trackIndex};RYZEV1.persist();
   qeSeq.removeVideoTrack(t.trackIndex);
   var expected={video:now.video.slice(0,-1),audio:now.audio};now=RYZEV1.snapshot(seq);
   if(!RYZEV1.same(now,expected))throw Error('Track removal changed unexpected state');
   s.removedTrackCount=(s.removedTrackCount||0)+1;RYZEV1.persist();
  }
  return RYZEV1.json({ok:true,removedTracks:tracks.length});
 }catch(e){return RYZEV1.json({ok:false,error:String(e)});}
};
RYZEV1.finish=function(){
 try{
  var seq=RYZEV1.current(),s=RYZEV1.state,now=RYZEV1.snapshot(seq);
  if(s.phase!=='remove_attempted')throw Error('Invalid test phase');
  var same=RYZEV1.same(now,s.baseline);
  var exported=RYZEV1.exportSnapshot(seq,'after.prproj');s.phase='finished';
  return RYZEV1.json({ok:same,avRestored:same,after:now,snapshot:exported,error:same?null:'AV state did not return to baseline'});
 }catch(e){return RYZEV1.json({ok:false,error:String(e)});}
};
/* Conversion experiment. Journal an import intent before import and its item ID
   before any text write or trim. Host returns raw properties for strict JS JSON parsing. */
RYZEV1.writeJournal=function(path,value){
 var f=new File(path);f.encoding='UTF-8';
 if(!f.open('w'))throw Error('Cannot write host journal');
 var ok=false,closed;
 try{ok=f.write(RYZEV1.json(value));}finally{closed=f.close();}
 if(!ok||closed===false)throw Error('Host journal write failed');
};
RYZEV1.persist=function(){
 var s=RYZEV1.state,baselinePath=s.folder+'/host-baseline.json';
 // The baseline is immutable and stored before any import. Never rewrite it per card.
 if(s.phase==='converting'&&RYZEV1.baselineFolder!==s.folder){
  if(new File(baselinePath).exists)throw Error('Refusing baseline journal overwrite');
  RYZEV1.writeJournal(baselinePath,{schema:1,projectPath:s.projectPath,sequenceID:s.sequenceID,baseline:s.baseline});
  RYZEV1.baselineFolder=s.folder;
 }
 var value=s;
 if(s.phase==='converting'){
  // Persist every existing intent and owned clip ID, without four repeated AV snapshots.
  // Interrupted conversion stays blocked. Completed checkpoints remain full/legacy compatible.
  value={journalSchema:2,phase:s.phase,folder:s.folder,projectPath:s.projectPath,sequenceID:s.sequenceID,baselineFile:'host-baseline.json',ownedTracks:RYZEV1.tracks(),newTrackID:s.newTrackID,newTrackIndex:s.newTrackIndex,created:s.created||[],intent:s.intent||null};
 }
 RYZEV1.writeJournal(s.folder+'/host-state.json',value);
};
RYZEV1.assertOriginals=function(seq){
 var s=RYZEV1.state,now=RYZEV1.snapshot(seq),n=s.baseline.video.length,i;
 var tracks=RYZEV1.tracks();
 if(now.video.length!==n+tracks.length)throw Error('Owned highest track count changed');
 for(i=0;i<tracks.length;i++)if(tracks[i].trackIndex!==n+i||now.video[n+i].id!==tracks[i].trackID)throw Error('Owned highest track identity changed');
 if(!RYZEV1.same(now.audio,s.baseline.audio))throw Error('Original audio state changed');
 for(i=0;i<n;i++)if(!RYZEV1.same(now.video[i],s.baseline.video[i]))throw Error('Original video state changed');
 return now;
};
RYZEV1.owned=function(seq,id){
 var s=RYZEV1.state,tracks=RYZEV1.tracks(),tr,i,j,known=false;
 for(i=0;s.created&&i<s.created.length;i++)if(s.created[i].id===String(id))known=true;
 if(!known)throw Error('Clip ID is not recorded as owned');
 for(j=0;j<tracks.length;j++){
  tr=seq.videoTracks[tracks[j].trackIndex];
  if(!tr||String(tr.id)!==tracks[j].trackID)throw Error('Owned track missing');
  for(i=0;i<tr.clips.numItems;i++)if(String(tr.clips[i].nodeId)===String(id))return tr.clips[i];
 }
 throw Error('Owned clip not found: '+id);
};
RYZEV1.motionScale=function(item){
 var comps=item.components,found=null,i,j,scale=null,count=0;
 if(!comps)throw Error('TrackItem components unavailable for Motion Scale');
 for(i=0;i<comps.numItems;i++)if(String(comps[i].matchName)==='AE.ADBE Motion'){
  if(found)throw Error('Ambiguous intrinsic Motion component');found=comps[i];
 }
 if(!found||!found.properties)throw Error('Intrinsic AE.ADBE Motion component unavailable');
 // Resolve the exact exposed control, never a guessed property index or MOGRT scale.
 for(j=0;j<found.properties.numItems;j++)if(String(found.properties[j].displayName)==='Scale'){scale=found.properties[j];count++;}
 if(count!==1)throw Error('Expected exactly one Motion > Scale control');
 if(typeof scale.isTimeVarying!=='function'||scale.isTimeVarying())throw Error('Motion Scale animation state unavailable or animated');
 var value=scale.getValue();if(typeof value!=='number'||!isFinite(value))throw Error('Motion Scale is not a finite number');
 return {param:scale,value:value};
};
RYZEV1.raw=function(item){
 var c=item.getMGTComponent();if(!c||!c.properties)throw Error('MGT component not ready');
 var t=c.properties.getParamForDisplayName('Top Text'),b=c.properties.getParamForDisplayName('Bottom Text');
 if(!t||!b)throw Error('Top Text / Bottom Text control missing');
 var props=[],i;
 for(i=0;i<c.properties.numItems;i++)props.push(String(c.properties[i].displayName));
 return {id:String(item.nodeId),start:String(item.start.ticks),end:String(item.end.ticks),topRaw:String(t.getValue()),bottomRaw:String(b.getValue()),properties:props,motionScale:RYZEV1.motionScale(item).value};
};
RYZEV1.importResult=function(encodedPath,encodedStart,encodedEnd,encodedLane,groupContext){
 var s=RYZEV1.state,item=null,err=null,now=null;
 try{
  var seq=RYZEV1.current();if(s.phase!=='verified_added'&&s.phase!=='converting')throw Error('Wrong import phase');
  if(groupContext&&groupContext.before){now=groupContext.before;RYZEV1.checkTopology(seq,now);}else now=RYZEV1.assertOriginals(seq);
  if(s.expected && !RYZEV1.same(now,s.expected))throw Error('Conversion track changed outside extension');
  if(!s.created)s.created=[];
  var path=decodeURIComponent(encodedPath),start=decodeURIComponent(encodedStart),end=decodeURIComponent(encodedEnd),f=new File(path);
  if(!f.exists||!/^\d+$/.test(start)||!/^\d+$/.test(end))throw Error('Invalid import request');
  var lane=Number(decodeURIComponent(encodedLane||'0')),tracks=RYZEV1.tracks();
  if(lane<0||lane!==Math.floor(lane)||lane>=tracks.length)throw Error('Invalid output lane');
  var targetIndex=tracks[lane].trackIndex,priorClips=now.video[targetIndex].clips;
  s.phase='converting';s.intent={operation:'import',trackIndex:targetIndex,beforeIDs:[],start:start,end:end};
  var tr=seq.videoTracks[targetIndex],i;for(i=0;i<tr.clips.numItems;i++)s.intent.beforeIDs.push(String(tr.clips[i].nodeId));
  RYZEV1.persist();
  var importStart=new Date().getTime();try{item=seq.importMGT(f.fsName,start,targetIndex,0);}catch(importError){err=String(importError);}var importMs=new Date().getTime()-importStart;RYZEV1.measure('importMGT',importMs);
  // Reconcile the isolated track even when import throws or returns null.
  var fresh=[];tr=seq.videoTracks[targetIndex];
  for(i=0;i<tr.clips.numItems;i++){
   var id=String(tr.clips[i].nodeId),known=false,j;
   for(j=0;j<s.intent.beforeIDs.length;j++)if(s.intent.beforeIDs[j]===id)known=true;
   if(!known)fresh.push(id);
  }
  for(i=0;i<fresh.length;i++)s.created.push({id:fresh[i],start:start,end:end,trackIndex:targetIndex});
  s.intent.resultIDs=fresh;RYZEV1.persist();
  if(err)throw Error(err);
  if(!item||fresh.length!==1||String(item.nodeId)!==fresh[0])throw Error('Import result does not match one new owned clip');
  var afterImport=groupContext?RYZEV1.outputSnapshot(seq,now):RYZEV1.assertOriginals(seq),kept=[];
  for(i=0;i<afterImport.video[targetIndex].clips.length;i++){var oldClip=afterImport.video[targetIndex].clips[i];if(oldClip.id!==fresh[0])kept.push(oldClip);}
  if(!RYZEV1.same(kept,priorClips))throw Error('Import changed previously created clips');
  for(i=0;i<now.video.length;i++)if(i!==targetIndex&&!RYZEV1.same(now.video[i],afterImport.video[i]))throw Error('Import changed another track');
  s.expected=afterImport;RYZEV1.persist();
  return {ok:true,id:String(item.nodeId),importMs:importMs};
 }catch(e){return {ok:false,error:String(e),created:s?s.created:null};}
};
RYZEV1.importCard=function(p,a,b,lane){return RYZEV1.json(RYZEV1.importResult(p,a,b,lane));};
RYZEV1.inspectClip=function(encodedID){
 try{var seq=RYZEV1.current();RYZEV1.assertOriginals(seq);return RYZEV1.json({ok:true,clip:RYZEV1.raw(RYZEV1.owned(seq,decodeURIComponent(encodedID)))});}
 catch(e){return RYZEV1.json({ok:false,error:String(e)});}
};
RYZEV1.setClipResult=function(encodedID,encodedTop,encodedBottom,encodedEnd,encodedFast,importVerified){
 try{
  var seq=RYZEV1.current(),s=RYZEV1.state,id=decodeURIComponent(encodedID),it=RYZEV1.owned(seq,id),c=it.getMGTComponent();
  // Only importSet supplies this flag, immediately after the import's full guard, in the SAME synchronous call.
  if(!importVerified){var now=RYZEV1.assertOriginals(seq);if(!RYZEV1.same(now,s.expected))throw Error('Timeline changed before text write');}
  var scale=RYZEV1.motionScale(it);
  s.intent={operation:'text_trim_and_scale',id:id,scaleBefore:scale.value,scaleTarget:80};RYZEV1.persist();
  var editStart=new Date().getTime();
  c.properties.getParamForDisplayName('Top Text').setValue(decodeURIComponent(encodedTop),decodeURIComponent(encodedFast||'')!=='true');
  c.properties.getParamForDisplayName('Bottom Text').setValue(decodeURIComponent(encodedBottom),decodeURIComponent(encodedFast||'')!=='true');
  RYZEV1.measure('textWrite',new Date().getTime()-editStart);editStart=new Date().getTime();
  var tm=new Time();tm.ticks=decodeURIComponent(encodedEnd);it.end=tm;
  RYZEV1.measure('trim',new Date().getTime()-editStart);editStart=new Date().getTime();
  scale.param.setValue(80,!importVerified);
  RYZEV1.measure('scaleWrite',new Date().getTime()-editStart);
  var scaleAfter=RYZEV1.motionScale(it).value;
  if(Math.abs(scaleAfter-80)>0.000001)throw Error('Motion Scale readback mismatch: '+scaleAfter);
  s.expected=RYZEV1.assertOriginals(seq);s.intent=null;RYZEV1.persist();
  return {ok:true,clip:RYZEV1.raw(it)};
 }catch(e){return {ok:false,error:String(e)};}
};
RYZEV1.setClip=function(id,top,bottom,end,fast){return RYZEV1.json(RYZEV1.setClipResult(id,top,bottom,end,fast,false));};
// Fuse import + text + trim + scale after matching this instance's actual text schema.
// No cached assumptions are used if the component is delayed or its defaults differ.
RYZEV1.importSetResult=function(p,a,b,expectedTop,expectedBottom,top,bottom,lane,groupContext){
 var started=new Date().getTime(),r=RYZEV1.importResult(p,a,b,lane,groupContext);if(!r.ok)return r;
 try{
  var original=RYZEV1.raw(RYZEV1.owned(RYZEV1.current(),r.id));
  if(original.start!==decodeURIComponent(a))throw Error('Imported start mismatch');
  if(original.topRaw!==decodeURIComponent(expectedTop)||original.bottomRaw!==decodeURIComponent(expectedBottom)){r.clip=original;r.fallback='instance defaults differ';if(groupContext)RYZEV1.verifyGroupBoundary();return r;}
  var edited=RYZEV1.setClipResult(encodeURIComponent(r.id),top,bottom,b,'true',true);
  edited.id=r.id;edited.importMs=r.importMs;edited.fused=true;edited.hostMs=new Date().getTime()-started;
  if(groupContext&&edited.ok)groupContext.before=RYZEV1.state.expected;
  return edited;
 }catch(e){
  if(String(e).indexOf('not ready')<0)return {ok:false,error:String(e),id:r.id};
  if(groupContext){try{RYZEV1.verifyGroupBoundary();}catch(checkError){return {ok:false,error:String(checkError),id:r.id};}}r.pending=true;return r;
 }
};
RYZEV1.importSet=function(p,a,b,et,eb,t,bottom,lane){return RYZEV1.json(RYZEV1.importSetResult(p,a,b,et,eb,t,bottom,lane));};
// Up to three independent imports per host call. Keep every per-clip journal/guard.
RYZEV1.verifyGroupBoundary=function(){
 var actual=RYZEV1.assertOriginals(RYZEV1.current());
 if(!RYZEV1.same(actual,RYZEV1.state.expected))throw Error('Timeline changed within group');
 RYZEV1.state.expected=actual;
};
RYZEV1.importBatch=function(p,et,eb,encodedRows){
 var started=new Date().getTime(),out=[],rows=decodeURIComponent(encodedRows).split('\n'),i,fields,r,groupContext={before:null};
 try{
  if(!rows.length||rows.length>3)throw Error('Invalid group size');
  for(i=0;i<rows.length;i++){
   fields=rows[i].split('|');if(fields.length!==5)throw Error('Invalid grouped card');
   // Fields are individually URI encoded, with no JSON parser/eval requirement.
   r=RYZEV1.importSetResult(p,fields[0],fields[1],et,eb,fields[3],fields[4],fields[2],groupContext);
   if(!r.ok)return RYZEV1.json({ok:false,error:r.error,completed:out.length,failedID:r.id});
   out.push(r);
   // Delayed/schema-different instances return to the existing JS fallback; never reimport.
   if(!r.fused)break;
   if(r.clip.start!==decodeURIComponent(fields[0])||r.clip.end!==decodeURIComponent(fields[1])||r.clip.topRaw!==decodeURIComponent(fields[3])||r.clip.bottomRaw!==decodeURIComponent(fields[4])||Math.abs(r.clip.motionScale-80)>0.000001)break;
   if(new Date().getTime()-started>=1500)break;
  }
  return RYZEV1.json({ok:true,results:out});
 }catch(e){return RYZEV1.json({ok:false,error:String(e),completed:out.length});}
};
RYZEV1.complete=function(){
 try{
  var seq=RYZEV1.current(),s=RYZEV1.state;RYZEV1.assertOriginals(seq);
  if(s.phase!=='converting')throw Error('Wrong completion phase');
  // Refresh controls once at commit; every fused card already has strict Scale readback.
  if(s.created&&s.created.length){var last=RYZEV1.owned(seq,s.created[s.created.length-1].id);RYZEV1.motionScale(last).param.setValue(80,true);if(Math.abs(RYZEV1.motionScale(last).value-80)>0.000001)throw Error('Final scale refresh failed');}
  s.phase='converted';RYZEV1.persist();var ex=RYZEV1.exportSnapshot(seq,'converted.prproj');
  return RYZEV1.json({ok:true,snapshot:ex,trackIndex:s.newTrackIndex,created:s.created});
 }catch(e){return RYZEV1.json({ok:false,error:String(e)});}
};
RYZEV1.clipCount=function(seq){var tracks=RYZEV1.tracks(),n=0,i;for(i=0;i<tracks.length;i++)n+=seq.videoTracks[tracks[i].trackIndex].clips.numItems;return n;};
RYZEV1.removeResult=function(){
 try{
  var seq=RYZEV1.current(),s=RYZEV1.state;RYZEV1.assertOriginals(seq);
  if(!s.created)s.created=[];
  var tracks=RYZEV1.tracks(),tr,i,j,k,target=null;
  // Verify ownership across ALL output tracks before deleting any clip.
  for(k=0;k<tracks.length;k++){
   tr=seq.videoTracks[tracks[k].trackIndex];
   for(i=0;i<tr.clips.numItems;i++){
    var known=false;for(j=0;j<s.created.length;j++)if(s.created[j].id===String(tr.clips[i].nodeId)&&(typeof s.created[j].trackIndex==='undefined'||s.created[j].trackIndex===tracks[k].trackIndex))known=true;
    if(!known)throw Error('Unowned clip present; cleanup stopped');
   }
   if(tr.clips.numItems)target=tr.clips[tr.clips.numItems-1];
  }
  if(!target){s.phase='verified_added';s.added=RYZEV1.snapshot(seq);RYZEV1.persist();return {ok:true,empty:true};}
  var id=String(target.nodeId),before=RYZEV1.clipCount(seq);s.intent={operation:'remove_clip',id:id};RYZEV1.persist();
  target.remove(false,true);
  return {ok:true,empty:false,attemptedID:id,countBefore:before};
 }catch(e){return {ok:false,error:String(e)};}
};
RYZEV1.removeOne=function(){return RYZEV1.json(RYZEV1.removeResult());};
RYZEV1.remaining=function(){
 try{var seq=RYZEV1.current();RYZEV1.assertOriginals(seq);return RYZEV1.json({ok:true,count:RYZEV1.clipCount(seq)});}
 catch(e){return RYZEV1.json({ok:false,error:String(e)});}
};
// Read-only guard used before commit and user-requested Undo.
RYZEV1.guard=function(){
 try{var seq=RYZEV1.current(),s=RYZEV1.state,now=RYZEV1.assertOriginals(seq);
 if(!s.expected||!RYZEV1.same(now,s.expected))throw Error('Output timeline changed; refusing automatic Undo');
 return RYZEV1.json({ok:true});}catch(e){return RYZEV1.json({ok:false,error:String(e)});}
};
RYZEV1.status=function(){return RYZEV1.json({ok:true,state:RYZEV1.state});};
RYZEV1.cancelPrepared=function(){
 try{var seq=RYZEV1.current(),s=RYZEV1.state;
 if(s.phase!=='prepared'||!RYZEV1.same(RYZEV1.snapshot(seq),s.baseline))throw Error('Cannot abandon altered preparation');
 s.phase='finished';RYZEV1.persist();return RYZEV1.json({ok:true});}catch(e){return RYZEV1.json({ok:false,error:String(e)});}
};
// Import and first read share a host round trip; import ownership guards are unchanged.
RYZEV1.importInspect=function(p,a,b,lane){
 var r=RYZEV1.importResult(p,a,b,lane);if(!r.ok)return RYZEV1.json(r);
 try{r.clip=RYZEV1.raw(RYZEV1.owned(RYZEV1.current(),r.id));}
 catch(e){if(String(e).indexOf('not ready')<0)return RYZEV1.json({ok:false,error:String(e)});r.pending=true;}
 return RYZEV1.json(r);
};
RYZEV1.inspectAll=function(){
 try{var seq=RYZEV1.current(),s=RYZEV1.state,now=RYZEV1.assertOriginals(seq),out=[],i;
 if(!s.expected||!RYZEV1.same(now,s.expected))throw Error('Output timeline changed');
 for(i=0;i<s.created.length;i++)out.push(RYZEV1.raw(RYZEV1.owned(seq,s.created[i].id)));
 return RYZEV1.json({ok:true,clips:out});}catch(e){return RYZEV1.json({ok:false,error:String(e)});}
};
// Bounded chunks keep the host responsive; all existing per-removal guards and journals run.
RYZEV1.removeChunk=function(){
 try{var seq=RYZEV1.current(),before=RYZEV1.clipCount(seq),n=0,i,r,prior;
 for(i=0;i<5&&RYZEV1.clipCount(seq)>0;i++){
  prior=RYZEV1.clipCount(seq);r=RYZEV1.removeResult();if(!r.ok)throw Error(r.error);
  if(RYZEV1.clipCount(seq)!==prior-1)throw Error('Removal did not remove exactly one clip');n++;
 }
 return RYZEV1.json({ok:true,count:RYZEV1.clipCount(seq),removed:n,before:before});
 }catch(e){return RYZEV1.json({ok:false,error:String(e)});}
};

// Reattach a completed batch only when saved IDs AND the full measured timeline still match.
// The bridge supplies JSON parsed from its local checkpoint, not executable client input.
RYZEV1.restoreCompleted=function(saved){
 var previous=RYZEV1.state;
 try{
  if(previous&&previous.phase!=='finished')throw Error('Host already owns an active batch');
  if(!saved||saved.phase!=='converted'||!saved.expected||!saved.created)throw Error('Checkpoint is not a completed batch');
  RYZEV1.state=saved;var seq=RYZEV1.current();
  if(!RYZEV1.same(RYZEV1.snapshot(seq),saved.expected))throw Error('Saved timeline identities or contents changed; recovery refused');
  return RYZEV1.json({ok:true});
 }catch(e){RYZEV1.state=previous;return RYZEV1.json({ok:false,error:String(e)});}
};

// Timing instrumentation uses ordinary JS only; no new Premiere runtime APIs.
RYZEV1.measure=function(name,ms){if(RYZEV1.metrics){var m=RYZEV1.metrics[name]||(RYZEV1.metrics[name]={calls:0,ms:0});m.calls++;m.ms+=ms;}};
(function(){var names=['snapshot','outputSnapshot','persist','raw','exportSnapshot'],i;function wrap(name){var original=RYZEV1[name];RYZEV1[name]=function(){var start=new Date().getTime();try{return original.apply(RYZEV1,arguments);}finally{RYZEV1.measure(name,new Date().getTime()-start);}};}for(i=0;i<names.length;i++)wrap(names[i]);})();
RYZEV1.invoke=function(method,args){
 RYZEV1.metrics={};var start=new Date().getTime(),result;
 try{result=RYZEV1[method].apply(RYZEV1,args);}catch(e){result=RYZEV1.json({ok:false,error:String(e)});}
 RYZEV1.measure('hostTotal',new Date().getTime()-start);
 var metrics=RYZEV1.metrics;RYZEV1.metrics=null;
 return result.slice(0,-1)+',"perf":'+RYZEV1.json(metrics)+'}';
};

// Report export is independent of project/sequence state and never edits the timeline.
RYZEV1.exportBugReport=function(encodedText){
 try{
  var text=decodeURIComponent(encodedText);if(text.length>524288)throw Error('Bug report is too large');
  var file=new File(Folder.desktop.fsName+'/RYZE_Bug_Report_'+new Date().getTime()+'_'+Math.floor(Math.random()*1000000)+'.txt');
  if(file.exists)throw Error('Refusing report overwrite');file.encoding='UTF-8';
  if(!file.open('w'))throw Error('Cannot create report on Desktop');
  var ok=false,closed;try{ok=file.write('RYZE Caption Tool — Bug report\nPremiere: '+String(app.version)+'\n\n'+text);}finally{closed=file.close();}
  if(!ok||closed===false)throw Error('Report write failed');
  return RYZEV1.json({ok:true,path:file.fsName});
 }catch(e){return RYZEV1.json({ok:false,error:String(e)});}
};
