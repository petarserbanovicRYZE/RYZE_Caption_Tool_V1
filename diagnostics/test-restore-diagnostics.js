'use strict';
const assert=require('assert'),difference=require('../uxp/difference'),visibility=require('../uxp/visibility'),createFlow=require('../uxp/workflow');
(async()=>{
 const base={guid:'same',name:'test',video:[],audio:[],caption:[{index:0,id:'1',muted:false,items:[{start:'0',end:'20'}]}]};
 const expected=JSON.parse(JSON.stringify(base));expected.caption[0].muted=true;
 const output={trackIndex:0,trackID:'7',count:1},vis=visibility({});
 const actual={...expected,video:[{index:0,id:'7',items:[{}]}]};
 assert(vis.beforeHide(expected,actual,output));
 for(const kind of ['sequence','mute','timing']){
  const now=JSON.parse(JSON.stringify(actual));
  if(kind==='sequence')now.guid='different';
  if(kind==='mute')now.caption[0].muted=false;
  if(kind==='timing')now.caption[0].items[0].end='21';
  const commands=[];let report='';
  const flow=createFlow({command:async op=>{commands.push(op);return {phase:'converted',base,output,lines:[]};}},{capture:async()=>now,beforeHide:vis.beforeHide,set:async()=>{throw Error('No edits permitted during attach');}},s=>report=s);
  assert((await flow.attach()).converted);
  await assert.rejects(()=>flow.undo(),/Undo refused/);
  assert.deepStrictEqual(commands,['status']);assert(report.includes('UNDO_ACTUAL_UXP = '));assert(report.includes('UNDO_EXPECTED_UXP = '));

 }
 assert.equal(difference({a:1},{a:1}),null);
 console.log('PASS completed attach permits fresh conversion; Undo diagnostics: exact sequence/mute/timing mismatch, strict guard retained, status/capture only and no edits.');
})().catch(e=>{console.error(e);process.exitCode=1;});
