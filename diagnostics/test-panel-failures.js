'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync(__dirname+'/../uxp/index.js','utf8'),buildInfo=require('../uxp/build-info.json');
async function waitFor(condition){for(let i=0;i<100;i++){if(condition())return;await new Promise(resolve=>setTimeout(resolve,5));}throw Error('Panel test timed out');}
async function panel(options={}){
 const elements={},events={},commands=[];let api,emitter,attached=0,launches=0,fetches=0;
 const context={
  document:{getElementById:id=>elements[id]||(elements[id]={style:{},addEventListener:(name,callback)=>{events[id]=callback;}})},
  setTimeout:callback=>setTimeout(callback,0),clearTimeout,
  fetch:async(url,request)=>{
   fetches++;
   if(url.endsWith('/status'))return {status:200,json:()=>options.bodyHang?new Promise(()=>{}):Promise.resolve({ok:true,build:'1.0.7',revision:options.legacy?undefined:buildInfo.revision,epoch:'epoch'})};
   const body=JSON.parse(request.body);commands.push(body);
   return {status:200,json:()=>options.commandHang&&commands.length===1?new Promise(()=>{}):Promise.resolve({ok:true,state:{phase:'ready'}})};
  },
  require:name=>{
   if(name==='./build-info.json')return buildInfo;
   if(name==='os')return {platform:()=> 'win32'};
   if(name==='uxp')return {host:{version:'26.5.2'},shell:{openPath:async()=>{launches++;}},storage:{localFileSystem:{getPluginFolder:async()=>({getEntry:async()=>({read:async()=>JSON.stringify({schema:1,build:'1.0.7',port:48771,token:options.badPairing?null:'a'.repeat(64)})})})}}};
   if(name==='premierepro')return {};
   if(name==='./visibility.js')return ()=>({});
   if(name==='./connect.js')return async(probe,attach)=>{await probe();await attach();};
   if(name==='./workflow.js')return (receivedApi,vis,emit)=>{api=receivedApi;emitter=emit;return {attach:async()=>{attached++;if(options.recovery)throw Error('Session recovery is required. Saved session unreadable');return {converted:false};}};};
   throw Error(name);
  }
 };
 vm.runInNewContext(source,context);
 await waitFor(()=>elements.connect.disabled===false);
 return {elements,events,commands,api,emit:emitter,attached:()=>attached,launches:()=>launches,fetches:()=>fetches};
}
(async()=>{
 const legacy=await panel({legacy:true});assert(legacy.elements.run.disabled);assert.equal(legacy.attached(),0);assert.match(legacy.elements.status.textContent,/version mismatch.*legacy\/unidentified/);
 const hung=await panel({bodyHang:true});assert(hung.elements.run.disabled);assert.match(hung.elements.status.textContent,/Connection timeout/);assert.equal(hung.attached(),0);
 const badPairing=await panel({badPairing:true});assert.equal(badPairing.fetches(),0);assert.match(badPairing.elements.status.textContent,/pairing/);
 const recovery=await panel({recovery:true});assert(recovery.elements.run.disabled);assert.equal(recovery.elements.save.disabled,false);assert.match(recovery.elements.status.textContent,/Helper connected, but session recovery/);assert.equal(recovery.launches(),0);
 const retry=await panel({commandHang:true});assert.equal(retry.elements.run.disabled,false);assert.equal((await retry.api.command('step',{batch:'test'})).phase,'ready');
 assert.equal(retry.commands.length,2);assert.equal(retry.commands[0].requestID,retry.commands[1].requestID,'Body-read timeout must reuse the original ID, never replay under a fresh identity');
 const report=await panel();report.emit('x'.repeat(400000));await report.events.save();
 assert(report.commands[0].args.report.length<262144,'Large reports must fit the helper limit');assert.match(report.commands[0].args.report,/Report trimmed/);
 console.log('PASS panel failures: mixed revisions, stalled response bodies, same-ID retries, invalid pairing, recovery classification and bounded reports.');
})().catch(error=>{console.error(error);process.exitCode=1;});
