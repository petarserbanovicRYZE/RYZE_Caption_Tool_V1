'use strict';

// Real Darwin sockets, spawned Node processes and the production HTTP factory.
// Only the Premiere engine is a fixture: hosted runners do not contain Premiere.
const fs=require('fs'),os=require('os'),path=require('path'),http=require('http');
const assert=require('assert'),crypto=require('crypto'),{spawn}=require('child_process');
const launcher=require('../helper/macos-launcher');
const {bridgeRequest}=require('../helper/macos-helper-process');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

if(process.argv[2]==='--bridge'){
 const root=process.argv[3],dataDir=process.argv[4];
 const controller=launcher({require,root,dataDir,io:{id:()=>crypto.randomBytes(16).toString('hex')},log:line=>console.log(line)});
 process.once('SIGTERM',()=>{controller.close();process.exit(0);});
}else if(process.platform!=='darwin'){
 console.log('SKIP real macOS process lifecycle tests: requires Darwin (run in Mac Build).');
}else{
 (async()=>{
  const children=[],helperPids=new Set(),logs=[];
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ryze runtime spaces '));
  const token=crypto.randomBytes(32).toString('hex');
  const data=path.join(dir,'User Data'),root=path.join(dir,'CEP extension');
  const call=(route,body,auth=token)=>new Promise((resolve,reject)=>{
   const request=http.request({hostname:'127.0.0.1',port:48771,path:route,method:body?'POST':'GET',headers:{Host:'127.0.0.1:48771',Authorization:'Bearer '+auth,'Content-Type':'application/json'}},response=>{
    let raw='';response.on('data',chunk=>raw+=chunk);response.on('end',()=>{try{resolve({status:response.statusCode,...JSON.parse(raw)});}catch(error){reject(error);}});
   });request.setTimeout(5000,()=>request.destroy(Error('HTTP test timeout')));request.on('error',reject);request.end(body?JSON.stringify(body):undefined);
  });
  const until=async(predicate)=>{let error;for(let i=0;i<100;i++){try{const value=await predicate();if(value)return value;}catch(e){error=e;}await pause(150);}throw error||Error('Lifecycle condition timed out');};
  const bridge=()=>{
   const child=spawn(process.execPath,[__filename,'--bridge',root,data],{stdio:['ignore','pipe','pipe']});children.push(child);
   child.stdout.on('data',chunk=>{logs.push(String(chunk));for(const match of String(chunk).matchAll(/HELPER_PROCESS_STARTED pid=(\d+)/g))helperPids.add(Number(match[1]));});
   child.stderr.on('data',chunk=>logs.push(String(chunk)));return child;
  };
  try{
   try{await call('/status');throw Error('Port 48771 is already occupied; refusing to disturb an existing service');}catch(error){if(error.code!=='ECONNREFUSED')throw error;}
   fs.mkdirSync(data);fs.mkdirSync(path.join(root,'helper'),{recursive:true});
   fs.writeFileSync(path.join(data,'connection.json'),JSON.stringify({schema:1,build:'1.0.7',port:48771,token}));
   fs.writeFileSync(path.join(data,'runtime-mac.json'),JSON.stringify({schema:1,build:'1.0.7',nodePath:process.execPath}));
   for(const file of ['macos-helper-process.js','macos-launcher.js'])fs.copyFileSync(path.join(__dirname,'../helper',file),path.join(root,'helper',file));
   fs.copyFileSync(path.join(__dirname,'../cep/server.js'),path.join(root,'server.js'));
   fs.writeFileSync(path.join(root,'engine.js'),`module.exports=()=>{let count=0;return {state:()=>({phase:'converted',count}),dispatch:async op=>{if(op==='slow'){count++;await new Promise(r=>setTimeout(r,400));}return {phase:'converted',count};}}};`);
   let owner=bridge();
   let status=await until(async()=>{const s=await call('/status');return s.ok&&s;});
   assert.equal(status.state.phase,'converted','Checkpoint state must not be presented as idle');
   assert.equal((await call('/status',null,'wrong')).status,403);
   const health=await call('/mac-health');helperPids.add(health.pid);
   const duplicate=bridge();
   await until(()=>logs.join('').includes('HELPER_ENGINE_ALREADY_RUNNING'));
   duplicate.kill('SIGTERM');await pause(300);
   assert.equal((await call('/mac-health')).pid,health.pid,'A duplicate CEP owner must not delete the live socket');
   const body={epoch:status.epoch,requestID:'same_request_1234',op:'slow',args:{}};
   const [one,two]=await Promise.all([call('/command',body),call('/command',body)]);
   assert.equal(one.state.count,1);assert.deepEqual(one,two,'HTTP retry must share one mutation');
   const slow=call('/command',{...body,requestID:'second_request_1234'});
   await pause(75);
   const collision=await bridgeRequest(require,launcher.socketPath(require),token,{type:'dispatch',generation:health.generation,id:'parallel_request',op:'slow'},1000);
   assert.equal(collision.ok,false);assert.match(collision.error,/still running/);await slow;
   const extra=launcher.spawnHelper(require,root,data,()=>{});children.push(extra);
   await until(()=>extra.exitCode===0);
   assert.equal((await call('/mac-health')).pid,health.pid,'Reconnect must reuse an already healthy helper');
   process.kill(health.pid,'SIGKILL');
   status=await until(async()=>{const s=await call('/status');return s.ok&&s.epoch!==body.epoch&&s;});
   const replacement=await call('/mac-health');helperPids.add(replacement.pid);
   assert.equal((await call('/command',body)).ok,false,'Old epoch must be rejected after child restart');
   const previousEpoch=status.epoch;
   owner.kill('SIGKILL'); // Leaves a stale Unix socket, just like a CEP crash.
   await until(()=>owner.signalCode==='SIGKILL');
   owner=bridge();
   status=await until(async()=>{const s=await call('/status');return s.ok&&s.epoch!==previousEpoch&&s;});
   const newHealth=await call('/mac-health');helperPids.add(newHealth.pid);
   assert.notEqual(newHealth.generation,health.generation);
   const stale=await bridgeRequest(require,launcher.socketPath(require),token,{type:'dispatch',generation:health.generation,id:'stale_request_123',op:'slow'});
   assert.equal(stale.ok,false);assert.match(stale.error,/session changed/);
   owner.kill('SIGTERM');
   await until(async()=>{try{await call('/status');return false;}catch(e){return e.code==='ECONNREFUSED';}});
   console.log('PASS real macOS runtime: spaces, authentication, restored state, duplicate launch, retry deduplication, concurrent command refusal, child crash recovery, stale socket recovery, engine generation, shutdown.');
  }catch(error){console.error(logs.join(''));throw error;}
  finally{
   for(const child of children)if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');
   for(const pid of helperPids)try{process.kill(pid,'SIGTERM');}catch(ignore){}
   await pause(300);fs.rmSync(dir,{recursive:true,force:true});
  }
 })().catch(error=>{console.error(error);process.exitCode=1;});
}
