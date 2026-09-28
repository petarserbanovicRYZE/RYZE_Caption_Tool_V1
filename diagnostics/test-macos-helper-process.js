'use strict';
const assert=require('assert'),path=require('path'),EventEmitter=require('events');
const start=require('../helper/macos-helper-process');

(async()=>{
 const logs=[];let proxyEngine=null,requestCount=0;
 const token='b'.repeat(64),processModule=new EventEmitter();
 processModule.platform='win32';processModule.pid=8442;processModule.argv=[];processModule.env={};processModule.getuid=()=>501;processModule.exit=()=>{};
 const fs={readFileSync:(file,encoding)=>{assert.equal(file,path.join('/data','connection.json'));assert.equal(encoding,'utf8');return JSON.stringify({schema:1,build:'1.0.7',port:48771,token});},appendFileSync:()=>{}};
 const crypto={randomBytes:()=>Buffer.alloc(16,7)};
 const net={createConnection:({path:file})=>{
  assert.equal(file,'/tmp/ryze-test.sock');
  const socket=new EventEmitter();socket.destroyed=false;socket.setEncoding=()=>{};socket.setTimeout=()=>{};socket.destroy=()=>{socket.destroyed=true;};
  socket.write=raw=>{requestCount++;const request=JSON.parse(raw);assert.equal(request.token,token);const response=request.type==='ping'?{ok:true,build:'1.0.7'}:{ok:true,state:{phase:'ready',op:request.op}};setImmediate(()=>socket.emit('data',JSON.stringify(response)+'\n'));};
  setImmediate(()=>socket.emit('connect'));return socket;
 }};
 const server=new EventEmitter();server.close=callback=>callback&&callback();
 const req=name=>{
  if(name==='path')return path;if(name==='fs')return fs;if(name==='os')return {tmpdir:()=>'/tmp'};if(name==='crypto')return crypto;if(name==='process')return processModule;if(name==='net')return net;if(name==='http')return {marker:true};
  if(name===path.join('/extension','server.js'))return (http,receivedToken,epoch,engine,onError)=>{assert.equal(receivedToken,token);assert.equal(typeof onError,'function');proxyEngine=engine;return server;};
  throw Error('Unexpected require: '+name);
 };
 const result=await start({require:req,root:'/extension',dataDir:'/data',socketPath:'/tmp/ryze-test.sock',platform:'darwin',log:value=>logs.push(value)});
 assert.equal(result,server);server.emit('listening');
 assert.equal((await proxyEngine.dispatch('status',{})).phase,'ready');
 assert.equal(proxyEngine.state().op,'status');
 assert(logs.includes('HELPER_PROCESS_STARTED pid=8442'));
 assert(logs.includes('HELPER_PORT_LISTENING 127.0.0.1:48771'));
 assert(requestCount>=2);
 console.log('PASS macOS helper child: CEP bridge readiness, dispatch proxy, process PID, and port diagnostics.');
})().catch(error=>{console.error(error);process.exitCode=1;});
