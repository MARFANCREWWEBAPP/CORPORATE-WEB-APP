'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createPortal}=require('../portal/server');
const {Store}=require('../portal/store');
const {accounts,password}=require('../portal/demo');
test('Demo external recovery uses dedicated credentials, verifies downloads and leaves live events intact',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'marquee-demo-external-'));
  const objects=new Map();let corrupt=false;
  const env={DEMO_MODE:'1',DEMO_EXTERNAL_BACKUPS:'1',APP_ORIGIN:'http://demo.test',DATA_DIR:directory,
    DATABASE_URL:'postgres://private.invalid/never',RESEND_API_KEY:'private-unused',BACKUP_S3_ENDPOINT:'https://private.invalid',BACKUP_S3_SESSION_TOKEN:'private-unused',
    DEMO_BACKUP_S3_ENDPOINT:'https://demo-storage.test',DEMO_BACKUP_S3_BUCKET:'demo-only',DEMO_BACKUP_S3_URL_STYLE:'virtual-host',DEMO_BACKUP_S3_ACCESS_KEY:'demo-key',DEMO_BACKUP_S3_SECRET_KEY:'demo-secret',DEMO_BACKUP_ENCRYPTION_KEY:Buffer.alloc(32,17).toString('base64')};
  const backupFetch=async(url,request)=>{
    assert.equal(url.host,'demo-only.demo-storage.test');assert.ok(url.pathname.startsWith('/marquee/'));
    assert.equal(request.headers['x-amz-security-token'],undefined);
    if(request.method==='PUT')objects.set(url.href,Buffer.from(request.body));
    return {ok:true,arrayBuffer:async()=>corrupt?Buffer.from('damaged'):objects.get(url.href)};
  };
  const portal=createPortal({env,backupFetch,noAutomaticBackup:true,noAutomaticMail:true});
  t.after(()=>{portal.store.close();fs.rmSync(directory,{recursive:true,force:true});});
  assert.equal(portal.mailer.configured,false);assert.notEqual(portal.store.db.kind,'postgres');assert.equal(portal.objectStorage.configured,false);
  const before=structuredClone(portal.store.read().events),backup=portal.recovery.make('manual',true);
  await portal.recovery.external();assert.ok(portal.recovery.status().externalLastVerified);
  const uploaded=objects.get('https://demo-only.demo-storage.test/marquee/'+backup.filename+'.enc');assert.equal(uploaded.subarray(0,4).toString(),'MRQ1');assert.ok(!uploaded.includes(Buffer.from('SQLite format 3')));
  const admin=portal.store.read().users.find(u=>u.role==='ADMIN');
  await assert.rejects(()=>portal.continuity.drill(portal.store.read().users.find(u=>u.role==='VENUE_USER'),{source:'external'}),{status:403});
  const report=await portal.continuity.drill(admin,{source:'external'});assert.equal(report.events,6);assert.equal(report.files,5);assert.deepEqual(portal.store.read().events,before);
  const status=portal.continuity.status();assert.equal(status.ready,false);assert.ok(status.checks.find(c=>c.key==='external').ok);assert.ok(status.checks.find(c=>c.key==='drill').ok);
  corrupt=true;await assert.rejects(()=>portal.continuity.drill(admin,{source:'external'}));assert.deepEqual(portal.store.read().events,before);assert.equal(portal.continuity.status().checks.find(c=>c.key==='drill').ok,false);
});
test('Persistent demo refuses incomplete backup opt-in or a different volume path before opening data',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'marquee-demo-config-'));
  try{
    const env={DEMO_MODE:'1',APP_ORIGIN:'https://demo.test',DATA_DIR:directory};
    assert.throws(()=>createPortal({env:{...env,DEMO_EXTERNAL_BACKUPS:'1',BACKUP_S3_ENDPOINT:'https://private.invalid'}}),/propios de las copias/);
    assert.throws(()=>createPortal({env:{...env,RAILWAY_ENVIRONMENT_ID:'sample',RAILWAY_VOLUME_MOUNT_PATH:directory+'/other'}}),/volumen montado en DATA_DIR/);
    assert.equal(fs.existsSync(path.join(directory,'marquee.sqlite')),false);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('Demo: three actual roles, scoped files, durable samples and fixed shared credentials',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'marquee-demo-test-'));
  const env={DEMO_MODE:'1',APP_ORIGIN:'http://demo.test',DATA_DIR:directory,RESEND_API_KEY:'unused',MAIL_FROM:'demo@example.test',BACKUP_S3_ENDPOINT:'https://unused.test',BACKUP_S3_BUCKET:'unused',BACKUP_S3_ACCESS_KEY:'unused',BACKUP_S3_SECRET_KEY:'unused',BACKUP_ENCRYPTION_KEY:Buffer.alloc(32).toString('base64')};
  let portal=createPortal({env,noAutomaticBackup:true}),base;
  async function listen(){await new Promise(resolve=>portal.server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+portal.server.address().port;}
  await listen();t.after(async()=>{await new Promise(resolve=>portal.server.close(resolve));fs.rmSync(directory,{recursive:true,force:true});});
  const client=()=>({cookie:'',csrf:'',async request(route,method='GET',body){const response=await fetch(base+'/api'+route,{method,headers:{Origin:env.APP_ORIGIN,'Content-Type':'application/json',Cookie:this.cookie,'X-CSRF-Token':this.csrf},body:body===undefined?undefined:JSON.stringify(body)});if(response.headers.get('set-cookie'))this.cookie=response.headers.get('set-cookie').split(';')[0];const data=response.headers.get('content-type')?.includes('json')?await response.json():Buffer.from(await response.arrayBuffer());if(data.csrf)this.csrf=data.csrf;return {status:response.status,data};}});
  const anon=client();assert.equal((await anon.request('/state')).status,401);
  assert.equal((await anon.request('/session')).data.demo.accounts.length,3);
  assert.equal(portal.mailer.configured,false);assert.equal(portal.recovery.status().externalConfigured,false);
  const clients=[];
  for(const account of accounts){const c=client();const login=await c.request('/login','POST',{email:account.email,password});assert.equal(login.status,200);assert.equal(login.data.user.role,account.role);assert.equal(login.data.user.mustChangePassword,false);clients.push(c);}
  const [admin,commercial,venue]=clients;
  assert.equal((await commercial.request('/users','POST',{firstName:'No permitido',email:'another@demo.test'})).status,403);
  const all=(await admin.request('/state')).data.data,own=(await venue.request('/state')).data.data;
  assert.equal(all.events.length,6);assert.equal(own.venues.length,1);assert.equal(own.events.length,5);assert.ok(own.events.some(e=>e.status==='COMPLETED'));assert.ok(own.events.some(e=>e.status==='CANCELLED'));
  assert.ok(!JSON.stringify(own).includes('passwordHash'));assert.ok(!all.users.some(u=>u.email==='info@marquee.es'));
  const other=all.events.find(e=>e.venueId!==own.venues[0].id),shared=own.events.find(e=>e.budgets.length);
  assert.equal((await venue.request('/files/'+other.budgets[0].fileKey)).status,404);
  const pdf=await venue.request('/files/'+shared.budgets[0].fileKey);assert.equal(pdf.status,200);assert.match(pdf.data.toString(),/^%PDF-/);
  assert.equal((await admin.request('/users/'+all.users[1].id,'PATCH',{active:false})).status,403);
  assert.equal((await venue.request('/password','POST',{currentPassword:password,password:'changed-demo-password'})).status,403);
  assert.equal((await admin.request('/mfa/setup','POST',{currentPassword:password})).status,403);
  assert.equal((await admin.request('/import/preview','POST',{})).status,403);
  assert.equal((await admin.request('/venues/'+own.venues[0].id,'PATCH',{state:'INACTIVE'})).status,403);
  const created=await venue.request('/events','POST',{eventName:'Petición demo conservada',eventDate:'2027-11-01'});assert.equal(created.status,200);
  assert.equal((await commercial.request('/events/'+created.data.result.id+'/comments','POST',{body:'Respuesta del comercial'})).status,200);
  assert.equal((await venue.request('/events/'+other.id,'PATCH',{revision:other.revision,eventName:'Acceso ajeno'})).status,404);
  const html=await (await fetch(base+'/')).text();assert.match(html,/<title>Marquee · B2BE/);assert.doesNotMatch(html,/Marquee Flow|FLOW V4/i);
  await new Promise(resolve=>portal.server.close(resolve));
  portal=createPortal({env,noAutomaticBackup:true});await listen();
  assert.equal(portal.store.read().events.length,7);assert.equal(portal.store.read().users.length,3);assert.equal((await venue.request('/state')).status,200);
  assert.throws(()=>createPortal({env:{...env,DEMO_MODE:'0'},noAutomaticBackup:true}),/solo puede abrirse en modo demo/);
});
test('Demo refuses existing private data and can run on Railway without real-service credentials',()=>{
  const privateDir=fs.mkdtempSync(path.join(os.tmpdir(),'marquee-private-test-')),demoDir=fs.mkdtempSync(path.join(os.tmpdir(),'marquee-cloud-demo-test-'));
  try{const store=new Store(privateDir);store.transaction(null,'EXISTING_DATA',state=>{state.settings.marker='keep-me';});store.close();
    assert.throws(()=>createPortal({env:{DEMO_MODE:'1',DATA_DIR:privateDir,APP_ORIGIN:'http://demo.test'}}),/base independiente y vacía/);
    const check=new Store(privateDir);assert.equal(check.read().settings.marker,'keep-me');check.close();
    const portal=createPortal({env:{DEMO_MODE:'1',NODE_ENV:'production',RAILWAY_ENVIRONMENT_ID:'sample',APP_ORIGIN:'https://demo.example.test',DATA_DIR:demoDir},noAutomaticBackup:true,noAutomaticMail:true});assert.equal(portal.store.read().users.length,3);portal.store.close();
  }finally{fs.rmSync(privateDir,{recursive:true,force:true});fs.rmSync(demoDir,{recursive:true,force:true});}
});

