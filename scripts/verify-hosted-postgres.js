'use strict';
// Opt-in synthetic verification only. Never migrate into an existing database.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {fork}=require('node:child_process');
const {once}=require('node:events');
const {Client}=require('pg');
const {privateFixture}=require('./private-fixture');
const {Store}=require('../portal/store');
const {inventory}=require('../portal/continuity');
const {migrate}=require('./migrate-postgres');
const {sha,verifyRecovery}=require('../portal/reliability');
const origin='http://verification.test';

function worker(){
  const {createPortal}=require('../portal/server');
  // Loopback-only test server: do not inherit mail, integrations or public hosting settings.
  const portal=createPortal({env:{APP_ORIGIN:origin,DATA_DIR:process.env.VERIFY_DATA_DIR,DATABASE_URL:process.env.VERIFY_DATABASE_URL},noAutomaticBackup:true,noAutomaticMail:true});
  portal.server.listen(0,'127.0.0.1',()=>process.send({port:portal.server.address().port}));
  process.on('message',message=>{if(message==='stop'){portal.closeStreams();portal.server.close(()=>process.exit(0));}});
}
async function startWorker(url,directory){
  const child=fork(__filename,['--worker'],{env:{PATH:process.env.PATH,VERIFY_DATABASE_URL:url,VERIFY_DATA_DIR:directory},stdio:['ignore','ignore','inherit','ipc']});
  try{
    const ready=await Promise.race([once(child,'message').then(([value])=>value),once(child,'exit').then(()=>{throw Error('Verification worker stopped during startup');}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Verification startup timed out')),35000);timer.unref();})]);
    assert.ok(Number.isInteger(ready.port));return {child,base:'http://127.0.0.1:'+ready.port};
  }catch(error){child.kill('SIGKILL');await once(child,'exit').catch(()=>{});throw error;}
}
async function stopWorker(worker){
  const {child}=worker;if(child.exitCode!==null)return;
  const ended=once(child,'exit');child.send('stop');
  const timer=setTimeout(()=>child.kill('SIGKILL'),5000);timer.unref();
  try{await ended;}finally{clearTimeout(timer);}
}
function client(base,timings){
  return {base,cookie:'',csrf:'',async request(route,method='GET',body,headers={}){
    const started=performance.now();
    const response=await fetch(this.base+'/api'+route,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:this.cookie,'X-CSRF-Token':this.csrf,'Idempotency-Key':crypto.randomUUID(),...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
    const data=response.headers.get('content-type')?.includes('json')?await response.json():Buffer.from(await response.arrayBuffer());
    timings.push({method,status:response.status,ms:Math.round(performance.now()-started)});
    if(response.headers.get('set-cookie'))this.cookie=response.headers.get('set-cookie').split(';')[0];
    if(data.csrf)this.csrf=data.csrf;return {status:response.status,data};
  }};
}
async function ok(request,status=200){const result=await request;assert.equal(result.status,status,result.data.error||'Unexpected HTTP response');return result.data;}
async function verify(){
  if(process.env.VERIFY_POSTGRES_ISOLATED!=='1'||!process.env.VERIFY_POSTGRES_ADMIN_URL)throw Error('Explicit isolated verification and a PostgreSQL administration connection are required');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'b2be-hosted-verification-'));
  const adminConnection=new Client({connectionString:process.env.VERIFY_POSTGRES_ADMIN_URL,connectionTimeoutMillis:10000,query_timeout:20000});
  const created=[],workers=[],timings=[],checks=[];let fixture,target,source,report;
  const mark=name=>{checks.push(name);console.log(JSON.stringify({verification:'check',name}));};
  try{
    await adminConnection.connect();
    const existing=(await adminConnection.query('SELECT datname FROM pg_database')).rows.map(r=>r.datname);
    const version=(await adminConnection.query('SHOW server_version')).rows[0].server_version;
    const urls=[];
    for(let i=0;i<2;i++){
      const name='b2be_verify_'+Date.now()+'_'+crypto.randomBytes(6).toString('hex');
      assert.match(name,/^b2be_verify_\d+_[a-f0-9]{12}$/);assert.ok(!existing.includes(name));
      await adminConnection.query('CREATE DATABASE "'+name+'"');created.push(name);
      const url=new URL(process.env.VERIFY_POSTGRES_ADMIN_URL);url.pathname='/'+name;urls.push(url.href);
    }
    console.log(JSON.stringify({verification:'isolated_databases',names:created,postgres:version}));
    fixture=await privateFixture(path.join(root,'live'),{databaseURL:urls[0]});
    const otherVenue=fixture.store.saveVenue(fixture.admin,null,{name:'Otro espacio de ensayo'});
    await fixture.store.createUser(fixture.admin,{firstName:'Otro espacio',email:'otro@stability.test',role:'VENUE_USER',venueId:otherVenue.id,password:fixture.password});
    const originalOrder=JSON.stringify(fixture.release.snapshot);
    const backup=fixture.store.backup('manual'),file=path.join(root,'live/backups',backup.filename);
    assert.equal(inventory(file).orders,1);assert.equal(sha(originalOrder),fixture.release.sha256);
    fixture.store.close();fixture.store=new Store(path.join(root,'live'),{databaseURL:urls[0]});
    assert.equal(JSON.stringify(fixture.store.read().events[0].production.releases[0].snapshot),originalOrder);
    mark('Private accounts, venue branding, accepted PDF, production order and durable PostgreSQL restart');

    source=await privateFixture(path.join(root,'sqlite-source'));
    const sourceBackup=source.store.backup('manual'),sourceFile=path.join(root,'sqlite-source/backups',sourceBackup.filename);
    const original=inventory(sourceFile);target=new Store(path.join(root,'migrated'),{databaseURL:urls[1]});
    migrate(sourceFile,sourceBackup.sha256,target);
    const migratedBackup=target.backup('manual'),migrated=inventory(path.join(root,'migrated/backups',migratedBackup.filename));
    const {revision:beforeRevision,audit:beforeAudit,outbox:beforeOutbox,resets:beforeResets,...beforeBusiness}=source.store.read();
    const {revision:afterRevision,audit:afterAudit,outbox:afterOutbox,resets:afterResets,...afterBusiness}=target.read();
    assert.deepEqual(afterBusiness,beforeBusiness);assert.equal(afterRevision,beforeRevision+1);assert.deepEqual(afterAudit.slice(1),beforeAudit);
    assert.equal(migrated.filesSha256,original.filesSha256);
    assert.equal(sha(fs.readFileSync(sourceFile)),sourceBackup.sha256);
    assert.throws(()=>migrate(sourceFile,sourceBackup.sha256,target),/debe estar vacío/);
    mark('SQLite migration into a new hosted database; source and signed documents preserved');

    workers.push(await startWorker(urls[0],path.join(root,'http')));
    workers.push(await startWorker(urls[0],path.join(root,'http')));
    const a=client(workers[0].base,timings),commercial=client(workers[1].base,timings),venue=client(workers[0].base,timings),other=client(workers[1].base,timings);
    for(const [c,email] of [[a,'info@marquee.es'],[commercial,'comercial@stability.test'],[venue,'espacio@stability.test'],[other,'otro@stability.test']]){
      const login=await ok(c.request('/login','POST',{email,password:fixture.password}));
      if(login.user.mustChangePassword)await ok(c.request('/password','POST',{currentPassword:fixture.password,password:'Rotated-'+crypto.randomBytes(24).toString('base64url')}));
    }
    await ok(client(workers[0].base,timings).request('/login','POST',{email:'admin@demo.test',password:'MarqueeDemo2026!'}),401);
    await ok(a.request('/users/'+fixture.admin.id,'PATCH',{active:false}),403);
    const own=await ok(venue.request('/state'));assert.equal(own.data.venues.length,1);
    assert.equal((await ok(other.request('/state'))).data.events.length,0);
    await ok(other.request('/files/'+fixture.budget.fileKey),404);
    const pdf=await ok(venue.request('/files/'+fixture.budget.fileKey));assert.equal(sha(pdf),fixture.budget.sha256);
    const order=await ok(venue.request('/events/'+fixture.eventId+'/production/releases/'+fixture.release.id+'.pdf'));assert.equal(order.subarray(0,5).toString(),'%PDF-');
    mark('HTTP login for three roles, temporary password rotation, protected admin and space/file isolation');

    const peer=Object.assign(client(workers[1].base,timings),{cookie:venue.cookie,csrf:venue.csrf});
    const submission={eventName:'Petición concurrente',eventDate:'2028-12-01'},retry={'Idempotency-Key':crypto.randomUUID()};
    const [one,two]=await Promise.all([ok(venue.request('/events','POST',submission,retry)),ok(peer.request('/events','POST',submission,retry))]);
    assert.equal(one.result.id,two.result.id);
    await ok(peer.request('/events','POST',{...submission,eventName:'Different'},retry),409);
    const event=one.result;
    const changes=await Promise.all([a.request('/events/'+event.id,'PATCH',{revision:event.revision,nextAction:'Revisión de administración'}),commercial.request('/events/'+event.id,'PATCH',{revision:event.revision,nextAction:'Revisión comercial'})]);
    assert.deepEqual(changes.map(r=>r.status).sort(),[200,409]);
    const current=changes.find(r=>r.status===200).data.result;
    await ok(a.request('/events/'+event.id,'PATCH',{revision:current.revision,status:'CANCELLED',closeReason:'Ensayo de conservación'}));
    let live=fixture.store.read().events.find(e=>e.id===fixture.eventId);
    await ok(venue.request('/events/'+live.id+'/production/acknowledge','POST',{revision:live.revision,releaseId:fixture.release.id,sha256:fixture.release.sha256,confirm:true}));
    live=fixture.store.read().events.find(e=>e.id===fixture.eventId);
    await ok(a.request('/events/'+live.id,'PATCH',{revision:live.revision,status:'COMPLETED'}));
    const archived=(await ok(peer.request('/state'))).data.events;
    assert.equal(archived.find(e=>e.id===event.id).status,'CANCELLED');assert.equal(archived.find(e=>e.id===live.id).status,'COMPLETED');
    assert.equal(sha(await ok(peer.request('/files/'+fixture.budget.fileKey))),fixture.budget.sha256);
    mark('Two independent servers: shared sessions, duplicate retry prevention, edit conflicts and archived access');

    const readTimings=[];
    await Promise.all(Array.from({length:6},async(_,i)=>{
      const c=Object.assign(client(workers[i%2].base,readTimings),{cookie:venue.cookie,csrf:venue.csrf});
      for(let n=0;n<8;n++)await ok(c.request('/state'));
    }));
    const finalBackup=fixture.store.backup('manual'),finalInventory=inventory(path.join(root,'live/backups',finalBackup.filename));
    assert.equal(finalInventory.orders,1);assert.equal(finalInventory.archived,2);
    const recoveredDirectory=path.join(root,'recovered');
    verifyRecovery(path.join(root,'live/backups',finalBackup.filename),recoveredDirectory,finalBackup.sha256);
    const recovered=inventory(path.join(recoveredDirectory,'marquee.sqlite'));
    assert.equal(recovered.businessSha256,finalInventory.businessSha256);assert.equal(recovered.filesSha256,finalInventory.filesSha256);assert.equal(recovered.sessions,0);
    mark('Hosted backup restored independently: both archives, files and signed order match; sessions revoked');
    const sorted=readTimings.map(t=>t.ms).sort((a,b)=>a-b);
    report={verification:'passed',at:new Date().toISOString(),postgres:version,checks,inventory:finalInventory,recovered,concurrentReads:{clients:6,requests:sorted.length,p50Ms:sorted[Math.ceil(sorted.length*.5)-1],p95Ms:sorted[Math.ceil(sorted.length*.95)-1],maxMs:sorted.at(-1)},requestCount:timings.length};
  }finally{
    for(const item of workers)await stopWorker(item);
    fixture?.store?.close();target?.close();source?.store?.close();
    const failures=[];
    for(const name of created){try{assert.match(name,/^b2be_verify_\d+_[a-f0-9]{12}$/);await adminConnection.query('DROP DATABASE "'+name+'"');}catch{failures.push(name);}}
    await adminConnection.end();fs.rmSync(root,{recursive:true,force:true});
    console.log(JSON.stringify({verification:'cleanup',created:created.length,remaining:failures}));
    if(failures.length)throw Error('Isolated verification databases require cleanup');
  }
  console.log(JSON.stringify(report));return report;
}
if(require.main===module){
  if(process.argv.includes('--worker'))worker();
  else verify().catch(error=>{console.error(JSON.stringify({verification:'failed',code:error.code||error.name,message:error.message.replace(/postgres(?:ql)?:\/\/\S+/gi,'[redacted]')}));process.exitCode=1;});
}
module.exports={verify};
