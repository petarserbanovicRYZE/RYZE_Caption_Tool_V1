'use strict';

// This bootstrap runs inside Premiere's CEP Node context. The engine must stay
// in that context because its host adapter calls Premiere ExtendScript.
module.exports=function launchMacHelper(options){
 if(!options||typeof options.require!=='function'||!options.root||!options.dataDir||!options.io)throw Error('Invalid macOS helper launcher options');
 const req=options.require,root=options.root,dataDir=options.dataDir,io=options.io;
 const fs=req('fs'),path=req('path'),processModule=req('process');
 const log=typeof options.log==='function'?options.log:()=>{};
 const launcherPath=path.join(root,'helper','macos-launcher.js');
 log('HELPER_LAUNCHER_PATH '+launcherPath);
 log('HELPER_LAUNCH_ATTEMPTED true');
 if((options.platform||processModule.platform)!=='darwin')throw Error('macOS helper launcher requires Darwin');

 const configPath=path.join(dataDir,'connection.json');
 const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
 if(config.schema!==1||config.build!=='1.0.7'||config.port!==48771||!/^[a-f0-9]{64}$/.test(config.token||''))throw Error('Invalid macOS helper connection config');

 const http=req('http');
 const engine=req(path.join(root,'engine.js'))(io);
 const epoch=io.id();
 const serverFactory=req(path.join(root,'server.js'));
 const server=serverFactory(http,config.token,epoch,engine,error=>log('HELPER_SERVER_ERROR '+String(error)));
 log('HELPER_PROCESS_STARTED CEP_NODE pid='+String(processModule.pid));
 server.on('listening',()=>{
  const address=server.address();
  const host=address&&address.address?address.address:'127.0.0.1';
  const port=address&&address.port?address.port:48771;
  log('HELPER_PORT_LISTENING '+host+':'+String(port));
 });
 return server;
};
