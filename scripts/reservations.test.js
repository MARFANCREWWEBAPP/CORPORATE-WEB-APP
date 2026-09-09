'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createPortal}=require('../portal/server');
const {Store}=require('../portal/store');
const {accounts,password}=require('../portal/demo');
const {active,status}=require('../portal/reservation-state');
const {scheduleConflicts}=require('../portal/workflow-store');
const {inventory}=require('../portal/continuity');

async function fixture(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'marquee-reservations-'));
  const portal=createPortal({env:{DEMO_MODE:'1',APP_ORIGIN:'http://demo.test',DATA_DIR:directory},noAutomaticBackup:true,noAutomaticMail:true});
  await new Promise(resolve=>portal.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+portal.server.address().port;
  t.after(async()=>{portal.closeStreams();await new Promise(resolve=>portal.server.close(resolve));fs.rmSync(directory,{recursive:true,force:true});});
  const client=()=>({cookie:'',csrf:'',async call(route,method='GET',body,headers={}){
    const response=await fetch(base+'/api'+route,{method,headers:{Origin:'http://demo.test','Content-Type':'application/json',Cookie:this.cookie,'X-CSRF-Token':this.csrf,'Idempotency-Key':crypto.randomUUID(),...headers},body:body===undefined?undefined:JSON.stringify(body)});
    if(response.headers.get('set-cookie'))this.cookie=response.headers.get('set-cookie').split(';')[0];
    const data=await response.json();if(data.csrf)this.csrf=data.csrf;return {status:response.status,data};
  }});
  const clients=[];for(const account of accounts){const c=client();assert.equal((await c.call('/login','POST',{email:account.email,password})).status,200);clients.push(c);}
  const [admin,commercial,venue]=clients;
  const fresh=id=>portal.store.read().events.find(event=>event.id===id);
  const create=async(values={})=>{const r=await venue.call('/events','POST',{eventName:'Reserva de prueba',eventDate:'2090-05-10',estimatedStartTime:'18:00',estimatedEndTime:'20:00',room:'Sala principal',...values});assert.equal(r.status,200,JSON.stringify(r.data));return r.data.result;};
  const reserve=(event,values={},caller=admin)=>caller.call('/events/'+event.id+'/reservations','POST',{revision:fresh(event.id).revision,durationHours:48,reason:'Pendiente de decisión del cliente',...values});
  const update=(event,hold,data,caller=admin)=>caller.call('/events/'+event.id+'/reservations/'+hold.id,'POST',{revision:fresh(event.id).revision,...data});
  return {directory,portal,admin,commercial,venue,fresh,create,reserve,update};
}

test('Reservations enforce scope, revision, dates, duration and idempotent creation',async t=>{
  const f=await fixture(t),event=await f.create();
  assert.equal((await f.reserve(event,{},f.venue)).status,403);
  for(const durationHours of [0,721,1.5,'abc'])assert.equal((await f.reserve(event,{durationHours})).status,400);
  assert.equal((await f.reserve(event,{reason:''})).status,400);
  assert.equal((await f.reserve(event,{revision:undefined})).status,400);
  assert.equal((await f.reserve(event,{revision:event.revision-1})).status,409);
  const incomplete=await f.create({estimatedEndTime:''});assert.equal((await f.reserve(incomplete)).status,400);
  const past=await f.create({eventDate:'2000-01-01'});assert.equal((await f.reserve(past)).status,400);
  const payload={revision:f.fresh(event.id).revision,durationHours:48,reason:'Primera opción'},key=crypto.randomUUID();
  const route='/events/'+event.id+'/reservations';
  const saved=await f.commercial.call(route,'POST',payload,{'Idempotency-Key':key});assert.equal(saved.status,200);
  const repeated=await f.commercial.call(route,'POST',payload,{'Idempotency-Key':key});assert.equal(repeated.status,200);assert.equal(repeated.data.result.id,saved.data.result.id);
  assert.equal(f.fresh(event.id).reservations.length,1);assert.equal((await f.reserve(event)).status,409);
  assert.equal((await f.update(event,saved.data.result,{action:'RELEASE',reason:'No autorizado'},f.venue)).status,403);
  const venueView=(await f.venue.call('/state')).data.data;
  assert.equal(venueView.events.find(e=>e.id===event.id).reservations[0].effectiveStatus,'ACTIVE');
  assert.equal('resourceIds' in venueView.events.find(e=>e.id===event.id).reservations[0].schedule,false);
  const otherVenue=f.portal.store.read().venues.find(v=>v.id!==event.venueId);
  const other=(await f.admin.call('/events','POST',{eventName:'Privado de otro espacio',venueId:otherVenue.id,eventDate:'2091-01-01',estimatedStartTime:'10:00',estimatedEndTime:'11:00'})).data.result;
  assert.equal((await f.reserve(other)).status,200);
  assert.ok(!JSON.stringify((await f.venue.call('/state')).data).includes('Privado de otro espacio'));
});

