'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {privateFixture}=require('./private-fixture');
const {createRecovery,verifyRecovery,sha}=require('../portal/reliability');
const {createContinuity,inventory}=require('../portal/continuity');
const {Store}=require('../portal/store');
const {createPortal}=require('../portal/server');
const env={DEMO_MODE:'0',BACKUP_HIDRIVE_URL:'https://webdav.hidrive.ionos.com/users/test/B2BE',BACKUP_HIDRIVE_USER:'test',BACKUP_HIDRIVE_PASSWORD:'test-only-password',BACKUP_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')};
function remote(){
  const objects=new Map(),calls=[],control={deny:false,corrupt:false,disconnect:false};
  const fetcher=async(url,options)=>{
    const address=new URL(url),dav=address.hostname.includes('hidrive');calls.push({url:address.href,method:options.method});
    if(dav){assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Basic '+Buffer.from('test:test-only-password').toString('base64'));assert.ok(options.signal);}
    if(dav&&control.disconnect)throw new Error('Network error containing credentials must not escape');
    if(dav&&control.deny)return new Response('',{status:403});
    if(options.method==='MKCOL')return new Response('',{status:201});
    if(options.method==='PUT'){objects.set(address.href,Buffer.from(options.body));return new Response('',{status:201});}
    const bytes=objects.get(address.href);if(!bytes)return new Response('',{status:404});
    return new Response(dav&&control.corrupt?Buffer.from('corrupt'):bytes,{status:200});
  };
  return {fetcher,objects,calls,control};
}
async function fixture(t){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'b2be-hidrive-'));const f=await privateFixture(directory);t.after(()=>{f.store.close();fs.rmSync(directory,{recursive:true,force:true});});return {...f,directory};}
test('HiDrive keeps encrypted complete copies and independently restores the event, document, branding and production history',async t=>{
  const f=await fixture(t),r=remote(),recovery=createRecovery(f.store,env,r.fetcher),before=f.store.read();
  f.store.newSession(f.admin);const backup=recovery.make('manual',true);await recovery.external();
  const saved=f.store.backups().find(b=>b.filename===backup.filename);assert.ok(saved.hidrive.verifiedAt);assert.equal(recovery.status().hidrive.pending,0);
  const encrypted=r.objects.get(env.BACKUP_HIDRIVE_URL+'/'+backup.filename+'.enc');assert.equal(encrypted.subarray(0,4).toString(),'MRQ1');assert.equal(encrypted.includes(Buffer.from('Recorrido privado completo')),false);
  const source=path.join(f.directory,'backups',backup.filename),expected=inventory(source);
  const drill=await createContinuity(f.store,recovery,env,r.fetcher).drill(f.admin,{source:'hidrive'});
  assert.equal(drill.source,'hidrive');assert.equal(drill.users,3);assert.equal(drill.events,1);assert.equal(drill.files,1);assert.equal(drill.orders,1);assert.equal(drill.businessSha256,expected.businessSha256);assert.equal(drill.filesSha256,expected.filesSha256);
  assert.deepEqual(f.store.read().events,before.events);assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,1);
  await assert.rejects(()=>createContinuity(f.store,recovery,env,r.fetcher).drill(f.user,{source:'hidrive'}),{status:403});
  const encryptedFile=path.join(f.directory,'download.enc');fs.writeFileSync(encryptedFile,encrypted);
  const restored=verifyRecovery(encryptedFile,path.join(f.directory,'offline-restore'),backup.sha256,Buffer.from(env.BACKUP_ENCRYPTION_KEY,'base64'));assert.equal(restored.files,1);
});
test('Both backup destinations retain their verification and a restart does not upload already verified copies again',async t=>{
  const f=await fixture(t),r=remote(),both={...env,BACKUP_S3_ENDPOINT:'https://storage.test',BACKUP_S3_BUCKET:'test',BACKUP_S3_ACCESS_KEY:'test',BACKUP_S3_SECRET_KEY:'test'};
  const recovery=createRecovery(f.store,both,r.fetcher),backup=recovery.make('manual',true);await recovery.external();
  const saved=f.store.backups().find(b=>b.filename===backup.filename);assert.ok(saved.external.verifiedAt);assert.ok(saved.hidrive.verifiedAt);
  const count=r.calls.length;await createRecovery(f.store,both,r.fetcher).external();assert.equal(r.calls.length,count);
  const changed=createRecovery(f.store,{...env,BACKUP_HIDRIVE_URL:env.BACKUP_HIDRIVE_URL+'-new'},r.fetcher);assert.equal(changed.status().hidrive.lastVerified,null);await changed.external();assert.ok(changed.status().hidrive.lastVerified);assert.ok(r.objects.has(env.BACKUP_HIDRIVE_URL+'/'+backup.filename+'.enc'));
});
test('HiDrive failure keeps unsent backups and active data while the existing external backup continues',async t=>{
  const f=await fixture(t),r=remote(),both={...env,BACKUP_S3_ENDPOINT:'https://storage.test',BACKUP_S3_BUCKET:'test',BACKUP_S3_ACCESS_KEY:'test',BACKUP_S3_SECRET_KEY:'test'};
  const recovery=createRecovery(f.store,both,r.fetcher),before=f.store.read();r.control.deny=true;
  for(let i=0;i<8;i++){const backup=recovery.make('automática horaria',true);fs.writeFileSync(path.join(f.directory,'backups',backup.filename+'.json'),JSON.stringify({...backup,createdAt:'2024-01-01T00:00:00.000Z'}));}
  await recovery.external();await recovery.external();recovery.prune();assert.equal(f.store.backups().length,8);assert.equal(f.store.backups().every(b=>b.external?.verifiedAt),true);assert.equal(f.store.backups().some(b=>b.hidrive),false);assert.match(recovery.status().hidrive.error.message,/rechazado el acceso/);assert.deepEqual(f.store.read(),before);
  recovery.report();assert.ok(f.store.read().notifications.some(n=>n.body.includes('HiDrive')));
  r.control.deny=false;await recovery.external();assert.equal(recovery.status().hidrive.error,null);assert.ok(recovery.status().hidrive.lastVerified);
});
test('A corrupt download is never verified or accepted for recovery, and retry can recover',async t=>{
  const f=await fixture(t),r=remote(),recovery=createRecovery(f.store,env,r.fetcher);const backup=recovery.make('manual',true);r.control.corrupt=true;await recovery.external();
  assert.equal(recovery.status().hidrive.lastVerified,null);assert.ok(recovery.status().hidrive.error);assert.equal(f.store.backups().find(b=>b.filename===backup.filename).hidrive,undefined);
  r.control.corrupt=false;await recovery.external();assert.ok(recovery.status().hidrive.lastVerified);
  r.control.corrupt=true;await assert.rejects(()=>createContinuity(f.store,recovery,env,r.fetcher).drill(f.admin,{source:'hidrive'}),{status:500});assert.equal(f.store.read().events.length,1);
  r.control.disconnect=true;await assert.rejects(()=>recovery.hidrive.download(f.store.backups()[0]),/conectar de forma segura/);
});
test('HiDrive is opt-in, rejects untrusted endpoints and incomplete credentials, and is not inherited by a demo',async t=>{
  const f=await fixture(t),r=remote();
  for(const config of [{},{BACKUP_HIDRIVE_URL:env.BACKUP_HIDRIVE_URL},{...env,BACKUP_HIDRIVE_URL:'https://untrusted.test/backups'},{...env,BACKUP_HIDRIVE_URL:'http://webdav.hidrive.ionos.com/backups'},{...env,BACKUP_HIDRIVE_URL:'https://webdav.hidrive.ionos.com/?target=elsewhere'}]){
    const recovery=createRecovery(f.store,config,r.fetcher);await recovery.external();assert.equal(recovery.status().hidrive.configured,false);assert.equal(r.calls.length,0);
  }
  const directory=path.join(f.directory,'demo');const portal=createPortal({env:{...env,DEMO_MODE:'1',DATA_DIR:directory,APP_ORIGIN:'http://demo.test'},backupFetch:r.fetcher,noAutomaticBackup:true,noAutomaticMail:true});
  try{portal.recovery.make('manual',true);await portal.recovery.external();assert.equal(portal.recovery.status().hidrive.requested,false);assert.equal(r.calls.length,0);}finally{portal.store.close();}
});
