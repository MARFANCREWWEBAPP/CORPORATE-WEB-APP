'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createPortal}=require('../portal/server');
const {createIntegrations}=require('../portal/integrations');
const {accounts,password}=require('../portal/demo');
async function fixture(t){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'marquee-operations-')),env={DEMO_MODE:'1',APP_ORIGIN:'http://demo.test',DATA_DIR:directory};const portal=createPortal({env,noAutomaticBackup:true,noAutomaticMail:true});await new Promise(resolve=>portal.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+portal.server.address().port;t.after(async()=>{portal.closeStreams();await new Promise(resolve=>portal.server.close(resolve));fs.rmSync(directory,{recursive:true,force:true});});const client=()=>({cookie:'',csrf:'',async request(route,method='GET',body,headers={}){const response=await fetch(base+'/api'+route,{method,headers:{Origin:env.APP_ORIGIN,'Content-Type':'application/json',Cookie:this.cookie,'X-CSRF-Token':this.csrf,'Idempotency-Key':crypto.randomUUID(),...headers},body:body===undefined?undefined:JSON.stringify(body)});if(response.headers.get('set-cookie'))this.cookie=response.headers.get('set-cookie').split(';')[0];const data=response.headers.get('content-type')?.includes('json')?await response.json():Buffer.from(await response.arrayBuffer());if(data.csrf)this.csrf=data.csrf;return {status:response.status,data};}});const clients=[];for(const account of accounts){const c=client();assert.equal((await c.request('/login','POST',{email:account.email,password})).status,200);clients.push(c);}return {portal,env,base,admin:clients[0],commercial:clients[1],venue:clients[2]};}
test('Operational responsibility, rules, daily reminders and live change stream',async t=>{
  const {portal,base,admin,venue}=await fixture(t);
  let event=(await venue.request('/events','POST',{eventName:'Petición básica',eventDate:'2027-07-15'})).data.result;
  assert.ok(event.assignedCommercialId);assert.ok(event.nextAction);assert.ok(event.nextActionDue);assert.notEqual(event.nextActionDue,event.eventDate);assert.equal(event.waitingOn,'MARQUEE');
  assert.equal((await venue.request('/operations/rules')).status,403);
  assert.equal((await admin.request('/operations/rules','PATCH',{rules:{PENDING_REVIEW:{nextAction:'Llamar al contacto',waitingOn:'MARQUEE',days:2}}})).status,200);
  event=(await admin.request('/events/'+event.id,'PATCH',{status:'PENDING_REVIEW',revision:event.revision})).data.result;assert.equal(event.nextAction,'Llamar al contacto');
  event=(await admin.request('/events/'+event.id,'PATCH',{nextAction:'',waitingOn:'NONE',assignedCommercialId:null,revision:event.revision})).data.result;assert.ok(event.assignedCommercialId);assert.ok(event.nextAction);assert.notEqual(event.waitingOn,'NONE');
  portal.store.transaction(null,'TEST_INACTIVITY',state=>{const e=state.events.find(e=>e.id===event.id);e.updatedAt='2020-01-01T00:00:00Z';e.nextActionDue='2020-01-02';});
  const at=new Date('2027-07-01T10:00:00Z'),first=portal.automation.run(at),count=portal.store.read().notifications.length;assert.ok(first.reminders>0);portal.automation.run(at);assert.equal(portal.store.read().notifications.length,count);
  const own=(await venue.request('/daily-summary')).data;assert.ok(own.open>0);assert.ok(!JSON.stringify(own).includes('Gala de reconocimiento'));
  const controller=new AbortController(),stream=await fetch(base+'/api/changes',{headers:{Cookie:venue.cookie},signal:controller.signal});assert.equal(stream.status,200);const reader=stream.body.getReader();assert.match(Buffer.from((await reader.read()).value).toString(),/revision/);
  await venue.request('/events','POST',{eventName:'Otra petición',eventDate:'2027-08-01'});assert.match(Buffer.from((await reader.read()).value).toString(),/revision/);controller.abort();await reader.cancel().catch(()=>{});
});
test('Generated PDFs, version-bound signature and revocable scoped calendar subscriptions',async t=>{
  const {portal,base,admin,venue}=await fixture(t);let event=(await venue.request('/events','POST',{eventName:'Presupuesto generado',eventDate:'2027-07-15',estimatedStartTime:'18:00',estimatedEndTime:'20:00'})).data.result;
  const generated=await admin.request('/events/'+event.id+'/generate-budget','POST',{revision:event.revision,lines:[{description:'Sonido',quantity:1,unitPrice:1500},{description:'Técnicos',quantity:2,unitPrice:150}],taxRate:21,publish:true,validUntil:'2027-07-30'});assert.equal(generated.status,200,JSON.stringify(generated.data));const budget=generated.data.result;assert.equal(budget.amountCents,217800);assert.equal(budget.quote.subtotalCents,180000);assert.match((await venue.request('/files/'+budget.fileKey)).data.toString(),/^%PDF-/);
  event=portal.store.read().events.find(e=>e.id===event.id);
  assert.equal((await venue.request('/events/'+event.id+'/budgets/'+budget.id+'/decision','POST',{decision:'ACCEPTED',revision:event.revision,signature:{name:'Contacto de pruebas',consent:false}})).status,400);
  const signed=await venue.request('/events/'+event.id+'/budgets/'+budget.id+'/decision','POST',{decision:'ACCEPTED',revision:event.revision,signature:{name:'Contacto de pruebas',consent:true}});assert.equal(signed.status,200);assert.equal(signed.data.result.signature.documentSha256,budget.sha256);
  const sub=await venue.request('/calendar/subscription','POST',{});assert.equal(sub.status,201);const route=new URL(sub.data.url).pathname;
  const feed=await (await fetch(base+route)).text();assert.ok(feed.includes('Presupuesto generado'));assert.ok(!feed.includes('Gala de reconocimiento'));assert.ok(feed.includes('DTSTART:20270715T160000Z'));assert.ok(!JSON.stringify((await admin.request('/state')).data).includes('calendarTokenHash'));
  await venue.request('/calendar/revoke','POST',{});assert.equal((await fetch(base+route)).status,404);
});
test('External integrations stay simulated in demo, obey permissions and prevent uncertain duplicate sends',async t=>{
  const {portal,env,admin,venue}=await fixture(t),event=portal.store.read().events.find(e=>e.status==='NEW_REQUEST'),user=portal.store.read().users.find(u=>u.role==='ADMIN');
  const body={question:'Qué falta',confirm:true};const key=crypto.randomUUID();let count=0;
  const fake=async(url,request)=>{count++;const data=JSON.parse(request.body);if(url.includes('/responses')){assert.equal(data.store,false);assert.ok(!request.body.includes('Gala de reconocimiento'));return {ok:true,json:async()=>({output:[{type:'message',content:[{type:'output_text',text:'Revisar los asistentes.'}]}]})};}if(url.includes('/json/2/'))return {ok:true,json:async()=>[321]};return {ok:true,json:async()=>({messages:[{id:'sample-message-id'}]})};};
  const liveEnv={APP_ORIGIN:'http://demo.test',OPENAI_API_KEY:'test-key',OPENAI_MODEL:'test-model',ODOO_URL:'https://odoo.example.test',ODOO_DATABASE:'test',ODOO_API_KEY:'test',WHATSAPP_TOKEN:'test',WHATSAPP_PHONE_ID:'123',WHATSAPP_TEMPLATE:'event_update',WHATSAPP_API_VERSION:'v99.0'};
  const demo=createIntegrations(portal.store,{...liveEnv,DEMO_MODE:'1'},fake);assert.equal((await demo.run(user,event.id,'assistant',body,key)).simulated,true);assert.equal(count,0);
  assert.equal((await venue.request('/events/'+event.id+'/integrations/odoo','POST',{confirm:true})).status,403);
  const live=createIntegrations(portal.store,liveEnv,fake);const result=await live.run(user,event.id,'assistant',body,crypto.randomUUID());assert.equal(result.text,'Revisar los asistentes.');assert.equal(count,1);
  const odooKey=crypto.randomUUID();const odoo=await live.run(user,event.id,'odoo',{confirm:true},odooKey);assert.equal(odoo.externalId,321);await live.run(user,event.id,'odoo',{confirm:true},odooKey);assert.equal(count,2);
  assert.equal((await live.run(user,event.id,'whatsapp',{confirm:true,consent:true,to:'+34999999999'},crypto.randomUUID())).externalId,'sample-message-id');
  const uncertain=createIntegrations(portal.store,liveEnv,async()=>{throw new Error('network timeout');}),retryKey=crypto.randomUUID();await assert.rejects(()=>uncertain.run(user,event.id,'whatsapp',{confirm:true,consent:true,to:'+34999999999'},retryKey),{status:502});await assert.rejects(()=>uncertain.run(user,event.id,'whatsapp',{confirm:true,consent:true,to:'+34999999999'},retryKey),{status:409});
});
test('S3/R2 document replicas require review and confirmation, are encrypted and read back',async t=>{
  const {portal}=await fixture(t),objects=new Map(),user=portal.store.read().users[0];
  const env={FILES_S3_ENDPOINT:'https://objects.example.test',FILES_S3_BUCKET:'documents',FILES_S3_ACCESS_KEY:'test',FILES_S3_SECRET_KEY:'test',FILES_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64')};
  const fake=async(url,request)=>{assert.match(request.headers.authorization,/AWS4-HMAC-SHA256/);if(request.method==='PUT')objects.set(url.href,Buffer.from(request.body));return {ok:true,arrayBuffer:async()=>objects.get(url.href)};};
  const storage=require('../portal/object-storage').createObjectStorage(portal.store,env,fake);const plan=storage.review(user);
  await assert.rejects(()=>storage.copyReviewed(user,{digest:plan.digest}),{status:409});assert.equal(objects.size,0);
  await assert.rejects(()=>storage.copyReviewed(user,{digest:'old',confirm:true}),{status:409});assert.equal(objects.size,0);
  await storage.copyReviewed(user,{digest:plan.digest,confirm:true});assert.equal(storage.status().verified,5);const file=portal.store.read().events.flatMap(e=>e.budgets)[0];const original=portal.store.file(user,file.fileKey).bytes;assert.deepEqual(await storage.recover(file.fileKey),original);assert.ok([...objects.values()].every(bytes=>!bytes.includes(Buffer.from('%PDF-'))));
  const demo=require('../portal/object-storage').createObjectStorage(portal.store,{...env,DEMO_MODE:'1'},()=>{throw new Error('No external calls in demo');});assert.equal(demo.configured,false);assert.equal((await demo.copyReviewed(user,{digest:demo.review(user).digest,confirm:true})).simulated,true);
});
