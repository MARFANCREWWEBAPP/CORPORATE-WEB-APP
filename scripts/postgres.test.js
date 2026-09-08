'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {Store}=require('../portal/store');
require('../portal/reliability').install(Store);
require('../portal/operations').install(Store);
const {migrate}=require('./migrate-postgres');
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
