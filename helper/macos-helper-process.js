'use strict';

const BUILD='1.0.7',PORT=48771;

function bridgeSocketPath(req){
 const path=req('path'),os=req('os'),processModule=req('process');
 const owner=typeof processModule.getuid==='function'?String(processModule.getuid()):'user';
 return path.join(os.tmpdir(),'ryze-captiontool-v1-'+owner+'.sock');
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
   if(response.ok&&response.build===BUILD)return;
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
 await waitForBridge(req,bridgePath,config.token);

 let cachedState={phase:'idle',lines:[]};
 const engine={
  state:()=>cachedState,
  dispatch:async(op,args)=>{
   const response=await bridgeRequest(req,bridgePath,config.token,{type:'dispatch',id:crypto.randomBytes(16).toString('hex'),op,args},60000);
   if(response.state)cachedState=response.state;
   if(!response.ok){const error=Error(response.error||'CEP engine command failed');error.state=response.state;throw error;}
   return response.state;
  }
 };
 const serverFactory=req(path.join(root,'server.js'));
 let bindRetries=0;
 const server=serverFactory(req('http'),config.token,crypto.randomBytes(16).toString('hex'),engine,error=>{
  log('HELPER_SERVER_ERROR '+String(error));
  if(error&&error.code==='EADDRINUSE'&&bindRetries<60){
   bindRetries++;
   return setTimeout(()=>server.listen(PORT,'127.0.0.1'),500);
  }
  processModule.exitCode=1;
  setTimeout(()=>processModule.exit(1),25);
 });
 log('HELPER_PROCESS_STARTED pid='+String(processModule.pid));
 server.on('listening',()=>log('HELPER_PORT_LISTENING 127.0.0.1:'+String(PORT)));

 let failures=0;
 const health=setInterval(async()=>{
  try{await bridgeRequest(req,bridgePath,config.token,{type:'ping'},1000);failures=0;}
  catch(error){
   failures++;
   if(failures>=5){log('HELPER_ENGINE_BRIDGE_LOST '+String(error));clearInterval(health);server.close(()=>processModule.exit(0));}
  }
 },2000);
 if(typeof health.unref==='function')health.unref();
 const stop=()=>{clearInterval(health);server.close(()=>processModule.exit(0));};
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