test('Concurrent holds and confirmations cannot double-book rooms or shared resources',async t=>{
  const f=await fixture(t),first=await f.create(),second=await f.create({eventName:'Segunda opción',room:'sála PRINCIPAL'});
  const outcomes=await Promise.all([f.reserve(first),f.reserve(second,{},f.commercial)]);
  assert.deepEqual(outcomes.map(r=>r.status).sort(),[200,409]);
  const held=outcomes[0].status===200?first:second,blocked=held===first?second:first;
  const result=await f.admin.call('/events/'+blocked.id,'PATCH',{revision:f.fresh(blocked.id).revision,status:'CONFIRMED',conflictReason:'Intento de saltar una reserva'});
  assert.equal(result.status,409);assert.equal(result.data.details.kind,'reservation');assert.equal(f.fresh(blocked.id).status,'NEW_REQUEST');
  const blockedBudget=await f.admin.call('/events/'+blocked.id+'/generate-budget','POST',{revision:f.fresh(blocked.id).revision,lines:[{description:'Equipo',quantity:1,unitPrice:100}],taxRate:21,publish:true});assert.equal(blockedBudget.status,200);
  const venueDecision=await f.venue.call('/events/'+blocked.id+'/budgets/'+blockedBudget.data.result.id+'/decision','POST',{revision:f.fresh(blocked.id).revision,decision:'ACCEPTED'});assert.equal(venueDecision.status,409);assert.deepEqual(Object.keys(venueDecision.data.details.conflicts[0]),['message']);
  const separate=await f.create({room:'Sala secundaria'});assert.equal((await f.reserve(separate)).status,200);
  const whole=await f.create({room:''});assert.equal((await f.reserve(whole)).status,409);
  const resource=(await f.admin.call('/resources','POST',{name:'Técnico compartido',kind:'TEAM'})).data.result;
  const a=await f.create({eventDate:'2091-02-10',room:'A'});
  const otherVenue=f.portal.store.read().venues.find(v=>v.id!==a.venueId);
  const b=(await f.admin.call('/events','POST',{eventName:'Otro espacio y mismo técnico',venueId:otherVenue.id,eventDate:a.eventDate,estimatedStartTime:'18:30',estimatedEndTime:'20:30',resourceIds:[resource.id]})).data.result;
  await f.admin.call('/events/'+a.id,'PATCH',{revision:a.revision,resourceIds:[resource.id]});assert.equal((await f.reserve(a)).status,200);
  assert.equal((await f.reserve(b)).status,409);
  const budget=await f.admin.call('/events/'+b.id+'/generate-budget','POST',{revision:f.fresh(b.id).revision,lines:[{description:'Equipo',quantity:1,unitPrice:100}],taxRate:21,publish:true});assert.equal(budget.status,200);
  const accept=await f.admin.call('/events/'+b.id+'/budgets/'+budget.data.result.id+'/decision','POST',{revision:f.fresh(b.id).revision,decision:'ACCEPTED',conflictReason:'No evita la reserva'});assert.equal(accept.status,409);
});

test('Setup, dismantling and overnight windows block only actual overlaps; expiry needs no timer',async t=>{
  const f=await fixture(t),event=await f.create({estimatedStartTime:'23:00',estimatedEndTime:'01:00',setupMinutes:60,dismantleMinutes:60});
  const hold=(await f.reserve(event)).data.result;
  for(const data of [{estimatedStartTime:'21:30',estimatedEndTime:'22:30'},{eventDate:'2090-05-11',estimatedStartTime:'01:30',estimatedEndTime:'03:00'}])assert.equal((await f.reserve(await f.create(data))).status,409);
  const adjacent=await f.create({estimatedStartTime:'20:00',estimatedEndTime:'22:00'});assert.equal((await f.reserve(adjacent)).status,200);
  const blocked=await f.create({estimatedStartTime:'23:30',estimatedEndTime:'00:30'});
  assert.equal((await f.reserve(blocked)).status,409);
  f.portal.store.transaction(null,'TEST_EXPIRED',state=>{state.events.find(e=>e.id===event.id).reservations[0].expiresAt=new Date(Date.now()-1).toISOString();});
  assert.equal(active(f.fresh(event.id)),undefined);assert.equal(status(f.fresh(event.id).reservations[0]),'EXPIRED');
  assert.equal((await f.reserve(blocked)).status,200);
  assert.equal((await f.update(event,hold,{action:'EXTEND',durationHours:1,reason:'Ya caducó'})).status,409);
  assert.equal((await f.venue.call('/state')).data.data.events.find(e=>e.id===event.id).reservations[0].effectiveStatus,'EXPIRED');
  assert.ok(f.fresh(event.id).history.some(item=>item.action==='RESERVATION_CREATED'));
});

