'use strict';
const assert=require('assert'),connect=require('../uxp/connect');
(async()=>{
 let tries=0,attached=0,pauses=0;
 await connect(async()=>{if(++tries<4)throw Error('Failed to fetch');},async()=>attached++,async()=>pauses++,()=>{});
 assert.equal(tries,4);assert.equal(attached,1);assert.equal(pauses,3);
 let launches=0;
 tries=0;attached=0;pauses=0;
 await connect(async()=>{if(++tries<3)throw Error('Connection refused');},async()=>attached++,async()=>pauses++,()=>{},async()=>launches++);
 assert.equal(tries,3);assert.equal(attached,1);assert.equal(pauses,2);assert.equal(launches,1,'Reconnect must attempt one helper launch before retrying');
 for(const error of ['Unauthorized','Helper version mismatch','Permission denied. Manifest entry not found']){
  tries=0;attached=0;
  await assert.rejects(()=>connect(async()=>{tries++;throw Error(error);},async()=>attached++,async()=>{},()=>{}));
  assert.equal(tries,1);assert.equal(attached,0);
 }
 tries=0;attached=0;
 await assert.rejects(()=>connect(async()=>{tries++;throw Error('Network unavailable');},async()=>attached++,async()=>{},()=>{}),/did not respond/);
 assert.equal(tries,15);assert.equal(attached,0);
 tries=0;attached=0;
 await assert.rejects(()=>connect(async()=>tries++,async()=>{attached++;throw Error('unfinished session');},async()=>{},()=>{}),/unfinished session/);
 assert.equal(tries,1);assert.equal(attached,1);
 // Execute the real panel startup with mocked UXP file and HTTP APIs, no manual pairing.
 const vm=require('vm'),fs=require('fs'),elements={};let pluginReads=0,fetches=0;
 const credential='a'.repeat(64);
 const context={document:{getElementById:id=>elements[id]||(elements[id]={style:{},addEventListener(){}})},setTimeout,clearTimeout,fetch:async(url,options)=>{fetches++;assert(url.endsWith('/status'));assert.equal(options.headers.Authorization,'Bearer '+credential);return {status:200,json:async()=>({ok:true,build:'1.0.7',epoch:'epoch'})};},require:name=>{
  if(name==='uxp')return {storage:{localFileSystem:{getPluginFolder:async()=>({getEntry:async filename=>{assert.equal(filename,'installer-config.json');pluginReads++;return {read:async()=>JSON.stringify({schema:1,build:'1.0.7',port:48771,token:credential})};}})}}};
  if(name==='premierepro')return {};
  if(name==='./connect.js')return connect;
  if(name==='./visibility.js')return ()=>({});
  if(name==='./workflow.js')return ()=>({attach:async()=>({converted:false})});
  throw Error(name);
 }};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../uxp/index.js','utf8'),context);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(pluginReads,1);assert.equal(fetches,2);assert.equal(elements.run.disabled,false);assert.match(elements.status.textContent,/Ready/);
 console.log('PASS automatic packaged pairing, helper-start retry, auth/build refusal, unfinished-session stop, real panel startup with mocked UXP/HTTP.');
})().catch(e=>{console.error(e);process.exitCode=1;});
