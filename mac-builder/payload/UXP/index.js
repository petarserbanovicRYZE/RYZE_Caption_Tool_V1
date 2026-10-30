'use strict';
const $=id=>document.getElementById(id),run=$('run'),undo=$('undo'),save=$('save'),connect=$('connect'),status=$('status');
const uxp=require('uxp'),storage=uxp.storage.localFileSystem;
const buildInfo=require('./build-info.json'),runtimeNotes=[];
let token=null,report='',busy=false,complete=false,blocked=true,epoch=null,serial=0,template='V3',reportBusy=false;
const client=Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);
function emit(s,state){report=s;if(busy&&state&&['ready','converting'].includes(state.phase)&&state.total){status.textContent='Creating captions '+state.next+' of '+state.total+'…';$('bar').style.width=Math.round(state.next/state.total*100)+'%';}}
function buttons(){run.disabled=busy||blocked;undo.disabled=busy||!complete||blocked;save.disabled=busy||reportBusy;connect.disabled=busy;connect.style.display=blocked&&!busy?'block':'none';for(const id of ['v3','v5','stroke'])$(id).disabled=busy;}
for(const [id,value] of [['v3','V3'],['v5','V5'],['stroke','Stroke']])$(id).addEventListener('click',()=>{template=value;for(const key of ['v3','v5','stroke'])$(key).className=key===id?'chosen':'';});
async function request(path,body,timeoutMs=60000){
 if(!/^[a-f0-9]{64}$/.test(token||''))throw Error('Setup pairing is missing; close Premiere and rerun the current RYZE installer.');
 let timer;
 try{
  return await Promise.race([(async()=>{
   const response=await fetch('http://127.0.0.1:48771'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
   const r=await response.json();if(!r||response.status!==200||!r.ok){const e=Error(r&&r.error||'HTTP '+response.status);e.state=r&&r.state;throw e;}return r;
  })(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Connection timeout; command outcome may be pending')),timeoutMs);})]);
 }finally{clearTimeout(timer);}
}
const api={command:async(op,args)=>{if(!epoch)epoch=(await probe()).epoch;const body={epoch,requestID:client+'_'+(++serial),op,args};try{return(await request('/command',body)).state;}catch(e){if(String(e).includes('Connection timeout'))return(await request('/command',body)).state;throw e;}}};
const workflow=require('./workflow.js')(api,require('./visibility.js')(require('premierepro')),emit);
async function probe(){const r=await request('/status',null,2000);if(r.build!=='1.0.7'||r.revision!==buildInfo.revision)throw Error('Helper version mismatch. Close Premiere and reinstall the matching RYZE package. Panel '+buildInfo.revision+'; helper '+(r.revision||'legacy/unidentified')+'.');return r;}
async function attach(){epoch=(await probe()).epoch;const state=await workflow.attach();complete=state.converted;blocked=false;status.textContent=complete?'Ready. Your last conversion is available for Undo.':'Ready. Choose a style and convert.';
 if(isMac()){diagnostic('HELPER_PORT_REACHABLE = 127.0.0.1:48771');try{const health=await request('/mac-health',null,2000);diagnostic('HELPER_PROCESS_STARTED = true; PID = '+health.pid);}catch(ignore){}}
}
function diagnostic(line){runtimeNotes.push(String(line));if(runtimeNotes.length>100)runtimeNotes.shift();}
function isMac(){try{const platform=require('os').platform();if(platform==='darwin'||platform==='win32')return platform==='darwin';}catch(ignore){}return /\.app(?:\/|$)/i.test(String(uxp.host&&uxp.host.applicationPath||''));}
async function launchMacHelper(){
 if(!isMac())return;
 const launcherPath='/Library/Application Support/RYZE/CaptionToolV1/bin/ryze-caption-helper';
 diagnostic('HELPER_LAUNCHER_PATH = '+launcherPath);
 diagnostic('HELPER_LAUNCH_METHOD = UXP shell.openPath executable -> Node child_process.spawn');
 diagnostic('HELPER_LAUNCH_ATTEMPTED = true');
 status.textContent='Starting RYZE helper…';
 const result=await uxp.shell.openPath(launcherPath,'Start the local RYZE helper so the panel can reconnect.');
 if(result)throw Error(result);
 diagnostic('HELPER_PROCESS_START_REQUESTED = true');
}
async function connectAutomatically(launchHelper){
 if(busy)return;busy=true;blocked=true;buttons();status.textContent='Connecting…';
 try{
  const folder=await storage.getPluginFolder();
  const config=JSON.parse(await (await folder.getEntry('installer-config.json')).read());
  if(config.schema!==1||config.build!=='1.0.7'||config.port!==48771||!/^[a-f0-9]{64}$/.test(config.token||''))throw Error('Setup pairing is missing. Close Premiere and reinstall RYZE.');
  token=config.token;
  await require('./connect.js')(probe,()=>attach(),ms=>new Promise(r=>setTimeout(r,ms)),()=>{status.textContent='Connecting…';},launchHelper?launchMacHelper:null);
 }catch(e){blocked=true;const message=isMac()?String(e.message||e).replace(/\bError:\s*/g,''):String(e);status.textContent=/unfinished|(?:Preparation|Session) recovery/i.test(message)?'Helper connected, but session recovery is required. '+message:message;diagnostic('CONNECT_STOP = '+message);}finally{busy=false;buttons();}
}
connect.addEventListener('click',()=>connectAutomatically(true));
run.addEventListener('click',async()=>{if(busy||blocked)return;busy=true;buttons();$('bar').style.width='0%';$('reportStatus').textContent='';status.textContent='Reading captions. Keep this sequence open.';
 try{const result=await workflow.run(template,true);complete=result.converted;$('bar').style.width='100%';status.textContent='Done — '+template+' captions are ready. Originals are preserved.';}
 catch(e){blocked=true;diagnostic('PANEL_STOP = '+String(e));status.textContent='Conversion stopped: '+String(e)+'. Use Report bug before trying again.';}finally{busy=false;buttons();}});
undo.addEventListener('click',async()=>{if(busy||blocked)return;busy=true;buttons();status.textContent='Restoring original captions…';try{await workflow.undo();complete=false;$('bar').style.width='0%';status.textContent='Undo complete. Original captions restored.';}catch(e){emit(report+'\nUNDO_STOP = '+String(e));status.textContent='Undo stopped. The timeline may have changed. Use Report bug for details.';}finally{busy=false;buttons();}});
save.addEventListener('click',async()=>{
 if(busy||reportBusy)return;reportBusy=true;buttons();$('reportStatus').textContent='Saving report…';
 const details=runtimeNotes.join('\n')+'\n'+report;
 const text=('RYZE Bug Report\nBuild: 1.0.7\nRevision: '+buildInfo.revision+'\nPremiere: '+String(uxp.host&&uxp.host.version||'unknown')+'\nPlatform: '+(isMac()?'macOS':'Windows/unknown')+'\nTime: '+new Date().toISOString()+'\nStyle: '+template+'\nPanel: '+status.textContent+'\n\n'+(details.length>200000?'[Report trimmed; full session diagnostics retained locally]\n'+details.slice(0,10000)+'\n'+details.slice(-180000):details)).replace(/\b[a-f0-9]{64}\b/gi,'[REDACTED]');
 try{
  try{await api.command('exportReport',{report:text});$('reportStatus').textContent='TXT saved on your Desktop. Send it to your team lead.';}
  catch(helperError){
   const file=await storage.getFileForSaving('RYZE_Bug_Report_'+Date.now()+'.txt',{types:['txt']});
   if(file){await file.write(text+'\nREPORT_EXPORT = '+String(helperError).replace(/\b[a-f0-9]{64}\b/gi,'[REDACTED]'));$('reportStatus').textContent='Report saved. Send the TXT file to your team lead.';}
   else $('reportStatus').textContent='Report cancelled. Nothing was saved.';
  }
 }catch(e){$('reportStatus').textContent='Could not save the report. Try again.';}finally{reportBusy=false;buttons();}
});
// Automatic startup must not prompt/open Terminal. CEP owns normal startup;
// the explicit Reconnect button can request permission for its fallback command.
connectAutomatically(false);
