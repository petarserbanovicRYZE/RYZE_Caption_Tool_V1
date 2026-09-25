'use strict';
const $=id=>document.getElementById(id),run=$('run'),undo=$('undo'),save=$('save'),connect=$('connect'),status=$('status');
const storage=require('uxp').storage.localFileSystem;
let token=null,report='',busy=false,complete=false,blocked=true,epoch=null,serial=0,template='V3',reportBusy=false;
const client=Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);
function emit(s,state){report=s;if(busy&&state&&['ready','converting'].includes(state.phase)&&state.total){status.textContent='Creating captions '+state.next+' of '+state.total+'…';$('bar').style.width=Math.round(state.next/state.total*100)+'%';}}
function buttons(){run.disabled=busy||blocked;undo.disabled=busy||!complete||blocked;save.disabled=busy||reportBusy;connect.disabled=busy;connect.style.display=blocked&&!busy?'block':'none';for(const id of ['v3','v5','stroke'])$(id).disabled=busy;}
for(const [id,value] of [['v3','V3'],['v5','V5'],['stroke','Stroke']])$(id).addEventListener('click',()=>{template=value;for(const key of ['v3','v5','stroke'])$(key).className=key===id?'chosen':'';});
async function request(path,body,timeoutMs=60000){
 if(!/^[a-f0-9]{64}$/.test(token||''))throw Error('Setup pairing is missing; rerun the current Setup.exe');
 let timer;
 try{
  const response=await Promise.race([fetch('http://127.0.0.1:48771'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Connection timeout; command outcome may be pending')),timeoutMs);})]);
  const r=await response.json();if(response.status!==200||!r.ok){const e=Error(r.error||'HTTP '+response.status);e.state=r.state;throw e;}return r;
 }finally{clearTimeout(timer);}
}
const api={command:async(op,args)=>{if(!epoch)epoch=(await probe()).epoch;const body={epoch,requestID:client+'_'+(++serial),op,args};try{return(await request('/command',body)).state;}catch(e){if(String(e).includes('Connection timeout'))return(await request('/command',body)).state;throw e;}}};
const workflow=require('./workflow.js')(api,require('./visibility.js')(require('premierepro')),emit);
async function probe(){const r=await request('/status',null,2000);if(r.build!=='1.0.7')throw Error('Helper version mismatch. Close Premiere and run the 1.0.7 Setup.');return r;}
async function attach(){epoch=(await probe()).epoch;const state=await workflow.attach();complete=state.converted;blocked=false;status.textContent=complete?'Ready. Your last conversion is available for Undo.':'Ready. Choose a style and convert.';}
async function connectAutomatically(){
 if(busy)return;busy=true;blocked=true;buttons();status.textContent='Connecting…';
 try{
  const folder=await storage.getPluginFolder();
  const config=JSON.parse(await (await folder.getEntry('installer-config.json')).read());
  if(config.schema!==1||config.build!=='1.0.7'||config.port!==48771||!/^[a-f0-9]{64}$/.test(config.token||''))throw Error('Setup pairing is missing. Close Premiere and reinstall RYZE.');
  token=config.token;
  await require('./connect.js')(probe,()=>attach(),ms=>new Promise(r=>setTimeout(r,ms)),()=>{status.textContent='Connecting…';});
 }catch(e){blocked=true;status.textContent='Could not connect. Retry, or use Report bug for help.';emit(report+'\nCONNECT_STOP = '+String(e));}finally{busy=false;buttons();}
}
connect.addEventListener('click',connectAutomatically);
run.addEventListener('click',async()=>{if(busy||blocked)return;busy=true;buttons();$('bar').style.width='0%';$('reportStatus').textContent='';status.textContent='Reading captions. Keep this sequence open.';
 try{const result=await workflow.run(template,true);complete=result.converted;$('bar').style.width='100%';status.textContent='Done — '+template+' captions are ready. Originals are preserved.';}
 catch(e){blocked=true;emit(report+'\nPANEL_STOP = '+String(e));status.textContent='Conversion stopped. Use Report bug before trying again.';}finally{busy=false;buttons();}});
undo.addEventListener('click',async()=>{if(busy||blocked)return;busy=true;buttons();status.textContent='Restoring original captions…';try{await workflow.undo();complete=false;$('bar').style.width='0%';status.textContent='Undo complete. Original captions restored.';}catch(e){emit(report+'\nUNDO_STOP = '+String(e));status.textContent='Undo stopped. The timeline may have changed. Use Report bug for details.';}finally{busy=false;buttons();}});
save.addEventListener('click',async()=>{
 if(busy||reportBusy)return;reportBusy=true;buttons();$('reportStatus').textContent='Saving report…';
 const text=('RYZE Bug Report\nBuild: 1.0.7\nTime: '+new Date().toISOString()+'\nStyle: '+template+'\nPanel: '+status.textContent+'\n\n'+report).replace(/\b[a-f0-9]{64}\b/gi,'[REDACTED]');
 try{
  try{await api.command('exportReport',{report:text});$('reportStatus').textContent='TXT saved on your Desktop. Send it to your team lead.';}
  catch(helperError){
   const file=await storage.getFileForSaving('RYZE_Bug_Report_'+Date.now()+'.txt',{types:['txt']});
   if(file){await file.write(text+'\nREPORT_EXPORT = '+String(helperError).replace(/\b[a-f0-9]{64}\b/gi,'[REDACTED]'));$('reportStatus').textContent='Report saved. Send the TXT file to your team lead.';}
   else $('reportStatus').textContent='Report cancelled. Nothing was saved.';
  }
 }catch(e){$('reportStatus').textContent='Could not save the report. Try again.';}finally{reportBusy=false;buttons();}
});
connectAutomatically();
