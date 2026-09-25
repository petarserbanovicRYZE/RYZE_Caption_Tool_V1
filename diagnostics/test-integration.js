'use strict';
const assert=require('assert'),make=require('./test-host'),createEngine=require('../cep/engine'),createFlow=require('../uxp/workflow');
async function test(mode,template='V3',grouped=true){
 const hashes={V3:'22e6acb94b560e24ba4b025afac6b989dc151100cf6f01bf87898513738757bd',V5:'72418fd40cb4233cbd54a426a791732dca332af29094d6ace8d2e00d0b6f86b8',Stroke:'21ad2731dd319a952c5cfb166b2cedf9e0ed06003b6b311b029e1159a24e1813'};
 const h=make('good'),logs=[],order=[];let muted=false,failedOnce=false,counter=0;
 const caption={index:0,id:'1',name:'Subtitle',muted:false,items:[{start:'0',end:'20'},{start:'20',end:'40'},{start:'40',end:'60'}]};
 const base={guid:'123',name:'Regular edit sequence',video:[],audio:[],caption:[caption]};
 const native={sequenceID:'123',sequenceName:base.name,tracks:[{index:0,frameTicks:'1',cues:caption.items.map((t,i)=>({startTicks:t.start,endTicks:t.end,startFrame:+t.start,endFrame:+t.end,text:'caption '+i}))}]};
 const io={host:async(method,...a)=>{order.push(method);if(method==='prepare')h.api.state=null;return h.run(method,...a);},snapshot:()=>JSON.parse(JSON.stringify(native)),templatePath:()=>'/template.mogrt',hash:()=>hashes[template],id:()=>String(++counter),pause:async()=>{},append:(f,n,t)=>logs.push(t),write:()=>{},plan:cues=>cues.map(c=>({...c,top:c.text,bottom:''}))};
 const engine=createEngine(io);
 const api={command:async(op,args)=>{order.push(op);try{return await engine.dispatch(op,args);}catch(e){e.state=engine.state();throw e;}}};
 const vis={capture:async()=>JSON.parse(JSON.stringify({...base,caption:[{...caption,muted}]})),set:async(b,v)=>{order.push(v?'hide':'restore');muted=v;if(mode==='hideThrows'&&v&&!failedOnce){failedOnce=true;throw Error('Hide mutated then threw');}},restored:(b,n)=>assert.deepStrictEqual(n,b),beforeHide:()=>assert(['awaiting_visibility','converted'].includes(engine.state().phase))};
 const flow=createFlow(api,vis,()=>{});
 if(mode==='hideThrows'){
  await assert.rejects(()=>flow.run(template,grouped),/Hide mutated then threw/);assert.strictEqual(muted,false);assert.strictEqual(engine.state().phase,'finished');assert(order.indexOf('restore')>order.indexOf('hide'));assert(logs.join('').includes('ROLLBACK_TIMELINE_RESTORED = true'));
 }else{
  const r=await flow.run(template,grouped);assert(r.converted);assert.strictEqual(muted,true);assert.strictEqual(engine.state().phase,'converted');assert(order.indexOf('hide')>order.lastIndexOf('complete'));assert.strictEqual(order.filter(x=>x==='begin').length,1,'One click must run only one conversion');
  assert.equal(order.filter(x=>x==='importInspect').length,1);assert.equal(order.filter(x=>x==='importSet').length,grouped?0:2);assert.equal(order.filter(x=>x==='importBatch').length,grouped?1:0);assert.equal(order.filter(x=>x==='setClip').length,1,'Subsequent cards should not need a second editing call');
  await flow.undo();assert.strictEqual(muted,false);assert.strictEqual(engine.state().phase,'finished');assert(flow.getReport().includes('UNDO_BASELINE_VERIFIED = true'));assert(order.lastIndexOf('restore')<order.lastIndexOf('removeOne'));
 }
 assert.strictEqual(h.api.state.phase,'finished');
}
(async()=>{for(const template of ['V3','V5','Stroke']){await test('good',template);await test('good',template,false);}await test('hideThrows');console.log('PASS V1 single-pass conversion, hide after verified success, Undo restores captions first, and hide-mutates-then-throws rollback (mock host).');})().catch(e=>{console.error(e);process.exitCode=1;});
