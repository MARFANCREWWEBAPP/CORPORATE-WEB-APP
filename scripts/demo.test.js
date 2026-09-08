'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createPortal}=require('../portal/server');
const {Store}=require('../portal/store');
const {accounts,password}=require('../portal/demo');
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
  const html=await (await fetch(base+'/')).text();assert.match(html,/<title>Marquee Audiovisuales/);assert.doesNotMatch(html,/Marquee Flow|FLOW V4/i);
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