test('Extensions, release and archival preserve reservation history and guard held planning',async t=>{
  const f=await fixture(t),event=await f.create(),hold=(await f.reserve(event)).data.result;
  const updated=await f.update(event,hold,{action:'EXTEND',durationHours:24,reason:'El cliente decide mañana'});assert.equal(updated.status,200);
  assert.equal(Date.parse(updated.data.result.expiresAt)-Date.parse(hold.expiresAt),86400000);assert.equal(updated.data.result.extensions.length,1);
  assert.equal((await f.update(event,hold,{action:'EXTEND',durationHours:720,reason:'Demasiado tiempo'})).status,400);
  const before=f.fresh(event.id);
  for(const patch of [{room:'Otra sala'},{eventDate:'2090-05-12'},{estimatedStartTime:'19:00'}])assert.equal((await f.admin.call('/events/'+event.id,'PATCH',{revision:before.revision,...patch})).status,409);
  assert.equal((await f.admin.call('/events/'+event.id,'PATCH',{revision:before.revision,room:'Otra sala',status:'CONFIRMED'})).status,409);
  assert.deepEqual(f.fresh(event.id),before);
  assert.equal((await f.update(event,hold,{action:'RELEASE',reason:'Cliente elige otra fecha'})).status,200);
  assert.equal(f.fresh(event.id).reservations[0].status,'RELEASED');assert.equal(f.fresh(event.id).reservations[0].extensions.length,1);
  assert.equal((await f.admin.call('/events/'+event.id,'PATCH',{revision:f.fresh(event.id).revision,room:'Otra sala'})).status,200);
  assert.equal((await f.reserve(event)).status,200);
  assert.equal((await f.admin.call('/events/'+event.id,'PATCH',{revision:f.fresh(event.id).revision,status:'CANCELLED',closeReason:'Cancelación de prueba'})).status,200);
  assert.equal(f.fresh(event.id).reservations.length,2);assert.equal(f.fresh(event.id).reservations[1].status,'RELEASED');
  const archive=f.portal.store.exportArchive(f.portal.store.read().users.find(u=>u.role==='ADMIN'),'CANCELLED');
  assert.equal(archive.events.find(e=>e.id===event.id).reservations.length,2);
  assert.equal((await f.venue.call('/state')).data.data.events.find(e=>e.id===event.id).reservations.length,2);
});

test('Confirmation consumes the hold; complete backups recover exact reservation records',async t=>{
  const f=await fixture(t),event=await f.create();await f.reserve(event);
  const budget=await f.admin.call('/events/'+event.id+'/generate-budget','POST',{revision:f.fresh(event.id).revision,lines:[{description:'Sonido',quantity:1,unitPrice:500}],taxRate:21,publish:true});assert.equal(budget.status,200);
  const accepted=await f.venue.call('/events/'+event.id+'/budgets/'+budget.data.result.id+'/decision','POST',{revision:f.fresh(event.id).revision,decision:'ACCEPTED',signature:{name:'Responsable espacio',consent:true}});assert.equal(accepted.status,200);
  assert.equal(f.fresh(event.id).reservations[0].status,'CONFIRMED');
  const other=await f.create();assert.equal(scheduleConflicts(f.portal.store.read(),other)[0].kind,'CONFIRMED');
  assert.equal((await f.reserve(event)).status,409);
  const before=structuredClone(f.fresh(event.id));
  const backup=f.portal.recovery.make('manual',true),source=path.join(f.directory,'backups',backup.filename);
  const restore=path.join(f.directory,'isolated-restore');fs.mkdirSync(restore);fs.copyFileSync(source,path.join(restore,'marquee.sqlite'));
  assert.equal(inventory(source).businessSha256,inventory(path.join(restore,'marquee.sqlite')).businessSha256);
  const recovered=new Store(restore);try{assert.deepEqual(recovered.read().events.find(e=>e.id===event.id),before);}finally{recovered.close();}
});
