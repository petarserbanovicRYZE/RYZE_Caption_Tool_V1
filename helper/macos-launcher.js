'use strict';

const BUILD='1.0.7',PORT=48771,LOG_NAME='RYZE_Caption_Tool_V1_bridge.txt';

function loadConfig(req,dataDir){
 const fs=req('fs'),path=req('path');
 const config=JSON.parse(fs.readFileSync(path.join(dataDir,'connection.json'),'utf8'));
 if(config.schema!==1||config.build!==BUILD||config.port!==PORT||!/^[a-f0-9]{64}$/.test(config.token||''))throw Error('Invalid macOS helper connection config');
 return config;
}

function loadNodePath(req,dataDir){
 const fs=req('fs'),path=req('path');
 const runtimePath=path.join(dataDir,'runtime-mac.json');
 const runtime=JSON.parse(fs.readFileSync(runtimePath,'utf8'));
 if(runtime.schema!==1||runtime.build!==BUILD||typeof runtime.nodePath!=='string'||!path.isAbsolute(runtime.nodePath))throw Error('Invalid macOS Node runtime config');
 fs.accessSync(runtime.nodePath,fs.constants.X_OK);
 return runtime.nodePath;
}

function socketPath(req){
 const path=req('path'),processModule=req('process');
 const owner=typeof processModule.getuid==='function'?String(processModule.getuid()):'user';
 return path.join('/tmp','ryze-captiontool-v1-'+owner,'engine.sock');
}

function fileLogger(req){
 const fs=req('fs'),path=req('path'),os=req('os');
 const logPath=path.join(os.tmpdir(),LOG_NAME);
 return line=>fs.appendFileSync(logPath,new Date().toISOString()+' '+line+'\n','utf8');
}

function spawnHelper(req,root,dataDir,log){
 const fs=req('fs'),path=req('path'),processModule=req('process'),childProcess=req('child_process');
 const nodePath=loadNodePath(req,dataDir);
 const entry=path.join(root,'helper','macos-helper-process.js');
 fs.accessSync(entry,fs.constants.R_OK);
 log('HELPER_LAUNCHER_PATH '+path.join(root,'helper','macos-launcher.js'));
 log('HELPER_LAUNCH_METHOD child_process.spawn node');
 log('HELPER_LAUNCH_ATTEMPTED true');
 const child=childProcess.spawn(nodePath,[entry,root,dataDir],{
  detached:true,
  stdio:'ignore',
  env:Object.assign({},processModule.env||{}, {RYZE_HELPER_LOG:path.join(req('os').tmpdir(),LOG_NAME)})
 });
 child.once('error',error=>log('HELPER_PROCESS_ERROR '+String(error)));
 child.once('spawn',()=>log('HELPER_PROCESS_STARTED pid='+String(child.pid)));
 child.unref();
 return child;
}

function reply(socket,value){
 if(!socket.destroyed)socket.end(JSON.stringify(value)+'\n');
}

