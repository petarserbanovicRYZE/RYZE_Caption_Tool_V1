'use strict';
// CI provenance accompanies the real, verified package; it is not an installer.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
async function main(){
 if(process.platform!=='darwin')throw Error('Package provenance must be generated on the real macOS runner');
 const commit=process.env.GITHUB_SHA,repository=process.env.GITHUB_REPOSITORY,run=process.env.GITHUB_RUN_ID;
 if(!/^[a-f0-9]{40}$/.test(commit||'')||!/^[-\w.]+\/[-\w.]+$/.test(repository||'')||!/^\d+$/.test(run||''))throw Error('Missing GitHub Actions build identity');
 const filename='RYZE_Caption_Tool_Mac.pkg',file=path.join(__dirname,'output',filename);
 if(!fs.statSync(file).size)throw Error('Verified installer is empty');
 const hash=crypto.createHash('sha256');
 for await(const chunk of fs.createReadStream(file))hash.update(chunk);
 const info={...require('../uxp/build-info.json'),commit,workflowRun:'https://github.com/'+repository+'/actions/runs/'+run,filename,sha256:hash.digest('hex'),builtAt:new Date().toISOString(),runner:process.platform,architectures:['arm64','x64']};
 fs.writeFileSync(path.join(__dirname,'output','BUILD_INFO.json'),JSON.stringify(info,null,2)+'\n');
 console.log('Recorded verified package revision '+info.revision+' at commit '+commit);
}
main().catch(error=>{console.error(String(error));process.exitCode=1;});
