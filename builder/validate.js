'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert'),vm=require('vm');
const root=path.resolve(__dirname,'..');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
for(const dir of ['cep','uxp'])for(const f of walk(path.join(root,dir))){
 if(/\.(js|jsx)$/.test(f))new vm.Script(fs.readFileSync(f,'utf8'),{filename:f});
 if(/\.(p12|pfx|pem|key)$/.test(f)||path.basename(f)==='bridge-config.json')throw Error('Private material or embedded token in payload');
}
const manifest=JSON.parse(fs.readFileSync(path.join(root,'uxp/manifest.json')));
assert.equal(manifest.id,'com.ryze.captiontool.v1.uxp');assert.equal(manifest.version,'1.0.7');assert.equal(manifest.host.app,'premierepro');assert(!Array.isArray(manifest.host));
const hashes={'RYZE_Box_V3.mogrt':'22e6acb94b560e24ba4b025afac6b989dc151100cf6f01bf87898513738757bd','RYZE_Box_V5.mogrt':'72418fd40cb4233cbd54a426a791732dca332af29094d6ace8d2e00d0b6f86b8','RYZE_Stroke_V1.mogrt':'21ad2731dd319a952c5cfb166b2cedf9e0ed06003b6b311b029e1159a24e1813'};
for(const [name,want] of Object.entries(hashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'cep/assets/mogrts',name))).digest('hex'),want);
console.log('PASS source syntax, release IDs, no bundled private keys/token, and three original MOGRT hashes.');
module.exports={root,walk};

assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(root,'uxp/installer-config.json'))),{schema:1,build:'1.0.7',port:48771,token:null},'Shared payload must contain ONLY a token-free pairing placeholder');