function startEngineBridge(options){
 if(!options||typeof options.require!=='function'||!options.root||!options.dataDir||!options.io)throw Error('Invalid macOS helper launcher options');
 const req=options.require,root=options.root,dataDir=options.dataDir,io=options.io;
 const fs=req('fs'),path=req('path'),net=req('net'),processModule=req('process');
 const log=typeof options.log==='function'?options.log:fileLogger(req);
 if((options.platform||processModule.platform)!=='darwin')throw Error('macOS helper launcher requires Darwin');
 const config=loadConfig(req,dataDir),generation=io.id();
 const engine=req(path.join(root,'engine.js'))(io);
 const bridgePath=options.socketPath||socketPath(req);
 let child=null,closed=false,ownsSocket=false,busy=false,recovering=false,restarts=0,restartTimer=null;
 const launch=()=>{
  if(closed)return;
  try{
   child=spawnHelper(req,root,dataDir,log);
   child.once('exit',(code,signal)=>{
    log('HELPER_PROCESS_EXIT code='+code+' signal='+signal);
    if(!closed&&(code!==0||signal)&&restarts<3){restarts++;restartTimer=setTimeout(launch,1000*restarts);}
   });
  }catch(error){log('HELPER_PROCESS_ERROR '+String(error));}
 };
 if(!options.socketPath){
  const directory=path.dirname(bridgePath);
  try{fs.mkdirSync(directory,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
  const stat=fs.lstatSync(directory);
  if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==processModule.getuid())throw Error('Unsafe helper socket directory');
  fs.chmodSync(directory,0o700);
 }

 const bridge=net.createServer(socket=>{
  let raw='',handled=false;
  socket.setEncoding('utf8');
  socket.setTimeout(5000,()=>socket.destroy());
  socket.on('data',chunk=>{
   if(handled)return;
   raw+=chunk;
   if(raw.length>1048576){handled=true;return reply(socket,{ok:false,error:'Bridge request too large'});}
   const newline=raw.indexOf('\n');
   if(newline<0)return;
   handled=true;
   try{
    const request=JSON.parse(raw.slice(0,newline));
    if(request.token!==config.token)throw Error('Unauthorized bridge request');
    if(request.type==='ping')return reply(socket,{ok:true,build:BUILD,generation,state:engine.state()});
    if(request.generation!==generation)throw Error('CEP engine session changed; refusing replay');
    if(request.type!=='dispatch'||!/^[a-zA-Z0-9_-]{8,96}$/.test(request.id||''))throw Error('Invalid bridge request');
    if(busy)throw Error('Another engine command is still running');
    busy=true;
    socket.setTimeout(0);
    Promise.resolve().then(()=>engine.dispatch(request.op,request.args)).then(
     state=>reply(socket,{ok:true,state}),
     error=>reply(socket,{ok:false,error:String(error),state:engine.state()})
    ).finally(()=>{busy=false;});
   }catch(error){reply(socket,{ok:false,error:String(error)});}
  });
  socket.on('error',error=>log('HELPER_ENGINE_CLIENT_ERROR '+String(error)));
 });
 const listen=()=>bridge.listen(bridgePath);
 bridge.on('error',error=>{
  log('HELPER_ENGINE_BRIDGE_ERROR '+String(error));
  if(error.code!=='EADDRINUSE'||recovering||closed)return;
  recovering=true;
  // An active owner must never be unlinked by a second CEP instance.
  const probe=net.createConnection({path:bridgePath});
  probe.setTimeout(1000,()=>probe.destroy());
  probe.once('connect',()=>{log('HELPER_ENGINE_ALREADY_RUNNING');probe.destroy();});
  probe.once('error',probeError=>{
   if(!['ECONNREFUSED','ENOENT'].includes(probeError.code)||closed)return;
   try{
    if(fs.existsSync(bridgePath)){
     if(!fs.lstatSync(bridgePath).isSocket())throw Error('Refusing to replace non-socket bridge');
     fs.unlinkSync(bridgePath);
    }
    listen();
   }catch(failure){log('HELPER_ENGINE_RECOVERY_ERROR '+String(failure));}
  });
 });
 bridge.on('listening',()=>{
  ownsSocket=true;
  try{fs.chmodSync(bridgePath,0o600);}catch(error){log('HELPER_ENGINE_BRIDGE_PERMISSIONS_ERROR '+String(error));}
  log('HELPER_ENGINE_BRIDGE_LISTENING '+bridgePath);
  launch();
 });
 listen();

 return {
  close(){
   closed=true;
   clearTimeout(restartTimer);
   try{bridge.close();}catch(error){log('HELPER_ENGINE_BRIDGE_CLOSE_ERROR '+String(error));}
   try{if(ownsSocket&&fs.existsSync(bridgePath)&&fs.lstatSync(bridgePath).isSocket())fs.unlinkSync(bridgePath);}catch(error){log('HELPER_ENGINE_BRIDGE_CLEANUP_ERROR '+String(error));}
  },
  child:()=>child,
  socketPath:bridgePath
 };
}

module.exports=startEngineBridge;
module.exports.spawnHelper=spawnHelper;
module.exports.socketPath=socketPath;

if(require.main===module){
 try{
  const root=process.argv[2],dataDir=process.argv[3];
  if(process.platform!=='darwin')throw Error('macOS helper launcher requires Darwin');
  if(!root||!dataDir)throw Error('macOS helper root and data directory are required');
  loadConfig(require,dataDir);
  spawnHelper(require,root,dataDir,fileLogger(require));
 }catch(error){
  try{fileLogger(require)('HELPER_LAUNCH_STOP '+String(error));}catch(ignore){}
  process.exitCode=1;
 }
}
