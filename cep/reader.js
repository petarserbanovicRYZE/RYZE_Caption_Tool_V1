/* Experimental read-only adapter for observed Premiere 26.5.1 project XML.
   Reject unsupported layouts; never recover caption text from labels. */
(function(global){
'use strict';
function children(n,name){return Array.from(n.children||[]).filter(x=>!name||x.tagName===name);}
function one(n,path){for(const tag of path.split('/')){const a=children(n,tag);if(a.length!==1)throw Error('Expected one '+path);n=a[0];}return n;}
function optional(n,name){const a=children(n,name);if(a.length>1)throw Error('Duplicate '+name);return a[0]||null;}
function decodeText(bytes){
 const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 function need(p,n){if(!Number.isInteger(p)||p<0||n<0||p+n>bytes.length)throw Error('Binary bounds violation');}
 function u(p){need(p,4);return d.getUint32(p,true);}
 function h(p){need(p,2);return d.getUint16(p,true);}
 function field(p,n){need(p,4);const v=p-d.getInt32(p,true),len=h(v),size=h(v+2);if(len<4||len%2||size<4)throw Error('Invalid table');need(v,len);need(p,size);if(4+2*n>=len)throw Error('Missing field');const o=h(v+4+2*n);if(o<4||o+4>size)throw Error('Invalid field');return p+o;}
 function target(p){const off=u(p);if(off<4)throw Error('Invalid offset');const q=p+off;need(q,4);return q;}
 if(bytes.length>1048576||u(8)!==0x11223344)throw Error('Unsupported binary header');
 const root=target(12),style=target(field(root,0)),runs=target(field(style,0));
 if(u(runs)!==1)throw Error('Unverified multiple text runs');
 const run=target(runs+4),str=target(field(run,0)),len=u(str);need(str+4,len+1);
 if(len>65536||bytes[str+4+len]!==0)throw Error('Invalid text length');
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(str+4,str+4+len));
 if(!text.trim()||text.includes('\0')||text.includes('SyntheticCaption'))throw Error('Invalid or placeholder text');return text;
}
function parse(xml,expectedId){
 if(xml.length>268435456||/<!DOCTYPE/i.test(xml))throw Error('Unsupported XML input');
 const doc=new DOMParser().parseFromString(xml,'application/xml');
 if(doc.getElementsByTagName('parsererror').length||doc.documentElement.tagName!=='PremiereData')throw Error('Invalid project XML');
 const root=doc.documentElement,ids=new Map(),uids=new Map(),blobs=new Map();
 for(const e of children(root))for(const [attr,map] of [['ObjectID',ids],['ObjectUID',uids]])if(e.hasAttribute(attr)){const k=e.getAttribute(attr);if(map.has(k))throw Error('Duplicate object identity');map.set(k,e);}
 for(const e of Array.from(doc.getElementsByTagName('*'))){
  if(e.getAttribute('Encoding')==='base64'&&e.textContent.trim()){
   const hash=e.getAttribute('BinaryHash'),s=e.textContent.replace(/\s/g,'');
   if(!hash)continue;
   if(blobs.has(hash)&&blobs.get(hash)!==s)throw Error('Conflicting binary hash payload');blobs.set(hash,s);
  }
 }
 function ref(e){const v=e.hasAttribute('ObjectRef')?ids.get(e.getAttribute('ObjectRef')):uids.get(e.getAttribute('ObjectURef'));if(!v)throw Error('Unresolved object reference');return v;}
 function getBlob(e){const s=blobs.get(e.getAttribute('BinaryHash'));if(!s||s.length>1400000||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))throw Error('Invalid base64 payload');return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
 const normalized=String(expectedId).replace(/[{}]/g,'').toLowerCase();
 const seqs=children(root,'Sequence').filter(e=>e.getAttribute('ObjectUID').toLowerCase()===normalized);
 if(seqs.length!==1)throw Error('Active sequence UID not uniquely matched');
 const seq=seqs[0],tracks=[];
 for(const entry of children(one(seq,'TrackGroups'),'TrackGroup')){
  const group=ref(one(entry,'Second'));if(group.tagName!=='DataTrackGroup')continue;
  const tg=one(group,'TrackGroup'),frameTicks=one(tg,'FrameRate').textContent,ft=BigInt(frameTicks);
  if(ft<=0n)throw Error('Invalid frame duration');const list=optional(tg,'Tracks');if(!list)continue;
  for(const tr of children(list,'Track')){
   const track=ref(tr);if(track.tagName!=='CaptionDataClipTrack')throw Error('Unsupported data track');
   const clipTrack=one(track,'DataClipTrack/ClipTrack'),clipItems=one(clipTrack,'ClipItems'),items=optional(clipItems,'TrackItems'),cues=[];
   if(items)for(const ir of children(items,'TrackItem')){
    const item=ref(ir);if(item.tagName!=='CaptionDataClipTrackItem')throw Error('Unsupported caption item');
    const timing=one(item,'DataClipTrackItem/ClipTrackItem/TrackItem'),startNode=optional(timing,'Start');
    const start=BigInt(startNode?startNode.textContent:'0'),end=BigInt(one(timing,'End').textContent);
    if(start<0n||end<=start||start%ft!==0n||end%ft!==0n)throw Error('Invalid or off-frame cue');
    const bs=children(one(item,'BlockVector'),'BlockVectorItem');if(bs.length!==1)throw Error('Unverified multiple caption blocks');
    const block=ref(bs[0]);if(block.tagName!=='Block')throw Error('Invalid block');
    const text=decodeText(getBlob(one(block,'FormattedTextData')));
    const a=Number(start/ft),b=Number(end/ft);if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b))throw Error('Frame number exceeds safe range');
    cues.push({startTicks:String(start),endTicks:String(end),startFrame:a,endFrame:b,text:text});
   }
   const trackBase=one(clipTrack,'Track'),muted=optional(trackBase,'IsMuted');
   // Raw serialized mute data is diagnostic only; absence is not interpreted as unmuted.
   tracks.push({index:Number(tr.getAttribute('Index')),uid:track.getAttribute('ObjectUID'),frameTicks:frameTicks,serializedMute:muted?muted.textContent:null,cues:cues});
  }
 }
 return {sequenceID:seq.getAttribute('ObjectUID'),sequenceName:one(seq,'Name').textContent,tracks:tracks};
}
global.RYZEReader={parse:parse,decodeText:decodeText};
})(typeof window!=='undefined'?window:globalThis);
