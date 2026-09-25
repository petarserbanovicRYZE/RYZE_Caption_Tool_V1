'use strict';
const assert=require('assert'),make=require('./test-host'),createEngine=require('../cep/engine'),buildReport=require('../cep/report');
(async()=>{
 const h=make('good');h.ctx.app.project.activeSequence=null;const before=h.api.state;
 let writes=0;const engine=createEngine({host:async(m,...a)=>{assert.equal(m,'exportBugReport');return h.run(m,...a);},checkpoint:()=>writes++});
 const secret='a'.repeat(64),response=await engine.dispatch('exportReport',{report:'Failure\n'+secret});
 assert(response.reportPath.startsWith('/desktop/RYZE_Bug_Report_'));assert(response.reportPath.endsWith('.txt'));assert.equal(writes,0);assert.strictEqual(h.api.state,before);
 const text=h.writeRecords.at(-1).text;assert(text.includes('Failure'));assert(text.includes('[REDACTED]'));assert(!text.includes(secret));assert(text.includes('Premiere: 26.5.1'));
 assert.throws(()=>buildReport('x'.repeat(262145),null),/Invalid/);
 assert(!h.run('exportBugReport','x'.repeat(524289)).ok);
 assert.equal(engine.state().phase,'idle');
 console.log('PASS Desktop TXT bug report without an active sequence, token-shaped string redaction, no timeline/checkpoint mutation and bounded report size.');
})().catch(e=>{console.error(e);process.exitCode=1;});
