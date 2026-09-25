'use strict';
const assert=require('assert'),make=require('./test-host'),createEngine=require('../cep/engine'),createFlow=require('../uxp/workflow');
const h=make('good');assert(h.run('prepare').ok);assert(h.run('add').ok);assert(h.run('checkAdded').ok);
const imported=h.run('importInspect','/template.mogrt','0','20');const raw=JSON.stringify({textEditValue:'One',fontTextRunLength:[3]});assert(h.run('setClip',imported.id,raw,raw,'20',true).ok);assert(h.run('complete').ok);
const saved=h.api.state;h.api.state=null;assert(JSON.parse(h.api.restoreCompleted(saved)).ok);assert(h.run('inspectAll').ok);
h.api.state=null;h.seq.videoTracks[0].name='Changed footage track';assert(!JSON.parse(h.api.restoreCompleted(saved)).ok);assert.strictEqual(h.api.state,null);assert.equal(h.seq.videoTracks.length,2,'Refused restore must not delete anything');
(async()=>{
 const base={caption:[{muted:false,items:[{}]}]};let state={phase:'converted',batch:'batch1',base,output:{}},checkpoint,restores=0;
 const engine=createEngine({load:()=>JSON.parse(JSON.stringify(state)),checkpoint:s=>checkpoint=JSON.parse(JSON.stringify(s)),restoreHost:async()=>{restores++;throw Error('IDs changed');}});
 await assert.rejects(()=>engine.dispatch('undoCheck',{batch:'batch1'}),/IDs changed/);assert.equal(restores,1);assert.equal(checkpoint.phase,'converted');
 let edits=0;const flow=createFlow({command:async()=>({phase:'interrupted'})},{set:async()=>edits++},()=>{});
 await assert.rejects(()=>flow.attach(),/unfinished session/);assert.equal(edits,0);
 console.log('PASS completed-host reattachment exact-match guard; changed timeline refused without deletion; checkpoint on error; interrupted sessions blocked (mocks).');
})().catch(e=>{console.error(e);process.exitCode=1;});
