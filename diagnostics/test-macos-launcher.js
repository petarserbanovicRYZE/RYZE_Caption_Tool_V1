'use strict';
const assert=require('assert'),path=require('path'),EventEmitter=require('events');
const launch=require('../helper/macos-launcher');

(async()=>{
 const logs=[];let childUnref=false,spawned=null,bridgeHandler=null,chmodPath=null;
 const fs={
  constants:{R_OK:4,X_OK:1},
  readFileSync:(file,encoding)=>{
   assert.equal(encoding,'utf8');
   if(file===path.join('/extension-data','connection.json'))return JSON.stringify({schema:1,build:'1.0.7',port:48771,token:'a'.repeat(64)});
   if(file===path.join('/extension-data','runtime-mac.json'))return JSON.stringify({schema:1,build:'1.0.7',nodePath:'/opt/homebrew/bin/node'});
   throw Error('Unexpected read: '+file);
  },
  accessSync:(file,mode)=>{assert(mode===1||mode===4);},existsSync:()=>false,
  chmodSync:(file,mode)=>{chmodPath=file;assert.equal(mode,0o600);},
  appendFileSync:()=>{},lstatSync:()=>({isSocket:()=>true}),unlinkSync:()=>{}
 };
 const processModule={platform:'win32',pid:4242,env:{TEST:'1'},getuid:()=>501};
 const child=new EventEmitter();child.pid=7331;child.unref=()=>{childUnref=true;};
 const bridge=new EventEmitter();
 bridge.listen=file=>{assert.equal(file,path.join('/tmp','ryze-test.sock'));setImmediate(()=>bridge.emit('listening'));};
 bridge.close=()=>{};
 const engine={state:()=>({phase:'idle'}),dispatch:async()=>({phase:'ready'})};
 const req=name=>{
  if(name==='fs')return fs;if(name==='path')return path;if(name==='process')return processModule;if(name==='os')return {tmpdir:()=>'/tmp'};
  if(name==='net')return {createServer:handler=>{bridgeHandler=handler;return bridge;}};
  if(name==='child_process')return {spawn:(command,args,options)=>{spawned={command,args,options};setImmediate(()=>child.emit('spawn'));return child;}};
  if(name===path.join('/extension','engine.js'))return receivedIo=>{assert.equal(receivedIo.id(),'0123456789abcdef0123456789abcdef');return engine;};
  throw Error('Unexpected require: '+name);
 };
 const controller=launch({require:req,root:'/extension',dataDir:'/extension-data',socketPath:path.join('/tmp','ryze-test.sock'),io:{id:()=> '0123456789abcdef0123456789abcdef'},log:value=>logs.push(value),platform:'darwin'});
 await new Promise(resolve=>setImmediate(()=>setImmediate(resolve)));
 assert.equal(chmodPath,path.join('/tmp','ryze-test.sock'));
 assert.equal(spawned.command,'/opt/homebrew/bin/node');
 assert.deepEqual(spawned.args,[path.join('/extension','helper','macos-helper-process.js'),'/extension','/extension-data']);
 assert.equal(spawned.options.detached,true);assert.equal(spawned.options.stdio,'ignore');assert.equal(childUnref,true);
 assert(logs.includes('HELPER_LAUNCH_METHOD child_process.spawn node'));
 assert(logs.includes('HELPER_LAUNCH_ATTEMPTED true'));
 assert(logs.includes('HELPER_PROCESS_STARTED pid=7331'));
 const socket=new EventEmitter();let response='';socket.destroyed=false;socket.setEncoding=()=>{};socket.setTimeout=()=>{};socket.end=value=>{response=value;};
 bridgeHandler(socket);socket.emit('data',JSON.stringify({token:'a'.repeat(64),type:'ping'})+'\n');
 assert.deepEqual(JSON.parse(response),{ok:true,build:'1.0.7',generation:'0123456789abcdef0123456789abcdef',state:{phase:'idle'}});
 controller.close();
 console.log('PASS macOS launcher: private CEP bridge and direct child_process.spawn diagnostics.');
})().catch(error=>{console.error(error);process.exitCode=1;});
