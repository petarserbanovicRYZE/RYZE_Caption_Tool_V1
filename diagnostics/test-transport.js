'use strict';
const assert=require('assert'),http=require('http'),start=require('../cep/server');
let calls=0,release,signal;const entered=new Promise(r=>signal=r),token='c'.repeat(64),epoch='test-epoch';
const engine={state:()=>({phase:'test'}),dispatch:async()=>{calls++;signal();await new Promise(r=>release=r);return {phase:'done'};}};
// Keep production listener configuration unchanged. The test adapter asks the OS
// for a private ephemeral port, so a running installed helper is never contacted.
const testHttp={createServer:handler=>{const server=http.createServer(handler),listen=server.listen;server.listen=function(port,host){assert.equal(port,48771);assert.equal(host,'127.0.0.1');return listen.call(this,0,host);};return server;}};
const server=start(testHttp,token,epoch,engine,e=>{throw e;});
function request(body,path='/command',auth=token,host='127.0.0.1:48771'){return new Promise((resolve,reject)=>{const r=http.request({hostname:'127.0.0.1',port:server.address().port,path,method:body?'POST':'GET',headers:{Host:host,Authorization:'Bearer '+auth,'Content-Type':'application/json'}},res=>{let s='';res.on('data',x=>s+=x);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(s)}));});r.on('error',reject);r.end(body?JSON.stringify(body):undefined);});}
(async()=>{try{
 if(!server.listening)await new Promise(r=>server.once('listening',r));
 assert.equal((await request(null,'/status','bad')).status,403);
 assert.equal((await request(null,'/status',token,'localhost:48771')).status,403);
 assert.equal((await request(null,'/status')).body.epoch,epoch);
 assert.equal((await request({epoch:'old',requestID:'request_000',op:'step',args:{}})).status,400);assert.equal(calls,0);
 const body={epoch,requestID:'request_001',op:'step',args:{batch:'1'}};
 const first=request(body);await entered;const duplicate=request(body);
 assert.equal((await request({...body,requestID:'request_002'})).status,409);
 assert.equal((await request({...body,op:'undo'})).status,400);
 release();assert.deepStrictEqual(await first,await duplicate);assert.equal(calls,1);
 assert.equal((await request(body)).body.state.phase,'done');assert.equal(calls,1);
 console.log('PASS live HTTP on isolated temporary port: Host/authentication, epoch refusal, serialized commands, pending/completed duplicate ID returns same result without replay, conflicting IDs refused.');
}finally{if(release)release();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
