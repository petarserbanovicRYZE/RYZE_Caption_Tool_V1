'use strict';
module.exports=function match(snapshot,reply){
 const norm=s=>String(s).replace(/[{}]/g,'').toLowerCase();
 if(!reply||reply.ok!==true||reply.bridge!=='RYZE08')throw Error('Unexpected helper response');
 const captions=reply.captions;
 if(norm(snapshot.guid)!==norm(captions.sequenceID)||snapshot.name!==captions.sequenceName)throw Error('CEP/UXP sequence mismatch');
 if(captions.tracks.length!==snapshot.caption.length)throw Error('Caption track count mismatch');
 const seen=new Set();
 for(const track of captions.tracks){
  if(!Number.isInteger(track.index)||seen.has(track.index))throw Error('Ambiguous caption index');seen.add(track.index);
  const actual=snapshot.caption.find(t=>t.index===track.index);
  if(!actual||actual.items.length!==track.cues.length)throw Error('Caption cue count mismatch');
  const timing=track.cues.map(c=>({start:c.startTicks,end:c.endTicks}));
  if(JSON.stringify(timing)!==JSON.stringify(actual.items))throw Error('Caption timing mismatch');
  if(track.cues.some(c=>typeof c.text!=='string'||!c.text.trim()||c.text.includes('SyntheticCaption')))throw Error('Invalid native caption text');
 }
 return true;
};
