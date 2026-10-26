'use strict';

const fs=require('fs');
const VERSION='1.0.7',UXP_ID='com.ryze.captiontool.v1.uxp',CEP_ID='com.ryze.captiontool.v1.bridge';

function supported(version){
 const parts=String(version||'').split('.').map(Number);
 return parts.length>=2&&parts.every(Number.isInteger)&&(parts[0]>25||(parts[0]===25&&parts[1]>=6));
}

function checkListing(text){
 let host=null;
 const installed=[];
 for(const line of String(text).split(/\r?\n/)){
  const header=line.match(/^\s*\d+\s+extensions?\s+installed\s+for\s+(.+?)\s*$/i);
  if(header){
   const premiere=header[1].match(/^Premiere Pro(?:\s+[^()]*)?\s*\(ver\s+(\d+(?:\.\d+)+)\)\s*$/i);
   host=premiere&&supported(premiere[1])?premiere[1]:null;
  }else if(host&&/^\s*Enabled\s+RYZE Caption Tool\s+1\.0\.7\s*$/i.test(line))installed.push(host);
 }
 if(!installed.length)throw Error('UPIA did not confirm an enabled RYZE Caption Tool 1.0.7 in Premiere Pro 25.6 or newer. See installer-mac.log; do not assume installation succeeded.');
 return installed;
}

function receipt(cepTarget,helperRoot,buildInfo){
 if(buildInfo.version!==VERSION||!/^[a-zA-Z0-9._-]{1,96}$/.test(buildInfo.revision||''))throw Error('Missing or invalid build revision');
 return {schema:1,version:VERSION,revision:buildInfo.revision,uxpId:UXP_ID,cepBundleId:CEP_ID,cepTarget,helperRoot};
}

function checkReceipt(value){
 if(value.schema!==1||value.cepBundleId!==CEP_ID||value.uxpId!==UXP_ID)throw Error('Existing receipt does not identify this RYZE installation');
 if(!/^\d+\.\d+\.\d+$/.test(value.version||''))throw Error('Existing receipt has an invalid version');
 const installed=value.version.split('.').map(Number),incoming=VERSION.split('.').map(Number);
 for(let i=0;i<3;i++){
  if(installed[i]>incoming[i])throw Error('Refusing to downgrade a newer RYZE installation');
  if(installed[i]<incoming[i])break;
 }
}

module.exports={checkListing,receipt,checkReceipt};
if(require.main===module){
 try{
  const [command,...args]=process.argv.slice(2);
  if(command==='check-list')console.log('Verified RYZE in Premiere Pro '+checkListing(fs.readFileSync(args[0],'utf8')).join(', '));
  else if(command==='check-receipt')checkReceipt(JSON.parse(fs.readFileSync(args[0],'utf8')));
  else if(command==='receipt')console.log(JSON.stringify(receipt(args[0],args[1],JSON.parse(fs.readFileSync(args[2],'utf8')))));
  else throw Error('Unknown installer support command');
 }catch(error){console.error(String(error));process.exitCode=1;}
}
