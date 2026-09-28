'use strict';
// Retry READ-ONLY discovery during CEP startup. Never replay conversion or Undo here.
module.exports=async function connect(probe,attach,pause,status,launch){
 let last,launchError=null,launchAttempted=false;
 for(let attempt=0;attempt<15;attempt++){
  try{await probe();last=null;break;}
  catch(e){
   last=e;
   if(/Unauthorized|version mismatch|permission|Manifest entry/i.test(String(e)))throw e;
   if(!launchAttempted&&typeof launch==='function'){
    launchAttempted=true;
    try{await launch();}catch(error){launchError=error;}
   }
   if(attempt<14){status('Waiting for RYZE helper to start… ('+(attempt+1)+'/15)');await pause(1000);}
  }
 }
 if(last)throw Error('Helper did not respond. Restart Premiere once, then Reconnect helper. Details: '+String(last)+(launchError?' Launch: '+String(launchError):''));
 // An unfinished/changed session is not a connection failure. Surface it without retrying mutations.
 return attach();
};
