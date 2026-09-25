'use strict';
function field(obj,key){const hits=[];function walk(o){if(!o||typeof o!=='object')return;for(const k of Object.keys(o)){if(k===key)hits.push({o,k});else walk(o[k]);}}walk(obj);if(hits.length!==1)throw Error('Expected one '+key+' field');return hits[0];}
function setText(raw,text){const obj=JSON.parse(raw),t=field(obj,'textEditValue'),r=field(obj,'fontTextRunLength');if(typeof t.o[t.k]!=='string'||!Array.isArray(r.o[r.k])||r.o[r.k].length!==1)throw Error('Unverified template text/run schema');t.o[t.k]=text;r.o[r.k]=[text.length];return JSON.stringify(obj);}
function textValue(raw){const obj=JSON.parse(raw),x=field(obj,'textEditValue');return x.o[x.k];}
function extensionPath(raw){
 let value=String(raw);
 if(/^file:\/\//i.test(value)){
  value=decodeURIComponent(value.replace(/^file:\/\//i,''));
  value=value.replace(/^localhost\//i,'/');
  if(value.charAt(0)!=='/'&&!/^[A-Za-z]:[\\/]/.test(value))value='//'+value;
 }
 // CEP can return /C:/...; Windows requires C:/..., not \\C:\\....
 return value.replace(/^[\\/]+(?=[A-Za-z]:[\\/])/,'');
}

module.exports={setText,textValue,extensionPath};
