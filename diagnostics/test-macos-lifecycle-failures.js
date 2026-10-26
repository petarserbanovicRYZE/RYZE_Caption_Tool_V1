'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm'),EventEmitter=require('events');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function load(file,timers){
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../helper',file),'utf8'),{module,require,process,Buffer,setTimeout,clearTimeout,setInterval,clearInterval,...timers},{filename:file});
 return module.exports;
}

async function healthFailures(){
 let health,proxyEngine,dispatchSocket,failPings=false,pings=0;
 const exits=[],logs=[],token='b'.repeat(64),generation='c'.repeat(32);
 const childProcess=new EventEmitter();Object.assign(childProcess,{platform:'darwin',pid:99,env:{},argv:[],exit:code=>exits.push(code)});
 const server=new EventEmitter();server.close=callback=>callback();
 const req=name=>{
  if(name==='path')return path;
  if(name==='fs')return {readFileSync:()=>JSON.stringify({schema:1,build:'1.0.7',port:48771,token})};
  if(name==='os')return {tmpdir:()=>'/tmp'};
  if(name==='crypto')return {randomBytes:()=>Buffer.alloc(16,1)};
  if(name==='process')return childProcess;
  if(name==='http')return {};
  if(name===path.join('/extension','server.js'))return (http,receivedToken,epoch,engine)=>{proxyEngine=engine;return server;};
  if(name==='net')return {createConnection:()=>{
   const socket=new EventEmitter();socket.destroy=()=>{};socket.setEncoding=()=>{};socket.setTimeout=()=>{};
   socket.write=raw=>{
    const request=JSON.parse(raw);
    if(request.type==='dispatch'){dispatchSocket=socket;return;}
    pings++;
    if(failPings)setImmediate(()=>socket.emit('error',Error('Mock disconnected bridge')));
    else setImmediate(()=>socket.emit('data',JSON.stringify({ok:true,build:'1.0.7',generation,state:{phase:'ready'}})+'\n'));
   };
   setImmediate(()=>socket.emit('connect'));return socket;
  }};
  throw Error(name);
 };
 const start=load('macos-helper-process.js',{setInterval:callback=>{health=callback;return {unref(){}};},clearInterval:()=>{}});
 await start({require:req,root:'/extension',dataDir:'/data',socketPath:'/tmp/test.sock',log:line=>logs.push(line)});
 const pending=proxyEngine.dispatch('step',{});await tick();
 failPings=true;
 for(let i=0;i<10;i++)await health();
 assert.equal(pings,1,'A long command must not start competing health pings');
 assert.deepEqual(exits,[],'Health checks must not kill an in-flight engine command');
 dispatchSocket.emit('data',JSON.stringify({ok:true,state:{phase:'converted'}})+'\n');
 assert.equal((await pending).phase,'converted');
 for(let i=0;i<4;i++)await health();
 assert.deepEqual(exits,[],'Brief bridge stalls must not terminate the HTTP process');
 await health();assert.deepEqual(exits,[1],'Bridge loss must request a restart through a nonzero exit');
 assert(logs.some(line=>line.includes('HELPER_ENGINE_BRIDGE_LOST')));
}

async function launchFailures(){
 const timers=[],children=[],logs=[];let bridge;
 const launch=load('macos-launcher.js',{
  setTimeout:callback=>{const timer={callback};timers.push(timer);return timer;},
  clearTimeout:timer=>{if(timer)timer.cancelled=true;}
 });
 const req=name=>{
  if(name==='path')return path;
  if(name==='process')return {platform:'darwin',env:{},getuid:()=>501};
  if(name==='os')return {tmpdir:()=>'/tmp'};
  if(name==='fs')return {
   constants:{R_OK:4,X_OK:1},accessSync(){},chmodSync(){},existsSync:()=>false,
   readFileSync:file=>JSON.stringify(file.endsWith('connection.json')?{schema:1,build:'1.0.7',port:48771,token:'a'.repeat(64)}:{schema:1,build:'1.0.7',nodePath:'/runtime/node'})
  };
  if(name==='net')return {createServer:()=>{bridge=new EventEmitter();bridge.listen=()=>{};bridge.close=()=>{};return bridge;}};
  if(name==='child_process')return {spawn:()=>{const child=new EventEmitter();child.unref=()=>{};children.push(child);return child;}};
  if(name===path.join('/extension','engine.js'))return ()=>({state:()=>({phase:'idle'})});
  throw Error(name);
 };
 const controller=launch({require:req,root:'/extension',dataDir:'/data',socketPath:'/tmp/test.sock',io:{id:()=> 'd'.repeat(32)},log:line=>logs.push(line)});
 bridge.emit('listening');assert.equal(children.length,1);
 for(let i=0;i<3;i++){
  children[i].emit('error',Error('ENOENT'));
  children[i].emit('exit',1,null);
  assert.equal(timers.length,i+1,'Error and exit from one child must schedule only one retry');
  timers[i].callback();assert.equal(children.length,i+2);
 }
 children[3].emit('exit',1,null);
 assert.equal(timers.length,3,'Retries must be bounded');
 assert(logs.some(line=>line.includes('HELPER_RESTART_LIMIT')));
 controller.close();
}

(async()=>{await healthFailures();await launchFailures();console.log('PASS macOS failure injection: slow commands, bridge loss, spawn errors, duplicate failure signals and bounded restarts.');})().catch(error=>{console.error(error);process.exitCode=1;});
