'use strict';
const assert=require('assert'),createEngine=require('../cep/engine'),flow=require('../uxp/workflow'),make=require('./test-host');
const clone=v=>JSON.parse(JSON.stringify(v));
const base={guid:'123',name:'Test sequence',video:[],audio:[],caption:[{muted:false,items:[{start:'0',end:'1'}]}]};
const pending={batch:'a'.repeat(32),phase:'interrupted',lines:[],base};
const args={template:'Stroke',fast:true,fault:false,base};
function fixture(saved=pending,hostState=null){
 let disk=clone(saved),backup=null,writes=0;const calls=[];
 const io={load:()=>clone(saved),checkpoint:s=>{disk=clone(s);writes++;},archive:s=>{backup=clone(s);},id:()=> 'b'.repeat(32),templatePath:n=>n,hash:()=> '21ad2731dd319a952c5cfb166b2cedf9e0ed06003b6b311b029e1159a24e1813',host:async op=>{calls.push(op);if(op==='status')return {ok:true,state:hostState};if(op==='cancelPrepared')return {ok:true};if(op==='prepare')return {ok:false,error:'Rejected preparation',preparationOnly:true};throw Error('Unexpected mutation '+op);}};
 const engine=createEngine(io);return {engine,io,calls,disk:()=>disk,backup:()=>backup,writes:()=>writes};
}
(async()=>{
 for(const previous of [null,{batch:'c'.repeat(32),phase:'converted',base,lines:[],folder:'/previous'}]){
  const f=fixture(previous);await assert.rejects(()=>f.engine.dispatch('begin',args),/Rejected preparation/);
  assert.deepStrictEqual(f.disk(),previous,'Failed preparation must retain completed Undo or idle');assert.deepStrictEqual(f.calls,['prepare']);
 }
 const uncertain=fixture(null);uncertain.io.host=async()=>{throw Error('Transport lost');};
 await assert.rejects(()=>uncertain.engine.dispatch('begin',args),/Transport lost/);assert.equal(uncertain.disk().phase,'interrupted');
 const retry=fixture({batch:'c'.repeat(32),phase:'converted',base,lines:[],folder:'/previous',profile:{checkpointMs:0}});
 let history=null;const save=retry.io.checkpoint;
 retry.io.archive=s=>{const text=JSON.stringify(s);if(history!==null&&history!==text)throw Error('Saved history differs');history=text;};
 retry.io.checkpoint=s=>{save(s);const until=Date.now()+3;while(Date.now()<until){/* Simulate disk latency. */}};
 await assert.rejects(()=>retry.engine.dispatch('begin',args),/Rejected preparation/);
 await assert.rejects(()=>retry.engine.dispatch('begin',args),/Rejected preparation/,'A refused preparation must not mutate the archived completed Undo record');
 for(const host of [null,{phase:'finished'},{phase:'prepared'}]){
  const f=fixture(pending,host);await f.engine.dispatch('status');assert.equal(f.writes(),0,'Discovery must not write checkpoints');
  const app=flow({command:(op,a)=>f.engine.dispatch(op,a)},{capture:async()=>clone(base),set:async()=>{throw Error('Timeline edit forbidden');}},()=>{});
  await app.attach();assert.deepStrictEqual(f.backup(),pending);assert.equal(f.disk().phase,'abandoned');
  assert.deepStrictEqual(f.calls,host&&host.phase==='prepared'?['status','cancelPrepared']:['status']);
 }
 for(const saved of [{...pending,phase:'converting'},{...pending,folder:'/diagnostics'},{...pending,owned:true},{...pending,hideAttempted:true},{...pending,lines:['uncertain']},{phase:'interrupted',lines:[]}]){
  const f=fixture(saved);await assert.rejects(()=>f.engine.dispatch('recoverPreparation',{batch:saved.batch,observed:base}));assert.deepStrictEqual(f.disk(),saved);assert.equal(f.backup(),null);
 }
 for(const problem of ['changed','backup','host','cancel']){
  const f=fixture(pending,problem==='host'?{phase:'converted'}:problem==='cancel'?{phase:'prepared'}:null);
  if(problem==='backup')f.io.archive=()=>{throw Error('Disk full');};
  if(problem==='cancel')f.io.host=async op=>op==='status'?{ok:true,state:{phase:'prepared'}}:{ok:false,error:'Timeline changed'};
  await assert.rejects(()=>f.engine.dispatch('recoverPreparation',{batch:pending.batch,observed:problem==='changed'?{...base,name:'Other sequence'}:base}));
  assert.deepStrictEqual(f.disk(),pending,'Unproven recovery must preserve its checkpoint');
 }
 for(const failure of ['version','unsaved','export']){
  const h=make('good'),previous={phase:'converted',test:'previous Undo'};h.ctx.RYZEV1.state=previous;
  if(failure==='version')h.ctx.app.version='25.5.0';if(failure==='unsaved')h.ctx.app.project.path='';if(failure==='export')h.seq.exportAsProject=()=>{throw Error('Export denied');};
  const r=h.run('prepare');assert.equal(r.ok,false);assert.equal(r.preparationOnly,true);assert.strictEqual(h.ctx.RYZEV1.state,previous);
 }
 const updated=make('good');updated.ctx.app.version='26.5.2';assert(updated.run('prepare').ok);
 console.log('PASS preparation refusal preserves Undo; legacy recovery requires exact shape, unchanged sequence, safe host and durable backup; genuine/unknown sessions stay locked; 26.5.2 mock accepted.');
})().catch(e=>{console.error(e);process.exitCode=1;});
