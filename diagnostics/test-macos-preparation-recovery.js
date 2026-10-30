'use strict';
const assert=require('assert'),createEngine=require('../cep/engine'),workflow=require('../uxp/workflow');
const clone=value=>JSON.parse(JSON.stringify(value));
const base={guid:'11111111-1111-4111-8111-111111111111',name:'Earlier sequence',video:[],audio:[],caption:[{id:'1',muted:false,items:[{start:'0',end:'10'}]}]};
const pending={batch:'a'.repeat(32),phase:'interrupted',lines:[],base};
const changed={...clone(base),name:'Current sequence',video:[{id:'2',items:[]} ]};
function fixture({saved=pending,mac=true,host={ok:true,state:null},archiveError=false}={}){
 let disk=clone(saved);const history=new Map([['b'.repeat(32),JSON.stringify({phase:'converted',batch:'b'.repeat(32),verified:['previous output']})]]),calls=[];
 const originalHistory=history.get('b'.repeat(32));
 const io={load:()=>clone(disk),checkpoint:value=>{disk=clone(value);},archive:value=>{
  if(archiveError)throw Error('Backup unavailable');
  const text=JSON.stringify(value);if(history.has(value.batch))assert.equal(history.get(value.batch),text);else history.set(value.batch,text);
 },host:async op=>{calls.push(op);assert.equal(op,'status','Cold preparation recovery must not call a timeline or host-state mutation');return host;}};
 const engine=createEngine(io,{recoverInactivePreparation:mac});
 return {engine,calls,history,originalHistory,disk:()=>disk,io};
}
(async()=>{
 // Same GUID with a different name/content is common when reusing project templates.
 // This is an abandoned preparation, not authorization to Undo the earlier output.
 for(const observed of [clone(base),changed,{...changed,guid:'22222222-2222-4222-8222-222222222222'},null]){
  const f=fixture();await f.engine.dispatch('recoverPreparation',{batch:pending.batch,observed});
  assert.equal(f.disk().phase,'abandoned');assert.equal(f.history.get(pending.batch),JSON.stringify(pending));
  assert.equal(f.history.get('b'.repeat(32)),f.originalHistory,'Completed Undo history stays byte-for-byte intact');
  assert.deepEqual(f.calls,['status']);
 }
 const f=fixture(),notes=[];
 const panel=workflow({command:(op,args)=>f.engine.dispatch(op,args)},{capture:async()=>{throw Error('No active sequence');}},text=>notes.push(text));
 assert.deepEqual(await panel.attach(),{converted:false},'Mac recovery must also work before a project is open');
 assert.equal(f.disk().phase,'abandoned');assert(notes.some(text=>text.includes('PREPARATION_RECOVERED')));
 const reload=createEngine({...f.io,load:()=>f.disk()},{recoverInactivePreparation:true});
 assert.equal(reload.state().phase,'abandoned','Recovery survives a helper restart');
 for(const phase of ['prepared','finished']){
  const f=fixture();f.io.host=async op=>{f.calls.push(op);if(op==='status')return {ok:true,state:{phase}};assert.equal(op,'cancelPrepared');return {ok:true};};
  await f.engine.dispatch('recoverPreparation',{batch:pending.batch,observed:base});
  assert.equal(f.disk().phase,'abandoned');assert.deepEqual(f.calls,phase==='prepared'?['status','cancelPrepared']:['status']);
 }
 for(const host of [{ok:true},{ok:true,state:false},{ok:false,state:null},{ok:true,state:{phase:'prepared'}},{ok:true,state:{phase:'converting'}},{ok:true,state:{phase:'converted'}},{ok:true,state:{phase:'finished'}},null]){
  const f=fixture({host});await assert.rejects(()=>f.engine.dispatch('recoverPreparation',{batch:pending.batch,observed:changed}));
  assert.deepEqual(f.disk(),pending);assert.equal(f.history.size,1);
 }
 for(const saved of [{...pending,phase:'converting'},{...pending,phase:'converted'},{...pending,owned:true},{...pending,hideAttempted:true},{...pending,folder:'/diagnostics'},{...pending,lines:['unknown outcome']},{phase:'interrupted',lines:[]}]){
  const f=fixture({saved});await assert.rejects(()=>f.engine.dispatch('recoverPreparation',{batch:saved.batch,observed:changed}));
  assert.deepEqual(f.disk(),saved);assert.equal(f.history.size,1);assert.deepEqual(f.calls,[]);
 }
 for(const options of [{mac:false},{archiveError:true}]){
  const f=fixture(options);await assert.rejects(()=>f.engine.dispatch('recoverPreparation',{batch:pending.batch,observed:changed}));
  assert.deepEqual(f.disk(),pending);assert.equal(f.history.size,1);
 }
 const unreachable=fixture();unreachable.io.host=async()=>{throw Error('Host unavailable');};
 await assert.rejects(()=>unreachable.engine.dispatch('recoverPreparation',{batch:pending.batch,observed:changed}),/Host unavailable/);
 assert.deepEqual(unreachable.disk(),pending);assert.equal(unreachable.history.size,1);
 console.log('PASS Mac stale preparation recovery: changed/no active sequence, exact durable backup, untouched completed history; live/unknown host, mutation markers and backup failures stay blocked; Windows keeps its existing policy.');
})().catch(error=>{console.error(error);process.exitCode=1;});
