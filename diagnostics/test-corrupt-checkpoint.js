'use strict';
const assert=require('assert'),createEngine=require('../cep/engine'),createFlow=require('../uxp/workflow');
(async()=>{
 for(const load of [()=>JSON.parse('{unfinished'),()=>{throw Error('EACCES');},()=>42,()=>false,()=>0,()=>'',()=>[],()=>({phase:'unknown',lines:[]}),()=>({phase:'converted',lines:{}})]){
  let writes=0,exports=0,edits=0;
  const engine=createEngine({load,checkpoint:()=>writes++,host:async op=>{assert.equal(op,'exportBugReport');exports++;return {ok:true,path:'/Desktop/report.txt'};}});
  assert.equal(engine.state().phase,'recovery_required');
  assert.equal((await engine.dispatch('status')).phase,'recovery_required');
  for(const op of ['begin','recoverPreparation','undo','rollback'])await assert.rejects(()=>engine.dispatch(op,{}),/Saved session could not be read/);
  const flow=createFlow({command:(op,args)=>engine.dispatch(op,args)},{set:async()=>edits++},()=>{});
  await assert.rejects(()=>flow.attach(),/Session recovery is required/);
  assert.equal((await engine.dispatch('exportReport',{report:'Diagnostic report'})).reportPath,'/Desktop/report.txt');
  assert.equal(exports,1);assert.equal(writes,0,'Never overwrite malformed or unreadable checkpoint evidence');assert.equal(edits,0);
 }
 console.log('PASS unreadable/malformed checkpoints keep diagnostics online while blocking all edits and preserving the original file.');
})().catch(error=>{console.error(error);process.exitCode=1;});
