'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {Store}=require('../portal/store');
require('../portal/server');
const {migrate}=require('./migrate-postgres');
const {privateFixture}=require('./private-fixture');
const {inventory}=require('../portal/continuity');
const {context,sha}=require('../portal/reliability');
test('PostgreSQL preserves published order signatures and verified backups after restart',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'marquee-pg-order-'));let f,restored;
  try{
    const options={postgresTestDirectory:path.join(root,'postgres')};f=await privateFixture(path.join(root,'data'),options);
    const original=JSON.stringify(f.release.snapshot),stored=f.fresh().production.releases[0];
    assert.equal(JSON.stringify(stored.snapshot),original);assert.equal(sha(original),stored.sha256);
    const first=f.store.backup('manual');assert.equal(inventory(path.join(root,'data/backups',first.filename)).orders,1);
    f.store.close();f.store=null;
    restored=new Store(path.join(root,'data'),options);
    const event=restored.read().events.find(e=>e.id===f.eventId);assert.equal(JSON.stringify(event.production.releases[0].snapshot),original);
    const backup=restored.backup('manual');assert.equal(inventory(path.join(root,'data/backups',backup.filename)).orders,1);
  }finally{f?.store?.close();restored?.close();fs.rmSync(root,{recursive:true,force:true});}
});
test('Private migration keeps orders, files and retry records, and revokes previous recovery links',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'marquee-pg-migration-'));let f,target;
  try{
    f=await privateFixture(path.join(root,'source'));
    const operation={route:'POST /api/events/'+f.eventId+'/comments',key:'migration-retry-'+crypto.randomUUID(),digest:sha('same request')};
    const first=context.run({...operation},()=>f.store.transaction(f.admin,'RETRY_FIXTURE',()=>({id:crypto.randomUUID()})));
    const oldSession=f.store.newSession(f.user);
    f.store.transaction(f.admin,'RESET_FIXTURE',state=>{state.resets.push({id:'old-reset',usedAt:null});state.outbox.push({id:'old-mail',type:'reset',sentAt:null});});
    const before=f.store.read(),backup=f.store.backup('manual'),source=path.join(root,'source/backups',backup.filename);
    target=new Store(path.join(root,'target'),{postgresTestDirectory:path.join(root,'postgres')});migrate(source,backup.sha256,target);
    const after=target.read();for(const key of ['events','users','venues'])assert.deepEqual(after[key],before[key]);
    assert.equal(target.session(oldSession.token),null);assert.ok(after.resets[0].usedAt);assert.ok(after.outbox.find(m=>m.id==='old-mail').cancelledAt);
    const replay=context.run({...operation},()=>target.transaction(target.read().users.find(u=>u.id===f.admin.id),'RETRY_FIXTURE',()=>{throw Error('Duplicate executed after migration');}));assert.deepEqual(replay,first);
    const restored=target.backup('manual');assert.equal(inventory(path.join(root,'target/backups',restored.filename)).orders,1);
    assert.equal(sha(fs.readFileSync(source)),backup.sha256);assert.throws(()=>migrate(source,backup.sha256,target),/debe estar vacío/);
  }finally{f?.store.close();target?.close();fs.rmSync(root,{recursive:true,force:true});}
});
test('Migration rejects corrupted attachments before writing any target business data',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'marquee-pg-corruption-'));let f,target;
  try{
    f=await privateFixture(path.join(root,'source'));const backup=f.store.backup('manual'),file=path.join(root,'source/backups',backup.filename);
    const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(file);db.prepare('UPDATE files SET bytes=?').run(Buffer.from('corrupt'));db.close();
    target=new Store(path.join(root,'target'),{postgresTestDirectory:path.join(root,'postgres')});const before=target.read();
    assert.throws(()=>migrate(file,sha(fs.readFileSync(file)),target),/archivo|huella/);assert.deepEqual(target.read(),before);assert.equal(target.db.prepare('SELECT COUNT(*) AS n FROM files').get().n,0);
  }finally{f?.store.close();target?.close();fs.rmSync(root,{recursive:true,force:true});}
});
test('Legacy JSONB state is rejected without rewriting existing records',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'marquee-pg-legacy-')),{PGlite}=require('@electric-sql/pglite');let db;
  try{
    const directory=path.join(root,'postgres');db=new PGlite(directory);await db.waitReady;await db.exec('CREATE TABLE state (id INTEGER PRIMARY KEY, value JSONB NOT NULL)');await db.query('INSERT INTO state VALUES (1,$1)',[JSON.stringify({marker:'preserve existing state'})]);await db.close();db=null;
    assert.throws(()=>new Store(path.join(root,'data'),{postgresTestDirectory:directory}),/formato anterior/);
    db=new PGlite(directory);await db.waitReady;assert.deepEqual((await db.query('SELECT value FROM state')).rows[0].value,{marker:'preserve existing state'});
  }finally{await db?.close();fs.rmSync(root,{recursive:true,force:true});}
});
test('Migration refuses a destination containing sessions or retry records without overwriting them',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'marquee-pg-nonempty-'));let f,target;
  try{
    f=await privateFixture(path.join(root,'source'));const backup=f.store.backup('manual'),source=path.join(root,'source/backups',backup.filename);
    target=new Store(path.join(root,'target'),{postgresTestDirectory:path.join(root,'postgres')});
    const untouched=target.read();
    for(const table of ['sessions','operations']){
      target.db.prepare('INSERT INTO '+table+' VALUES (?,?,?,?)').run('existing','preserved','{}',Date.now()+60000);
      const records=target.db.prepare('SELECT * FROM '+table).all();
      assert.throws(()=>migrate(source,backup.sha256,target),/debe estar vacío/);
      assert.deepEqual(target.read(),untouched);assert.deepEqual(target.db.prepare('SELECT * FROM '+table).all(),records);
      target.db.exec('DELETE FROM '+table);
    }
  }finally{f?.store.close();target?.close();fs.rmSync(root,{recursive:true,force:true});}
});
test('PostgreSQL engine: accounts, transactions, files, durable restart and portable recovery',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'marquee-postgres-'));let store,restored;
  try{const directory=path.join(root,'data'),pgDirectory=path.join(root,'postgres');store=new Store(directory,{postgresTestDirectory:pgDirectory});const user=await store.provisionProtectedAdmin('test-postgres-password-2026');const actor=store.read().users[0];
    const venue=store.saveVenue(actor,null,{name:'Espacio PostgreSQL'});const event=store.createEvent(actor,{eventName:'Evento compartido',eventDate:'2027-11-01',venueId:venue.id});assert.ok(event.assignedCommercialId);
    const bytes=Buffer.from('%PDF-1.4\nMuestra\n%%EOF');const file=store.addFile(actor,event.id,{kind:'budgets',originalName:'muestra.pdf',mimeType:'application/pdf',amount:1250},bytes);assert.deepEqual(store.file(actor,file.fileKey).bytes,bytes);
    const revision=store.read().revision;assert.throws(()=>store.transaction(actor,'ROLLBACK_TEST',state=>{state.events[0].eventName='No guardar';throw new Error('rollback');}),/rollback/);assert.equal(store.read().revision,revision);assert.equal(store.read().events[0].eventName,'Evento compartido');
    const session=store.newSession(actor);assert.equal(store.session(session.token).user.id,user.id);
    const backup=store.backup('manual'),source=path.join(directory,'backups',backup.filename);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),backup.sha256);
    store.close();store=new Store(directory,{postgresTestDirectory:pgDirectory});assert.equal(store.read().events.length,1);assert.deepEqual(store.file(store.read().users[0],file.fileKey).bytes,bytes);
    restored=new Store(path.join(root,'restored'),{postgresTestDirectory:path.join(root,'postgres-restored')});const result=migrate(source,backup.sha256,restored);assert.equal(result.events,1);assert.equal(result.files,1);assert.deepEqual(restored.file(restored.read().users[0],file.fileKey).bytes,bytes);assert.equal(restored.session(session.token),null);assert.throws(()=>migrate(source,backup.sha256,restored),/debe estar vacío/);
    const existing=path.join(root,'existing-local'),local=new Store(existing);await local.provisionProtectedAdmin('local-test-password-2026');local.close();const localBytes=fs.readFileSync(path.join(existing,'marquee.sqlite'));
    assert.throws(()=>new Store(existing,{postgresTestDirectory:path.join(root,'empty-target')}),/Migra una copia verificada/);assert.deepEqual(fs.readFileSync(path.join(existing,'marquee.sqlite')),localBytes);
  }finally{store?.close();restored?.close();fs.rmSync(root,{recursive:true,force:true});}
});
