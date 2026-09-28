'use strict';
const assert=require('assert'),path=require('path'),EventEmitter=require('events');
const launch=require('../helper/macos-launcher');

(async()=>{
 const logs=[];
 const http={marker:'http'};
 const io={id:()=> '0123456789abcdef0123456789abcdef'};
 const engine={state:()=>({phase:'idle'})};
 const server=new EventEmitter();
 server.address=()=>({address:'127.0.0.1',port:48771});
 const req=name=>{
  if(name==='fs')return {readFileSync:(file,encoding)=>{assert.equal(file,path.join('/extension-data','connection.json'));assert.equal(encoding,'utf8');return JSON.stringify({schema:1,build:'1.0.7',port:48771,token:'a'.repeat(64)});}};
  if(name==='path')return path;
  if(name==='process')return {platform:'win32',pid:4242};
  if(name==='http')return http;
  if(name===path.join('/extension','engine.js'))return receivedIo=>{assert.equal(receivedIo,io);return engine;};
  if(name===path.join('/extension','server.js'))return (receivedHttp,token,epoch,receivedEngine,onError)=>{
   assert.equal(receivedHttp,http);assert.equal(token,'a'.repeat(64));assert.equal(epoch,io.id());assert.equal(receivedEngine,engine);assert.equal(typeof onError,'function');return server;
  };
  throw Error('Unexpected require: '+name);
 };
 const result=launch({require:req,root:'/extension',dataDir:'/extension-data',io,log:value=>logs.push(value),platform:'darwin'});
 assert.equal(result,server);
 server.emit('listening');
 assert(logs.includes('HELPER_LAUNCHER_PATH '+path.join('/extension','helper','macos-launcher.js')));
 assert(logs.includes('HELPER_LAUNCH_ATTEMPTED true'));
 assert(logs.includes('HELPER_PROCESS_STARTED CEP_NODE pid=4242'));
 assert(logs.includes('HELPER_PORT_LISTENING 127.0.0.1:48771'));
 console.log('PASS macOS CEP bootstrap: config, engine/server initialization, launcher diagnostics, and port 48771.');
})().catch(error=>{console.error(error);process.exitCode=1;});
