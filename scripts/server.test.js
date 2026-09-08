'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');
const root = path.join(__dirname, '..');
const original = fs.readFileSync(path.join(root,'index.html'));
function request(port, route='/', headers={}, method='GET') {
 return new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path:route,headers,method},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));});req.on('error',reject);req.end();});
}
for (const [i, entry] of ['server.js','launch-v4.js','start.js'].entries()) test(entry+' sirve la V4 exacta con protección y compresión',async()=>{
 const port=43700+i;const child=spawn(process.execPath,[entry],{cwd:root,env:{...process.env,NODE_ENV:'production',HOST:'127.0.0.1',PORT:String(port),SITE_ACCESS_USER:'test',SITE_ACCESS_PASSWORD:'test-only-password-2026'},stdio:'ignore'});
 try {
  await new Promise((resolve,reject)=>{child.once('exit',()=>reject(new Error('Arranque fallido')));let attempts=0;const poll=async()=>{try {if((await request(port,'/health')).status===200)return resolve();}catch{}if(++attempts>60)return reject(new Error('Timeout'));setTimeout(poll,100);};poll();});
  assert.equal((await request(port)).status,401);
  const headers={Authorization:'Basic '+Buffer.from('test:test-only-password-2026').toString('base64')};
  assert.equal((await request(port,'/',{Authorization:'Basic eDp5'})).status,401);
  const home=await request(port,'/',headers);assert.equal(home.status,200);assert.deepEqual(home.body,original);assert.match(home.headers['content-security-policy'],/sha256-/);assert.equal(home.headers['cache-control'],'no-store');
  for(const encoding of ['gzip','br']) {const r=await request(port,'/',{...headers,'Accept-Encoding':encoding});assert.equal(r.headers['content-encoding'],encoding);assert.deepEqual(encoding==='gzip'?zlib.gunzipSync(r.body):zlib.brotliDecompressSync(r.body),original);}
  assert.deepEqual((await request(port,'/',{...headers,'Accept-Encoding':'gzip;q=0, br;q=0'})).body,original);
  assert.equal((await request(port,'/',headers,'HEAD')).body.length,0);
  for(const route of ['/.env','/server.js','/app.js','/app-v4.js','/missing.css','/app-bundle/index.html']) assert.equal((await request(port,route,headers)).status,404);
  assert.equal((await request(port,'/',headers,'POST')).status,405);
  assert.match((await request(port,'/robots.txt')).body.toString(),/Disallow: \//);
 } finally {child.kill();}
});
test('Rechaza fuente alterada y configuración de acceso incompleta',async()=>{
 const os=require('node:os');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v4-integrity-'));
 try {fs.copyFileSync(path.join(root,'server.js'),path.join(dir,'server.js'));fs.writeFileSync(path.join(dir,'index.html'),Buffer.concat([original,Buffer.from(' ')]));
 for(const [cwd,env] of [[dir,{}],[root,{SITE_ACCESS_USER:'test',SITE_ACCESS_PASSWORD:''}],[root,{NODE_ENV:'production',SITE_ACCESS_USER:'',SITE_ACCESS_PASSWORD:''}]]) {
 const child=spawn(process.execPath,['server.js'],{cwd,env:{...process.env,...env},stdio:'ignore'});assert.notEqual(await new Promise(resolve=>child.on('exit',resolve)),0);
 }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
