'use strict';
const fs=require('fs'),path=require('path'),zlib=require('zlib'),assert=require('assert');
const {root,walk}=require('./validate');
function readZip(file){
 const b=fs.readFileSync(file);let e=-1;
 for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--)if(b.readUInt32LE(i)===0x06054b50){e=i;break;}
 assert(e>=0,'ZIP directory missing');assert.equal(b.readUInt16LE(e+4),0);assert.equal(b.readUInt16LE(e+6),0);
 let p=b.readUInt32LE(e+16);const count=b.readUInt16LE(e+10),out=new Map();
 for(let i=0;i<count;i++){
  assert.equal(b.readUInt32LE(p),0x02014b50);const method=b.readUInt16LE(p+10),size=b.readUInt32LE(p+20),n=b.readUInt16LE(p+28),x=b.readUInt16LE(p+30),c=b.readUInt16LE(p+32),offset=b.readUInt32LE(p+42);
  const name=b.subarray(p+46,p+46+n).toString('utf8').replace(/\\/g,'/');assert(!name.startsWith('/')&&!name.split('/').includes('..')&&!name.includes(':'));assert(!out.has(name),'Duplicate entry');
  assert.equal(b.readUInt32LE(offset),0x04034b50);const start=offset+30+b.readUInt16LE(offset+26)+b.readUInt16LE(offset+28);const bytes=b.subarray(start,start+size);assert.equal(bytes.length,size);
  if(!name.endsWith('/')){assert(method===0||method===8);out.set(name,method===0?bytes:zlib.inflateRawSync(bytes,{maxOutputLength:16777216}));}
  p+=46+n+x+c;
 }
 return out;
}
function verify(signed,ccx){
 const expected=walk(path.join(root,'cep'));
 for(const file of expected){const rel=path.relative(path.join(root,'cep'),file);assert(fs.readFileSync(file).equals(fs.readFileSync(path.join(signed,rel))),'Signed payload differs: '+rel);}
 for(const file of walk(signed)){
  const rel=path.relative(signed,file).replace(/\\/g,'/');
  // ZXPSignCmd adds this root-level package marker; it is not extension source.
  if(rel==='mimetype'){
   const marker=fs.readFileSync(file);
   assert(marker.length<=128&&/^application\/vnd\.adobe\.air-ucf-package\+zip[\r\n]*$/.test(marker.toString('utf8')),'Invalid ZXP mimetype marker');
   continue;
  }
  assert(rel.startsWith('META-INF/')||fs.existsSync(path.join(root,'cep',rel)),'Unexpected signed file: '+rel);
 }
 assert(fs.existsSync(path.join(signed,'META-INF/signatures.xml')),'Missing CEP signature');
 const zip=readZip(ccx),uxp=walk(path.join(root,'uxp'));assert.equal(zip.size,uxp.length,'Extra/missing CCX entries');
 for(const file of uxp){const rel=path.relative(path.join(root,'uxp'),file).replace(/\\/g,'/');assert(zip.has(rel)&&fs.readFileSync(file).equals(zip.get(rel)),'CCX content differs: '+rel);}
 console.log('PASS signed CEP source equality and exact CCX source equality. Signature validity is checked separately by ZXPSignCmd.');
}
if(require.main===module)verify(process.argv[2],process.argv[3]);
module.exports={readZip,verify};
