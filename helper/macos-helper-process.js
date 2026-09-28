'use strict';

const BUILD='1.0.7',PORT=48771;

function bridgeSocketPath(req){
 const path=req('path'),processModule=req('process');
 const owner=typeof processModule.getuid==='function'?String(processModule.getuid()):'user';
 return path.join('/tmp','ryze-captiontool-v1-'+owner,'engine.sock');
}

function bridgeRequest(req,bridgePath,token,value,timeoutMs=3000){
 const net=req('net');
 return new Promise((resolve,reject)=>{
  const socket=net.createConnection({path:bridgePath});
  let raw='',done=false;
  const finish=(error,result)=>{if(done)return;done=true;socket.destroy();error?reject(error):resolve(result);};
  socket.setEncoding('utf8');
  socket.setTimeout(timeoutMs,()=>finish(Error('CEP engine bridge timed out')));
  socket.on('connect',()=>socket.write(JSON.stringify(Object.assign({token},value))+'\n'));
  socket.on('data',chunk=>{
   raw+=chunk;
   if(raw.length>1048576)return finish(Error('CEP engine response too large'));
   const newline=raw.indexOf('\n');
   if(newline<0)return;
   try{finish(null,JSON.parse(raw.slice(0,newline)));}catch(error){finish(error);}
  });
  socket.on('error',finish);
  socket.on('end',()=>{if(!done)finish(Error('CEP engine bridge closed without a response'));});
 });
}

async function waitForBridge(req,bridgePath,token){
 let last;
 for(let attempt=0;attempt<60;attempt++){
  try{
   const response=await bridgeRequest(req,bridgePath,token,{type:'ping'},1000);
   if(response.ok&&response.build===BUILD&&/^[a-f0-9]{32}$/.test(response.generation||''))return response;
   throw Error(response.error||'CEP engine bridge version mismatch');
  }catch(error){last=error;await new Promise(resolve=>setTimeout(resolve,250));}
 }
 throw Error('CEP engine bridge unavailable: '+String(last));
}

async function start(options={}){
 const req=options.require||require,path=req('path'),fs=req('fs'),os=req('os'),crypto=req('crypto'),processModule=req('process');
 const root=options.root||processModule.argv[2],dataDir=options.dataDir||processModule.argv[3];
 if((options.platform||processModule.platform)!=='darwin')throw Error('macOS helper process requires Darwin');
 if(!root||!dataDir)throw Error('macOS helper root and data directory are required');
 const logPath=options.logPath||processModule.env.RYZE_HELPER_LOG||path.join(os.tmpdir(),'RYZE_Caption_Tool_V1_bridge.txt');
 const log=typeof options.log==='function'?options.log:line=>fs.appendFileSync(logPath,new Date().toISOString()+' '+line+'\n','utf8');
 const config=JSON.parse(fs.readFileSync(path.join(dataDir,'connection.json'),'utf8'));
 if(config.schema!==1||config.build!==BUILD||config.port!==PORT||!/^[a-f0-9]{64}$/.test(config.token||''))throw Error('Invalid macOS helper connection config');
 const bridgePath=options.socketPath||bridgeSocketPath(req);
 const initial=await waitForBridge(req,bridgePath,config.token);
 const generation=initial.generation;

 let cachedState=initial.state;
 const engine={
  state:()=>cachedState,
  dispatch:async(op,args)=>{
   // The HTTP layer retains the original promise for retry/deduplication. Do not
   // time out an engine mutation while Premiere is still carrying it out.
   const response=await bridgeRequest(req,bridgePath,config.token,{type:'dispatch',generation,id:crypto.randomBytes(16).toString('hex'),op,args},0);
   if(response.state)cachedState=response.state;
   if(!response.ok){const error=Error(response.error||'CEP engine command failed');error.state=response.state;throw error;}
   return response.state;
  }
 };
 const serverFactory=req(path.join(root,'server.js'));
 const http=req('http'),macHttp=Object.create(http);
 macHttp.createServer=handler=>http.createServer((request,response)=>{
  if(request.method==='GET'&&request.url==='/mac-health'&&request.headers.host==='127.0.0.1:'+PORT&&request.headers.authorization==='Bearer '+config.token){
   response.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store','Connection':'close'});
   return response.end(JSON.stringify({ok:true,build:BUILD,generation,pid:processModule.pid}));
  }
  return handler(request,response);
 });
 let bindRetries=0,stopped=false,retryTimer=null;
 const server=serverFactory(macHttp,config.token,crypto.randomBytes(16).toString('hex'),engine,error=>{
  log('HELPER_SERVER_ERROR '+String(error));
  if(error&&error.code==='EADDRINUSE'&&bindRetries<60){
   bindRetries++;
   // A reconnect click can race the already healthy process. Exit when that
   // process serves our engine generation; never replace an unrelated listener.
   const probe=http.get({hostname:'127.0.0.1',port:PORT,path:'/mac-health',headers:{Host:'127.0.0.1:'+PORT,Authorization:'Bearer '+config.token}},response=>{
    let raw='';response.on('data',chunk=>{raw+=chunk;if(raw.length>1048576)probe.destroy();});
    response.on('end',()=>{
     try{const state=JSON.parse(raw);if(response.statusCode===200&&state.ok&&state.generation===generation){log('HELPER_ALREADY_RUNNING pid='+state.pid);return stop();}}catch(ignore){}
     retry();
    });
   });
   const retry=()=>{if(!stopped&&!retryTimer)retryTimer=setTimeout(()=>{retryTimer=null;if(!stopped)server.listen(PORT,'127.0.0.1');},500);};
   probe.setTimeout(1000,()=>probe.destroy(Error('Listener probe timed out')));
   probe.on('error',retry);
   return;
  }
  processModule.exitCode=1;
  setTimeout(()=>processModule.exit(1),25);
 });
 log('HELPER_PROCESS_STARTED pid='+String(processModule.pid));
 server.on('listening',()=>log('HELPER_PORT_LISTENING 127.0.0.1:'+String(PORT)));

 let failures=0,checking=false;
 const health=setInterval(async()=>{
  if(checking||stopped)return;checking=true;
  try{
   const response=await bridgeRequest(req,bridgePath,config.token,{type:'ping'},1000);
   if(!response.ok||response.generation!==generation){log('HELPER_ENGINE_SESSION_CHANGED');return stop();}
   cachedState=response.state;failures=0;
  }
  catch(error){
   failures++;
   if(failures>=2){log('HELPER_ENGINE_BRIDGE_LOST '+String(error));stop();}
  }
  finally{checking=false;}
 },2000);
 if(typeof health.unref==='function')health.unref();
 const stop=()=>{
  if(stopped)return;stopped=true;clearInterval(health);clearTimeout(retryTimer);
  const force=setTimeout(()=>processModule.exit(0),1000);if(force.unref)force.unref();
  server.close(()=>{clearTimeout(force);processModule.exit(0);});
 };
 processModule.once('SIGTERM',stop);processModule.once('SIGINT',stop);
 return server;
}

module.exports=start;
module.exports.bridgeRequest=bridgeRequest;
module.exports.bridgeSocketPath=bridgeSocketPath;

if(require.main===module)start().catch(error=>{
 try{require('fs').appendFileSync(process.env.RYZE_HELPER_LOG||require('path').join(require('os').tmpdir(),'RYZE_Caption_Tool_V1_bridge.txt'),new Date().toISOString()+' HELPER_PROCESS_STOP '+String(error)+'\n','utf8');}catch(ignore){}
 process.exitCode=1;
});
