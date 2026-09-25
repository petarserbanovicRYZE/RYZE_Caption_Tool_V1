'use strict';
const difference=require('./difference');
module.exports=function(ppro){
 async function call(o,name,...args){if(!o||typeof o[name]!=='function')throw Error(name+' unavailable');return await o[name](...args);}
 function id(v){if(v===undefined||v===null)throw Error('Track identity unavailable');return String(v);}
 async function snapshot(sequence){
  const result={guid:String(sequence.guid),name:String(sequence.name),video:[],audio:[],caption:[]};
  if(!/^[{]?[0-9a-f-]{36}[}]?$/i.test(result.guid))throw Error('Sequence GUID unavailable');
  for(const group of ['Video','Audio','Caption']){
   const count=await call(sequence,'get'+group+'TrackCount');
   if(!Number.isInteger(count)||count<0||count>128)throw Error('Invalid '+group+' track count');
   const seen=new Set();
   for(let i=0;i<count;i++){
    const track=await call(sequence,'get'+group+'Track',i),trackID=id(track.id);
    if(seen.has(trackID))throw Error('Ambiguous '+group+' track IDs');seen.add(trackID);
    const items=await call(track,'getTrackItems',ppro.Constants.TrackItemType.CLIP,false);
    if(!Array.isArray(items)||items.length>10000)throw Error('Unexpected track item collection');
    const muted=await call(track,'isMuted');if(typeof muted!=='boolean')throw Error('Non-boolean mute state');
    const record={index:i,id:trackID,name:String(track.name),muted,items:[]};
    for(const item of items){
     const start=await call(item,'getStartTime'),end=await call(item,'getEndTime');
     if(!start||!end||!/^\d+$/.test(String(start.ticks))||!/^\d+$/.test(String(end.ticks)))throw Error('Unavailable item timing');
     record.items.push({start:String(start.ticks),end:String(end.ticks)});
    }
    result[group.toLowerCase()].push(record);
   }
  }
  return result;
 }

 async function active(){const project=await call(ppro.Project,'getActiveProject');const seq=await call(project,'getActiveSequence');if(!seq)throw Error('Open the sequence containing your native captions');return seq;}
 async function capture(){return snapshot(await active());}
 async function resolve(base){
  const seq=await active();if(String(seq.guid)!==base.guid)throw Error('Active sequence changed');
  const expected=base.caption.filter(t=>t.items.length);if(!expected.length)throw Error('No populated caption tracks');
  const targets=[];
  for(const target of expected){const track=await call(seq,'getCaptionTrack',target.index);if(id(track.id)!==target.id)throw Error('Caption track identity changed');targets.push({track,target});}
  return {seq,targets,track:targets[0].track,target:targets[0].target};
 }
 async function writeMute(track,value){await call(track,'setMute',value);const actual=await call(track,'isMuted');if(actual!==value)throw Error('Caption visibility readback mismatch');}
 async function set(base,value){const {targets}=await resolve(base);for(const {track} of targets)await writeMute(track,value);return value;}
 async function restoreVisibility(base){const {targets}=await resolve(base);for(const {track,target} of targets)await writeMute(track,target.muted);}
 function restored(base,now){if(JSON.stringify(base)!==JSON.stringify(now))throw Error('UXP measured timeline/visibility did not restore');return true;}
 function beforeHide(base,now,output){
  if(now.guid!==base.guid||now.name!==base.name||JSON.stringify(now.audio)!==JSON.stringify(base.audio)||JSON.stringify(now.caption)!==JSON.stringify(base.caption))throw Error('Original UXP state mismatch: '+(difference({guid:base.guid,name:base.name,audio:base.audio,caption:base.caption},{guid:now.guid,name:now.name,audio:now.audio,caption:now.caption})||'serialized ordering differs'));
  const outputs=Array.isArray(output)?output:[output];
  if(!outputs.length||now.video.length!==base.video.length+outputs.length||JSON.stringify(now.video.slice(0,base.video.length))!==JSON.stringify(base.video))throw Error('Original video tracks or output count changed');
  for(let i=0;i<outputs.length;i++){
   const top=now.video[base.video.length+i],expected=outputs[i];
   if(top.index!==expected.trackIndex||top.id!==expected.trackID||top.items.length!==expected.count)throw Error('Output track mismatch: '+difference({index:expected.trackIndex,id:expected.trackID,count:expected.count},{index:top.index,id:top.id,count:top.items.length},'output'));
  }
  return true;
 }
 return {capture,resolve,set,restoreVisibility,restored,beforeHide};
};
