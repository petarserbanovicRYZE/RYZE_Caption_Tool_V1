'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const {createRequire}=require('module');
const clone=value=>JSON.parse(JSON.stringify(value));
const enginePath=path.join(__dirname,'../cep/engine.js'),engineModule={exports:{}};
let clock=0;
// Nonzero, deterministic measurement intervals expose even journal timing drift.
vm.runInNewContext(fs.readFileSync(enginePath,'utf8'),{
 module:engineModule,require:createRequire(enginePath),Date:class extends Date {static now(){return ++clock;}}
},{filename:enginePath});
const createEngine=engineModule.exports;
const base={guid:'123',name:'Synthetic sequence',video:[],audio:[],caption:[{index:0,id:'1',muted:false,items:[{start:'0',end:'20'}]}]};
const clip={id:'clip1',start:'0',end:'20',topRaw:'original',bottomRaw:'',motionScale:80};
const args={template:'Stroke',fast:true,fault:false,base};

function fixture(fast,mode,withProfile=true){
 const original={batch:'c'.repeat(32),phase:'converted',base:clone(base),lines:['Completed'],folder:'/synthetic/completed',fast,
  verified:[clone(clip)],owned:true,hideAttempted:true,timing:{importInspect:{calls:1,totalMs:10}}};
 if(withProfile)original.profile={checkpointMs:3,logMs:4,bridgeMs:5,host:{import:{calls:1,ms:6}}};
 let disk=clone(original),history=null,prepareOK=false,inspectCount=0;
 const calls=[],journal=[];
 const io={
  load:()=>clone(disk),checkpoint:value=>{disk=clone(value);},
  // Match bridge.js's strict byte-for-byte archive policy; never ignore timing.
  archive:value=>{const text=JSON.stringify(value);if(history!==null&&history!==text)throw Error('Saved history differs');history=text;},
  id:()=> 'b'.repeat(32),templatePath:name=>name,
  hash:()=> '21ad2731dd319a952c5cfb166b2cedf9e0ed06003b6b311b029e1159a24e1813',
  restoreHost:async()=>{if(mode==='restore-failure')throw Error('Host restoration refused');},
  append:(folder,name,text)=>{
   if(mode==='journal-failure'&&name==='journal.ndjson')throw Error('Journal unavailable');
   if(name==='journal.ndjson')journal.push(JSON.parse(text));
  },
  write:()=>{},pause:async()=>{},
  snapshot:()=>({sequenceID:'123',sequenceName:base.name,tracks:[{index:0,frameTicks:'1',cues:[{startTicks:'0',endTicks:'20',text:'Test caption'}]}]}),
  plan:cues=>cues.map(c=>({...c,top:c.text,bottom:''})),
  host:async method=>{
   calls.push(method);
   if(method==='prepare')return prepareOK?{ok:true,folder:'/synthetic/new',snapshot:{path:'/synthetic/snapshot'},sequenceID:'123',timebase:'1'}:{ok:false,error:'Project must be saved',preparationOnly:true};
   assert(['guard','inspectAll','inspectClip'].includes(method),'Unexpected timeline operation: '+method);
   if(mode==='transport')throw Error('Host transport lost');
   if(mode==='refusal')return {ok:false,error:'Host guard refused',perf:{scan:{calls:1,ms:7}}};
   if(mode==='not-ready'&&method==='inspectClip'&&inspectCount++===0)return {ok:false,error:'Clip not ready'};
   const actual=mode==='mismatch'?{...clip,topRaw:'User edit'}:clone(clip);
   return {ok:true,clip:actual,clips:[actual],perf:{scan:{calls:1,ms:7}}};
  }
 };
 return {io,original,calls,journal,read:()=>clone(disk),history:()=>history,prepare:()=>{prepareOK=true;},setHistory:value=>{history=value;}};
}

async function checkHistory(fast,mode,withProfile=true){
 const f=fixture(fast,mode,withProfile),engine=createEngine(f.io);
 await assert.rejects(()=>engine.dispatch('begin',args),/Project must be saved/);
 const archived=f.history();
 const errors={refusal:/Host guard refused/,mismatch:/Generated clip changed/,transport:/Host transport lost/,'journal-failure':/Journal unavailable/,'restore-failure':/Host restoration refused/};
 const check=()=>engine.dispatch('undoCheck',{batch:f.original.batch});
 if(errors[mode])await assert.rejects(check,errors[mode]);else await check();
 assert.deepStrictEqual(f.read(),f.original,'Read-only Undo must not change the completed checkpoint: '+mode);
 assert.equal(f.history(),archived,'Undo must never rewrite the existing archive');
 if(!['transport','journal-failure','restore-failure'].includes(mode))assert(f.journal.length,'Host response diagnostics must still be journaled');
 if(mode==='not-ready')assert.equal(f.calls.filter(m=>m==='inspectClip').length,2,'Keep not-ready retries');
 await assert.rejects(()=>engine.dispatch('begin',args),/Project must be saved/,'Retry must reach preparation, not fail archive identity');
 // Reload the persisted checkpoint as a reconnect/restart would do.
 const reloaded=createEngine(f.io);
 await assert.rejects(()=>reloaded.dispatch('begin',args),/Project must be saved/);
 assert.deepStrictEqual(f.read(),f.original);
 if(mode!=='journal-failure'){
  f.prepare();const next=await reloaded.dispatch('begin',args);
  assert.equal(next.phase,'ready','A later valid preparation must succeed');
  assert.equal(f.history(),archived,'Keep the previous completed Undo archive intact');
  assert(f.read().profile.logMs>0,'Active conversion timing must still be measured');
 }
}

(async()=>{
 for(const fast of [true,false])for(const mode of ['success','refusal','mismatch','transport','journal-failure','restore-failure'])await checkHistory(fast,mode);
 await checkHistory(false,'not-ready');
 await checkHistory(true,'success',false);
 // The final pre-cleanup guard must also be read-only if Undo cannot proceed.
 for(const mode of ['success','refusal']){
  const f=fixture(true,mode),engine=createEngine(f.io);
  await assert.rejects(()=>engine.dispatch('begin',args),/Project must be saved/);
  await assert.rejects(()=>engine.dispatch('undo',{batch:f.original.batch}),mode==='refusal'?/Host guard refused/:/Restore original caption visibility/);
  assert.deepStrictEqual(f.read(),f.original);
  await assert.rejects(()=>engine.dispatch('begin',args),/Project must be saved/);
 }
 // Real mismatches, including pre-existing timing drift, must still fail closed.
 for(const field of ['base','profile']){
  const f=fixture(true,'success'),engine=createEngine(f.io);
  await assert.rejects(()=>engine.dispatch('begin',args),/Project must be saved/);
  const changed=JSON.parse(f.history());
  if(field==='base')changed.base.name='Different sequence';else changed.profile.logMs++;
  f.setHistory(JSON.stringify(changed));const count=f.calls.length;
  await assert.rejects(()=>engine.dispatch('begin',args),/Saved history differs/);
  assert.equal(f.calls.length,count,'Archive mismatch must stop before any host call');
  assert.deepStrictEqual(f.read(),f.original);
 }
 console.log('PASS archived Undo identity: successful/refused checks, both modes, retries, journal/transport/restore failures, reconnect and next preparation; strict archive and timeline guards retained.');
})().catch(error=>{console.error(error);process.exitCode=1;});
