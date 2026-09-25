'use strict';
module.exports=function(api,vis,emit){
 let current=null,base=null,converted=false,localHideIntent=false,notes=[];
 function report(){return notes.concat(current&&current.lines||[]).join('\n');}
 function sync(s){if(s)current=s;emit(report(),current);return s;}
 function log(s){notes.push(s);emit(report(),current);}
 async function cmd(op,args={}){try{return sync(await api.command(op,{...args,...(current&&current.batch?{batch:current.batch}:{})}));}catch(e){if(e.state)sync(e.state);throw e;}}
 function outputs(){return current.outputs&&current.outputs.length?current.outputs:current.output;}
 async function restore(){if(localHideIntent||(current&&current.hideAttempted)){
  const targets=base.caption.filter(t=>t.items.length),states=targets.map(t=>({id:t.id,muted:t.muted}));
  // Each source has its own original mute state; restore all, including after partial hide failure.
  if(targets.length===1)await vis.set(base,targets[0].muted);else await vis.restoreVisibility(base);
  await cmd('restored',{states,muted:targets[0].muted});localHideIntent=false;
 }}
 async function rollback(){await restore();await cmd('rollback');vis.restored(base,await vis.capture());log('ROLLBACK_BASELINE_VERIFIED = true');}
 async function attach(){
  await cmd('status');converted=current.phase==='converted';
  if(!['idle','finished','abandoned','converted'].includes(current.phase))throw Error('An unfinished session was found. Automatic edits are blocked. Save diagnostics and restore your saved project copy if needed.');
  base=converted?current.base:null;
  // A saved completed batch is Undo history, never the input for a new Convert.
  return {converted};
 }
 async function run(template,grouped=true){
  const runStarted=Date.now();
  const fresh=await vis.capture(),tracks=fresh.caption.filter(t=>t.items.length);
  if(!tracks.length)throw Error('Create native captions in the active sequence first');
  const previousBatch=current&&current.batch;
  notes=[];localHideIntent=false;
  try{
   await cmd('begin',{template,fast:true,fault:false,base:fresh,grouped});base=fresh;converted=false;
   while(current.next<current.total)await cmd(grouped?'stepGroup':'step');
   await cmd('complete');vis.beforeHide(base,await vis.capture(),outputs());
   localHideIntent=true;await cmd('hideIntent');await vis.set(base,true);await cmd('hideAck',{muted:true});
   converted=true;log('CLICK_TO_SUCCESS_MS = '+(Date.now()-runStarted));return {converted:true,folder:current.folder};
  }catch(e){log('CONVERSION_STOP = '+String(e));
   // A rejected new begin must NEVER roll back the previous completed conversion.
   if(current&&current.batch!==previousBatch&&!['finished','abandoned','interrupted'].includes(current.phase)){
    base=fresh;converted=false;try{await rollback();}catch(r){log('ROLLBACK_STOP = '+String(r));}
   }
   throw e;
  }
 }
 async function undo(){
  if(!converted)throw Error('No completed batch to undo');
  base=current.base;
  const expected=JSON.parse(JSON.stringify(base));expected.caption.filter(t=>t.items.length).forEach(t=>{t.muted=true;});
  const observed=await vis.capture();
  try{vis.beforeHide(expected,observed,outputs());}catch(e){
   log('UNDO_CHECK_READ_ONLY = true');log('UNDO_EXPECTED_UXP = '+JSON.stringify(expected));log('UNDO_ACTUAL_UXP = '+JSON.stringify(observed));
   throw Error('Previous conversion no longer matches this timeline; Undo refused. Convert can read the current captions. '+String(e));
  }
  await cmd('undoCheck');await restore();await cmd('undo');vis.restored(base,await vis.capture());converted=false;log('UNDO_BASELINE_VERIFIED = true');return {converted:false};
 }
 return {run,undo,attach,getReport:report};
};