test('Admin demo cleanup requires review, backs up all records, preserves access and survives restart',async t=>{
  const crypto=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'marquee-cleanup-test-'));
  const env={DEMO_MODE:'1',APP_ORIGIN:'http://demo.test',DATA_DIR:directory};
  let portal=createPortal({env,noAutomaticBackup:true,noAutomaticMail:true}),base;
  async function listen(){await new Promise(resolve=>portal.server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+portal.server.address().port;}
  await listen();t.after(async()=>{portal.closeStreams();await new Promise(resolve=>portal.server.close(resolve));fs.rmSync(directory,{recursive:true,force:true});});
  const client=()=>({cookie:'',csrf:'',async request(route,method='GET',body){const response=await fetch(base+'/api'+route,{method,headers:{Origin:env.APP_ORIGIN,'Content-Type':'application/json',Cookie:this.cookie,'X-CSRF-Token':this.csrf},body:body===undefined?undefined:JSON.stringify(body)});if(response.headers.get('set-cookie'))this.cookie=response.headers.get('set-cookie').split(';')[0];const data=await response.json();if(data.csrf)this.csrf=data.csrf;return {status:response.status,data};}});
  const admin=client(),commercial=client();assert.equal((await admin.request('/login','POST',{email:accounts[0].email,password})).status,200);await commercial.request('/login','POST',{email:accounts[1].email,password});
  assert.equal((await client().request('/demo/cleanup')).status,401);
  assert.equal((await commercial.request('/demo/cleanup')).status,403);
  assert.equal((await commercial.request('/demo/cleanup','POST',{confirmation:'BORRAR DEMO'})).status,403);
  await portal.store.provisionProtectedAdmin('protected-test-password-2026');
  const extra=await admin.request('/users','POST',{email:'new-test@example.test',firstName:'Prueba adicional',role:'COMMERCIAL'});assert.equal(extra.status,200);
  const first=await admin.request('/demo/cleanup');assert.equal(first.data.events.length,6);assert.equal(first.data.users.length,3);assert.equal(first.data.files,5);assert.ok(first.data.preserved.some(u=>u.email==='info@marquee.es'));
  assert.equal((await admin.request('/demo/cleanup','POST',{digest:first.data.digest,confirmation:'no'})).status,409);assert.equal(portal.store.backups().length,0);
  const user=portal.store.read().users.find(u=>u.email===accounts[0].email);portal.store.transaction(user,'TEST_EDIT',state=>state.events[0].eventName='Cambio después de revisar');
  assert.equal((await admin.request('/demo/cleanup','POST',{digest:first.data.digest,confirmation:'BORRAR DEMO'})).status,409);
  const plan=(await admin.request('/demo/cleanup')).data,before=portal.store.read(),make=portal.recovery.make;
  portal.recovery.make=()=>{throw new Error('disk full');};assert.equal((await admin.request('/demo/cleanup','POST',{digest:plan.digest,confirmation:'BORRAR DEMO'})).status,500);assert.deepEqual(portal.store.read(),before);portal.recovery.make=make;
  const result=await admin.request('/demo/cleanup','POST',{digest:plan.digest,confirmation:'BORRAR DEMO'});assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.result.removedEvents,6);assert.equal(result.data.result.removedUsers,3);assert.equal(result.data.result.removedFiles,5);
  assert.equal(portal.store.read().events.length,0);assert.equal(portal.store.read().users.length,2);assert.equal(portal.store.read().venues.length,2);assert.equal(portal.store.db.prepare('SELECT COUNT(*) AS n FROM files').get().n,0);assert.ok(portal.store.read().audit.some(a=>a.action==='DEMO_DATA_CLEANED'));
  assert.equal((await commercial.request('/state')).status,401);assert.equal((await admin.request('/state')).status,200);
  assert.equal((await client().request('/login','POST',{email:accounts[2].email,password})).status,401);assert.equal((await client().request('/session')).data.demo.accounts.length,1);
  const snapshot=path.join(directory,'backups',result.data.result.backup.filename);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(snapshot)).digest('hex'),result.data.result.backup.sha256);
  const backup=new DatabaseSync(snapshot,{readOnly:true});assert.equal(JSON.parse(backup.prepare('SELECT value FROM state').get().value).events.length,6);assert.equal(backup.prepare('SELECT COUNT(*) AS n FROM files').get().n,5);backup.close();portal.recovery.prune();assert.ok(fs.existsSync(snapshot));
  await new Promise(resolve=>portal.server.close(resolve));portal=createPortal({env,noAutomaticBackup:true,noAutomaticMail:true});await listen();assert.equal(portal.store.read().events.length,0);assert.equal(portal.store.read().users.length,2);assert.equal((await admin.request('/state')).status,200);
  const empty=(await admin.request('/demo/cleanup')).data;const repeated=await admin.request('/demo/cleanup','POST',{digest:empty.digest,confirmation:'BORRAR DEMO'});assert.equal(repeated.data.result.backup,null);
});

test('Demo cleanup never removes records from a private database',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'marquee-cleanup-private-')),store=new Store(directory);
  try{await store.provisionProtectedAdmin('private-test-password-2026');const admin=store.read().users[0],before=store.read();const cleanup=require('../portal/demo-cleanup');assert.throws(()=>cleanup.clean(store,admin,{confirmation:'BORRAR DEMO'},{make(){throw new Error('Must not back up or delete');}}),{status:404});assert.deepEqual(store.read(),before);}finally{store.close();fs.rmSync(directory,{recursive:true,force:true});}
});
