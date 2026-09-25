'use strict';
module.exports=function(http,token,epoch,engine,onError){
 if(!/^[a-f0-9]{64}$/.test(token))throw Error('Installation token missing');
 let busy=false;const requests=new Map();
 const server=http.createServer(async(req,res)=>{
  function reply(status,value){if(res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','Connection':'close'});res.end(JSON.stringify(value));}
  if(req.headers.host!=='127.0.0.1:48771'||req.headers.authorization!=='Bearer '+token)return reply(403,{ok:false,error:'Unauthorized'});
  if(req.method==='GET'&&req.url==='/status')return reply(200,{ok:true,build:'1.0.7',epoch,state:engine.state()});
  if(req.method!=='POST'||req.url!=='/command')return reply(404,{ok:false,error:'Unknown route'});
  try{
   const raw=await new Promise((resolve,reject)=>{let size=0,chunks=[];req.on('data',b=>{size+=b.length;if(size>1048576){reject(Error('Request too large'));req.destroy();}else chunks.push(b);});req.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));req.on('error',reject);});
   const data=JSON.parse(raw);
   if(data.epoch!==epoch)throw Error('Helper session changed; refusing replay');
   if(!/^[a-zA-Z0-9_-]{8,96}$/.test(data.requestID||''))throw Error('Invalid request identity');
   const signature=JSON.stringify({op:data.op,args:data.args});
   if(requests.has(data.requestID)){const old=requests.get(data.requestID);if(old.signature!==signature)throw Error('Reused request ID with different command');return reply(200,await old.promise);}
   if(busy)return reply(409,{ok:false,error:'Another command is still running'});
   if(data.op==='begin'&&requests.size>=500)throw Error('Finish Undo, then restart Premiere before starting another conversion.');
   busy=true;
   const promise=Promise.resolve().then(()=>engine.dispatch(data.op,data.args)).then(state=>({ok:true,epoch,state}),e=>({ok:false,epoch,error:String(e),state:engine.state()})).finally(()=>{busy=false;});
   requests.set(data.requestID,{signature,promise});reply(200,await promise);
  }catch(e){reply(400,{ok:false,error:String(e)});}
 });
 server.on('error',onError);server.listen(48771,'127.0.0.1');return server;
};
