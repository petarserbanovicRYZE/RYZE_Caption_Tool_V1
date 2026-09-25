/* Preserve words verbatim; normalize whitespace only. Frame-aligned splitting. */
(function(g){'use strict';
function cards(text){
 if(typeof text!=='string'||!text.trim()||text.includes('SyntheticCaption'))throw Error('Invalid caption text');
 const words=text.trim().split(/\s+/);if(words.length>1000)throw Error('Caption too long');
 const keys=words.map(w=>w.toLowerCase().replace(/’/g,"'").replace(/^[^a-z0-9]+|[^a-z0-9]+$/g,''));
 const phrases=[["lion's","mane"],["lions","mane"],["turkey","tail"],["king","trumpet"],["ryze","mushroom","coffee"],["ryze","mushroom","matcha"]],blocked=new Set();
 for(const p of phrases)for(let i=0;i<=keys.length-p.length;i++)if(p.every((v,j)=>keys[i+j]===v))for(let j=1;j<p.length;j++)blocked.add(i+j);
 const dp=new Array(words.length+1);dp[words.length]={cost:0,cards:[]};
 for(let i=words.length-1;i>=0;i--){
  if(blocked.has(i))continue;
  for(let n=1;n<=6&&i+n<=words.length;n++){
   const end=i+n;if(blocked.has(end)||!dp[end])continue;
   for(let top=1;top<=Math.min(3,n);top++){
    const bottom=n-top;if(n<=3&&top!==n)continue;if(bottom>3||(bottom&&blocked.has(i+top)))continue;
    const cost=1000+Math.abs(top-bottom)+(bottom===0?0:0.1)+dp[end].cost;
    if(!dp[i]||cost<dp[i].cost)dp[i]={cost:cost,cards:[{top:words.slice(i,i+top).join(' '),bottom:words.slice(i+top,end).join(' '),words:n}].concat(dp[end].cards)};
   }
  }
 }
 if(!dp[0])throw Error('Cannot safely wrap caption');return dp[0].cards;
}
function plan(cues,frameTicks){
 const out=[];let lastEnd=-1;const ft=BigInt(frameTicks);
 for(let i=0;i<cues.length;i++){
  const c=cues[i],a=c.startFrame,b=c.endFrame;if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a<lastEnd||b<=a)throw Error('Overlapping or invalid cues');
  lastEnd=b;const split=cards(c.text),duration=b-a;if(duration<split.length)throw Error('Cue too short for one frame per card');
  const total=split.reduce((n,x)=>n+x.words,0);let used=0,start=a;
  for(let j=0;j<split.length;j++){
   const x=split[j];used+=x.words;const end=j===split.length-1?b:Math.max(start+1,Math.min(b-(split.length-j-1),a+Math.round(duration*used/total)));
   out.push({cue:i+1,top:x.top,bottom:x.bottom,startFrame:start,endFrame:end,startTicks:String(BigInt(start)*ft),endTicks:String(BigInt(end)*ft)});start=end;
  }
 }
 return out;
}
g.RYZELayout={cards:cards,plan:plan};
})(typeof window!=='undefined'?window:globalThis);
