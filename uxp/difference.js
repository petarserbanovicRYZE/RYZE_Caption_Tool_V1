"use strict";
// Read-only explanation. Existing strict snapshot equality remains the authorization gate.
module.exports=function difference(expected,actual,path='state'){
 if(expected===actual)return null;
 if(expected===null||actual===null||typeof expected!=='object'||typeof actual!=='object')return path+': expected '+JSON.stringify(expected)+', actual '+JSON.stringify(actual);
 if(Array.isArray(expected)!==Array.isArray(actual))return path+': collection type differs';
 if(Array.isArray(expected)&&expected.length!==actual.length)return path+'.length: expected '+expected.length+', actual '+actual.length;
 for(const key of [...new Set([...Object.keys(expected),...Object.keys(actual)])]){
  const diff=difference(expected[key],actual[key],path+(Array.isArray(expected)?'['+key+']':'.'+key));if(diff)return diff;
 }
 return null;
};
