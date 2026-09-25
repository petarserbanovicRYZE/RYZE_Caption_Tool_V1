const vm=require('vm'),fs=require('fs'),assert=require('assert');
const code=fs.readFileSync(__dirname+'/../cep/jsx/host.jsx','utf8');
function make(mode){
 const files=new Set(['/template.mogrt']),folders=new Set(),writes=[],writeRecords=[],uiFlags=[];
 const track=(id,clips=[])=>{Object.defineProperty(clips,'numItems',{get:()=>clips.length});return {id,name:'Video '+id,clips,isMuted:()=>false,isLocked:()=>false};};
 const v=[track('1')],a=[];for(const x of [v,a])Object.defineProperty(x,'numTracks',{get:()=>x.length});
 let counter=0;
 const seq={name:'RYZE_CONVERT_TEST',sequenceID:'123',timebase:'1',videoTracks:v,audioTracks:a,exportAsProject:p=>{files.add(p);return true;},importMGT:(p,start,index)=>{
  const params={};for(const name of ['Top Text','Bottom Text'])params[name]={displayName:name,value:JSON.stringify({textEditValue:'default',fontTextRunLength:[7]}),getValue(){return this.value;},setValue(s,ui){uiFlags.push([name,ui]);if(mode==='setfail'&&name==='Bottom Text')throw Error('Injected text failure');this.value=s;}};
  const properties=[params['Top Text'],params['Bottom Text']];properties.numItems=2;properties.getParamForDisplayName=n=>params[n];
  const scale={displayName:'Scale',value:100,isTimeVarying:()=>mode==='animatedscale',getValue(){return this.value;},setValue(n,ui){uiFlags.push(['Scale',ui]);if(mode!=='scalefail')this.value=n;}};
  const motionProps=[scale];motionProps.numItems=1;
  const components=[{matchName:'AE.ADBE Motion',properties:motionProps}];components.numItems=1;
  const clip={components,nodeId:'clip'+(++counter),start:{ticks:start},end:{ticks:'1000'},inPoint:{ticks:'0'},outPoint:{ticks:'1000'},disabled:false,getMGTComponent:()=>({properties}),remove:(ripple,align)=>{assert.strictEqual(ripple,false);v[index].clips.splice(v[index].clips.indexOf(clip),1);}};
  v[index].clips.push(clip);if(mode==='throwafterimport')throw Error('Injected import exception after creation');if(mode==='nullafterimport')return null;return clip;
 }};
 const qs={name:seq.name,guid:'123',addTracks:(n,index,audio)=>{assert.deepStrictEqual([n,index,audio],[1,v.length,0]);v.push(track(String(Math.max(...v.map(t=>+t.id))+1)));},removeVideoTrack:index=>v.splice(index,1)};
 function File(p){this.fsName=p;this.exists=files.has(p);this.length=this.exists?100:0;this.open=()=>true;this.write=s=>{writes.push(s);writeRecords.push({path:p,text:s});files.add(p);return true;};this.close=()=>true;}
 function Folder(p){this.fsName=p;this.exists=folders.has(p);this.create=()=>{folders.add(p);return true;};}Folder.desktop={fsName:'/desktop'};
 const ctx=vm.createContext({File,Folder,Time:function(){this.ticks='0';},app:{version:'26.5.1',project:{path:'/test',activeSequence:seq},enableQE(){}},qe:{project:{getActiveSequence:()=>qs}}});vm.runInContext(code,ctx);
 return {seq,track,qs,ctx,uiFlags,api:ctx.RYZEV1,run:(name,...args)=>JSON.parse(ctx.RYZEV1[name](...args.map(x=>encodeURIComponent(String(x))))),writes,writeRecords};
}
for(const mode of ['good','setfail','scalefail','animatedscale','throwafterimport','nullafterimport']){
 const s=make(mode);assert(s.run('prepare').ok);assert(s.run('add').ok);assert(s.run('checkAdded').ok);
 const imported=s.run('importCard','/template.mogrt','0','20');
 assert.strictEqual(s.api.state.created.length,1,'Import ownership must survive any later failure');
 assert(s.writes.some(x=>x.includes('clip1')),'Created ID must be journaled before text writes');
 if(['good','setfail','scalefail','animatedscale'].includes(mode)){
  assert(imported.ok);const text=JSON.stringify({textEditValue:'new',fontTextRunLength:[3]});const set=s.run('setClip',imported.id,text,text,'20');assert.strictEqual(set.ok,mode==='good');
  if(mode==='good'){assert.strictEqual(set.clip.motionScale,80);assert.strictEqual(set.clip.end,'20');assert.strictEqual(JSON.parse(set.clip.topRaw).textEditValue,'new');assert.strictEqual(s.run('inspectClip',imported.id).clip.motionScale,80);assert(s.run('complete').ok);}
 }else assert(!imported.ok);
 assert(s.run('removeOne').ok);assert.strictEqual(s.run('remaining').count,0);assert(s.run('removeOne').empty);assert(s.run('remove').ok);assert(s.run('finish').avRestored);
}
console.log('PASS: import journal precedes text/trim; cleanup after text failure, import-then-throw, and import-then-null; non-ripple owned-clip removal; exact AV baseline restoration in mocks; Motion Scale 80 readback, rejected scale write and animated-scale refusal.');

module.exports=make;
