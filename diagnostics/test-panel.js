'use strict';
const assert=require('assert'),vm=require('vm'),fs=require('fs');
async function test(fallback,cancel=false){
 const elements={},events={},saved=[],commands=[];let emitter,connections=0,shellLaunches=0;
 const credential='a'.repeat(64);
 const context={document:{getElementById:id=>elements[id]||(elements[id]={style:{},addEventListener:(event,fn)=>{events[id]=fn;}})},setTimeout,clearTimeout,
 fetch:async(url,options)=>{if(fallback)throw Error('Helper offline');if(url.endsWith('/status'))return {status:200,json:async()=>({ok:true,build:'1.0.7',epoch:'epoch'})};const body=JSON.parse(options.body);commands.push(body);return {status:200,json:async()=>({ok:true,state:{reportPath:'C:/Desktop/report.txt'}})};},
 require:name=>{
  if(name==='uxp')return {host:{applicationPath:'/Applications/Adobe Premiere Pro/Adobe Premiere Pro.app'},shell:{openPath:async(path,text)=>{shellLaunches++;assert.equal(path,'/Library/Application Support/RYZE/CaptionToolV1/bin/ryze-caption-helper');assert.match(text,/local RYZE helper/);return '';}},storage:{localFileSystem:{getPluginFolder:async()=>({getEntry:async()=>({read:async()=>JSON.stringify({schema:1,build:'1.0.7',port:48771,token:credential})})}),getFileForSaving:async()=>cancel?null:{write:async text=>saved.push(text)}}}};
  if(name==='premierepro')return {};
  if(name==='./visibility.js')return ()=>({});
  if(name==='./connect.js')return async(probe,attach,pause,status,launch)=>{connections++;if(connections>1&&launch)await launch();await probe();await attach();};
  if(name==='./workflow.js')return (api,vis,emit)=>{emitter=emit;return {attach:async()=>({converted:false}),run:async()=>{emit('TEST '+credential,{phase:'converting',next:3,total:5});return {converted:true};},undo:async()=>({converted:false})};};
  throw Error(name);
 }};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../uxp/index.js','utf8'),context);
 await new Promise(r=>setImmediate(r));
 assert.equal(elements.save.disabled,false,'Report must work even when helper is offline');
 if(!fallback){await events.connect();assert.equal(shellLaunches,1,'Reconnect must request the macOS CEP helper launch');await events.run();assert.equal(elements.bar.style.width,'100%');assert.equal(elements.undo.disabled,false);assert(!elements.status.textContent.includes('Diagnostics:'));}
 await events.save();
 if(fallback){assert.equal(saved.length,cancel?0:1);assert.match(elements.reportStatus.textContent,cancel?/cancelled/:/saved/);}
 else {assert.equal(commands.at(-1).op,'exportReport');assert(!commands.at(-1).args.report.includes(credential));assert.match(elements.reportStatus.textContent,/Desktop/);}
 assert.equal(elements.save.disabled,false);
}
(async()=>{await test(false);await test(true);await test(true,true);console.log('PASS team panel: macOS helper reconnect launch, progress, concise success, report fallback, cancellation and token redaction (mock UXP).');})().catch(e=>{console.error(e);process.exitCode=1;});
