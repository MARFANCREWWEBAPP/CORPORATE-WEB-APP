'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createPortal}=require('../portal/server');
const {Store,passwordHash,verifyPassword}=require('../portal/store');
const {review,activate}=require('../portal/private-activation');
const {createRecovery,sha,verifyRecovery}=require('../portal/reliability');
const secret='private-activation-test-2026';
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'b2be-activation-'));const portal=createPortal({env:{DEMO_MODE:'1',DATA_DIR:dir,APP_ORIGIN:'http://demo.test'},noAutomaticBackup:true,noAutomaticMail:true});t.after(()=>{portal.store.close();fs.rmSync(dir,{recursive:true,force:true});});return {dir,store:portal.store,recovery:portal.recovery};}
async function request(store){return {confirmation:'RETIRAR DEMO',digest:review(store).digest,adminPasswordHash:await passwordHash(secret),requireExternal:false};}
test('Private activation archives the complete demo, revokes access and keeps only the protected administrator',async t=>{
  const {store,dir,recovery}=fixture(t),original=store.read(),files=store.db.prepare('SELECT id,bytes FROM files').all();
  const session=store.newSession(original.users[0]);const req=await request(store),result=await activate(store,req,recovery),state=store.read();
  assert.equal(state.users.length,1);assert.equal(state.users[0].email,'info@marquee.es');assert.equal(state.users[0].protectedAccount,true);assert.equal(await verifyPassword(secret,state.users[0].passwordHash),true);
  for(const k of ['events','venues','notifications','clients','drafts','messageDrafts','resources','organizations','outbox'])assert.equal(state[k]?.length||0,0,k);
  assert.equal(state.demo,undefined);assert.equal(store.session(session.token),null);assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM files').get().n,0);assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM operations').get().n,0);
  const destination=path.join(dir,'restore-test');const restored=verifyRecovery(path.join(dir,'backups',result.backup.filename),destination,result.backup.sha256);assert.equal(restored.events,original.events.length);assert.equal(restored.files,files.length);
  const recovered=new Store(destination);try{assert.deepEqual(recovered.read().events,original.events);for(const file of files)assert.equal(sha(recovered.db.prepare('SELECT bytes FROM files WHERE id=?').get(file.id).bytes),sha(file.bytes));}finally{recovered.close();}
  assert.deepEqual(await activate(store,{...req,adminPasswordHash:await passwordHash('another-test-password-2026')},recovery),{alreadyPrivate:true});assert.equal(await verifyPassword(secret,store.read().users[0].passwordHash),true);
  await assert.rejects(()=>store.updateUser(state.users[0],state.users[0].id,{active:false}),{status:403});
});
test('A changed review, failed backup or unverified external copy leaves all demo data intact',async t=>{
  const {store,recovery}=fixture(t),req=await request(store),before=store.read();
  await assert.rejects(()=>activate(store,{...req,digest:'0'.repeat(64)},recovery),/han cambiado/);assert.deepEqual(store.read(),before);
  await assert.rejects(()=>activate(store,req,{make(){throw new Error('backup unavailable');}}),/backup unavailable/);assert.deepEqual(store.read(),before);
  await assert.rejects(()=>activate(store,{...req,requireExternal:true},{...recovery,status:()=>({externalConfigured:true,externalError:null}),external:async()=>{}}),/no está verificada/);assert.deepEqual(store.read(),before);
});
test('Changes while uploading the external backup cancel activation',async t=>{
  const {store,recovery}=fixture(t),req={...await request(store),requireExternal:true};
  const fake={...recovery,status:()=>({externalConfigured:true,externalError:null}),external:async()=>{const b=store.backups()[0];b.external={verifiedAt:new Date().toISOString()};fs.writeFileSync(path.join(store.directory,'backups',b.filename+'.json'),JSON.stringify(b));store.transaction(null,'CONCURRENT_EDIT',s=>{s.events[0].eventName='Concurrent edit preserved';});}};
  await assert.rejects(()=>activate(store,req,fake),/cambió durante/);assert.equal(store.read().events[0].eventName,'Concurrent edit preserved');assert.equal(store.read().users.length,3);
});
test('Private data and personal accounts cannot be silently cleared',async t=>{
  const {store,recovery}=fixture(t);store.transaction(null,'PERSONAL_ACCOUNT',state=>{state.users[0].demoAccount=false;});assert.throws(()=>review(store),/cuentas personales/);
  store.transaction(null,'PRIVATE_STATE',state=>{delete state.demo;});const before=store.read();assert.deepEqual(await activate(store,{},recovery),{alreadyPrivate:true});assert.deepEqual(store.read(),before);
});
test('After activation the private HTTP server hides demo access and rejects the former demo sessions',async t=>{
  const {store,dir,recovery}=fixture(t),old=store.newSession(store.read().users[0]);await activate(store,await request(store),recovery);
  const portal=createPortal({env:{DEMO_MODE:'0',DATA_DIR:dir,APP_ORIGIN:'http://private.test'},noAutomaticBackup:true,noAutomaticMail:true});await new Promise(r=>portal.server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>portal.server.close(r)));const base='http://127.0.0.1:'+portal.server.address().port;
  const session=await(await fetch(base+'/api/session')).json();assert.equal(session.demo,null);assert.equal(session.setupRequired,false);assert.equal((await fetch(base+'/api/state',{headers:{Cookie:'marquee_session='+old.token}})).status,401);
  const login=async(email,password)=>(await fetch(base+'/api/login',{method:'POST',headers:{Origin:'http://private.test','Content-Type':'application/json'},body:JSON.stringify({email,password})}));
  assert.equal((await login('admin@demo.test','MarqueeDemo2026!')).status,401);const result=await login('info@marquee.es',secret);assert.equal(result.status,200);const account=await result.json();assert.equal(account.user.protectedAccount,true);assert.equal(account.user.passwordHash,undefined);
});
test('Canonical redirects preserve paths and queries without redirecting health checks or trusting a supplied host',async t=>{
  const {store,dir,recovery}=fixture(t);await activate(store,await request(store),recovery);
  const portal=createPortal({env:{NODE_ENV:'production',PORTAL_SECRET_KEY:Buffer.alloc(32,19).toString('base64'),DEMO_MODE:'0',DATA_DIR:dir,APP_ORIGIN:'https://eventos.example.test',CANONICAL_HOST_REDIRECT:'1'},noAutomaticBackup:true,noAutomaticMail:true});await new Promise(r=>portal.server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>portal.server.close(r)));const base='http://127.0.0.1:'+portal.server.address().port;
  const page=await fetch(base+'/viewer?file=sample',{redirect:'manual'});assert.equal(page.status,308);assert.equal(page.headers.get('location'),'https://eventos.example.test/viewer?file=sample');assert.equal((await fetch(base+'/health',{redirect:'manual'})).status,200);
  const supplied=await fetch(base+'//untrusted.example/path',{redirect:'manual'});assert.equal(new URL(supplied.headers.get('location')).host,'eventos.example.test');
  assert.equal((await fetch(base+'/api/login',{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},body:'{}',redirect:'manual'})).status,403);
});
test('Startup validates private security before retiring any demo records',async t=>{
  const {store,dir}=fixture(t),before=store.read();fs.writeFileSync(path.join(dir,'.private-activation.json'),JSON.stringify({...await request(store),requireExternal:true}));
  const {spawnSync}=require('node:child_process');const result=spawnSync(process.execPath,[path.join(__dirname,'start.js')],{env:{PATH:process.env.PATH,NODE_ENV:'production',DEMO_MODE:'0',DATA_DIR:dir,APP_ORIGIN:'https://eventos.example.test'},encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stderr,/PORTAL_SECRET_KEY/);assert.deepEqual(store.read(),before);assert.equal(fs.existsSync(path.join(dir,'.private-activation.json')),true);
});
