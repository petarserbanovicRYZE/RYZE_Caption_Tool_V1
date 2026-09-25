'use strict';
module.exports=function(report,state){
 if(typeof report!=='string'||report.length>262144)throw Error('Invalid bug report');
 const s=state||{};
 const summary={batch:s.batch||null,phase:s.phase||'idle',template:s.template||null,completed:s.next||0,total:s.plan?s.plan.length:0,outputs:s.outputs||[],conversionMs:s.conversionMs||null};
 // Pairing credentials/configuration are never read. Redact token-shaped strings defensively.
 return ('Build: 1.0.7\nTime: '+new Date().toISOString()+'\nSession: '+JSON.stringify(summary)+'\n\n'+report).replace(/\b[a-f0-9]{64}\b/gi,'[REDACTED]');
};
