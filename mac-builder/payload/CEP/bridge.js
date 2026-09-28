'use strict';
(function(){
 const req=window.cep_node&&window.cep_node.require?window.cep_node.require:window.require;
 const fs=req('fs'),path=req('path'),crypto=req('crypto'),zlib=req('zlib');
 const logPath=path.join(req('os').tmpdir(),'RYZE_Caption_Tool_V1_bridge.txt');
 function log(s){fs.appendFileSync(logPath,new Date().toISOString()+' '+s+'\n','utf8');}
 try{
  let root=String(window.__adobe_cep__.getSystemPath('extension'));
  if(/^file:\/\//i.test(root)){root=decodeURIComponent(root.replace(/^file:\/\//i,''));root=root.replace(/^localhost\//i,'/');if(root[0]!=='/'&&!/^[A-Za-z]:[\\/]/.test(root))root='//'+root;}
  root=root.replace(/^[\\/]+(?=[A-Za-z]:[\\/])/,'');
  const env=req('process').env;
  const appSupport=env.APPDATA||(env.HOME?path.join(env.HOME,'Library','Application Support'):null);
  if(!appSupport)throw Error('User application support path unavailable');
  const dataDir=path.join(appSupport,'RYZE','CaptionToolV1');
  const checkpointPath=path.join(dataDir,'session.json');
  function atomic(value){const tmp=checkpointPath+'.tmp';const fd=fs.openSync(tmp,'w');try{fs.writeFileSync(fd,JSON.stringify(value),'utf8');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,checkpointPath);}
  function hostScript(script){return new Promise((resolve,reject)=>window.__adobe_cep__.evalScript(script,raw=>{try{const r=JSON.parse(raw);if(!r.ok)throw Error(r.error);resolve(r);}catch(e){reject(e);}}));} 
  const allowed=new Set(['exportBugReport','prepare','add','checkAdded','importCard','inspectClip','setClip','complete','guard','remaining','removeOne','remove','finish','status','cancelPrepared','importInspect','importSet','importBatch','inspectAll','removeChunk']);
  const io={
   load:()=>{if(!fs.existsSync(checkpointPath))return null;const saved=JSON.parse(fs.readFileSync(checkpointPath,'utf8'));if(saved&&['finished','abandoned'].includes(saved.phase))return null;return saved;},
   checkpoint:value=>atomic(value),
   archive:value=>{const dir=path.join(dataDir,'history');if(!fs.existsSync(dir))fs.mkdirSync(dir);if(!/^[a-f0-9]{32}$/.test(value.batch))throw Error('Invalid saved batch identity');const dest=path.join(dir,value.batch+'.json'),text=JSON.stringify(value);if(fs.existsSync(dest)){if(fs.readFileSync(dest,'utf8')!==text)throw Error('Saved history differs');return;}const fd=fs.openSync(dest,'wx');try{fs.writeFileSync(fd,text,'utf8');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}},
   markPending:()=>atomic({phase:'interrupted',lines:['Conversion preparation was interrupted. Do not start another batch until the project is inspected.']}),
   restoreHost:async folder=>{const live=await hostScript('RYZEV1.status()');if(live.state&&live.state.phase!=='finished')return;
    const saved=JSON.parse(fs.readFileSync(path.join(folder,'host-state.json'),'utf8'));
    await hostScript('RYZEV1.restoreCompleted('+JSON.stringify(saved).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029')+')');},
   host:(method,...args)=>new Promise((resolve,reject)=>{
    if(!allowed.has(method))return reject(Error('Unknown host operation'));
    const script='RYZEV1.invoke('+JSON.stringify(method)+',['+args.map(a=>JSON.stringify(encodeURIComponent(String(a)))).join(',')+'])';
    window.__adobe_cep__.evalScript(script,raw=>{try{resolve(JSON.parse(raw));}catch(e){reject(Error('Invalid host response: '+String(e)));}});
   }),
   snapshot:(file,id)=>{const data=fs.readFileSync(file);if(data.length>104857600)throw Error('Snapshot too large');return RYZEReader.parse(zlib.gunzipSync(data,{maxOutputLength:268435456}).toString('utf8'),id);},
   templatePath:name=>path.join(root,'assets','mogrts',name),
   hash:file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
   plan:(...a)=>RYZELayout.plan(...a),id:()=>crypto.randomBytes(16).toString('hex'),pause:ms=>new Promise(r=>setTimeout(r,ms)),
   append:(folder,name,text)=>{const fd=fs.openSync(path.join(folder,name),'a');try{fs.writeFileSync(fd,text,'utf8');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}},
   write:(folder,name,value)=>fs.writeFileSync(path.join(folder,name),JSON.stringify(value,null,2),'utf8')
  };
  if(req('process').platform==='darwin'){
   window.ryzeV1server=req(path.join(root,'helper','macos-launcher.js'))({require:req,root,dataDir,io,log});
  }else{
   const config=JSON.parse(fs.readFileSync(path.join(dataDir,'connection.json'),'utf8'));
   const engine=req(path.join(root,'engine.js'))(io);
   window.ryzeV1server=req(path.join(root,'server.js'))(req('http'),config.token,io.id(),engine,e=>log('SERVER_ERROR '+String(e)));
   log('BOOT; loopback port 48771');
  }
  window.addEventListener('unload',()=>window.ryzeV1server.close());
 }catch(e){log('BOOT_ERROR '+String(e));}
})();
