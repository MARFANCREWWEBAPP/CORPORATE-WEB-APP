'use strict';
// Offline deployment operation. This is deliberately not exposed by the HTTP API.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {emptyState,PROTECTED_ADMIN_EMAIL,now,id}=require('./store');
const {sha,verifyRecovery}=require('./reliability');

function review(store){
  const state=store.read();
  if(state.demo?.version!==1)throw new Error('La retirada solo admite una base identificada como demostración.');
  if(state.users.some(u=>!u.demoAccount&&!(u.protectedAccount&&u.email===PROTECTED_ADMIN_EMAIL)))throw new Error('Hay cuentas personales en la demo. Revisa sus datos antes de retirar los ejemplos.');
  const files=store.db.prepare('SELECT id,eventId,bytes FROM files').all().map(f=>({id:f.id,eventId:f.eventId,sha256:sha(f.bytes)})).sort((a,b)=>a.id.localeCompare(b.id));
  return {digest:sha(JSON.stringify({state,files})),revision:state.revision,events:state.events.length,users:state.users.length,venues:state.venues.length,files:files.length,administrator:PROTECTED_ADMIN_EMAIL};
}

async function activate(store,request,recovery){
  // A restart must never repeat cleanup or replace the administrator's password.
  if(!store.read().demo)return {alreadyPrivate:true};
  if(request?.confirmation!=='RETIRAR DEMO'||!/^([a-f0-9]{32}):([a-f0-9]{128})$/.test(request.adminPasswordHash||''))throw new Error('Falta la confirmación de retirada o la credencial protegida.');
  const plan=review(store);
  if(request.digest!==plan.digest)throw new Error('Los datos han cambiado desde la revisión. No se ha retirado ningún registro.');
  const backup=recovery.make('antes de activar portal privado',true);
  const source=path.join(store.directory,'backups',backup.filename),verification=path.join(store.directory,'.activation-check-'+crypto.randomUUID());
  try{verifyRecovery(source,verification,backup.sha256);}finally{if(fs.existsSync(verification))fs.rmSync(verification,{recursive:true,force:true});}
  if(request.requireExternal){
    if(!recovery.status().externalConfigured)throw new Error('Configura la copia externa antes de retirar la demo.');
    await recovery.external();
    const verified=store.backups().find(b=>b.filename===backup.filename);
    if(recovery.status().externalError||!verified?.external?.verifiedAt)throw new Error('La copia externa anterior a la retirada no está verificada. Los datos se conservan.');
  }
  return store.transaction(null,'PRIVATE_PORTAL_ACTIVATED',state=>{
    if(review(store).digest!==plan.digest)throw new Error('La demo cambió durante la copia. Revisa de nuevo antes de continuar.');
    const previous=state.users.find(u=>u.protectedAccount&&u.email===PROTECTED_ADMIN_EMAIL);
    const administrator={id:previous?.id||id(),firstName:'Administrador',lastName:'Marquee',email:PROTECTED_ADMIN_EMAIL,passwordHash:request.adminPasswordHash,role:'ADMIN',venueId:null,venueIds:[],active:true,protectedAccount:true,mustChangePassword:false,createdAt:previous?.createdAt||now()};
    const fresh=emptyState();fresh.revision=state.revision;fresh.users=[administrator];
    fresh.privateActivation={at:now(),sourceDigest:plan.digest,removed:{events:plan.events,users:plan.users-(previous?1:0),venues:plan.venues,files:plan.files},backup:{filename:backup.filename,sha256:backup.sha256,createdAt:backup.createdAt}};
    for(const key of Object.keys(state))delete state[key];Object.assign(state,fresh);
    store.db.exec('DELETE FROM sessions; DELETE FROM files; CREATE TABLE IF NOT EXISTS operations (key TEXT PRIMARY KEY, digest TEXT NOT NULL, result TEXT NOT NULL, created INTEGER NOT NULL); DELETE FROM operations;');
    return {administrator:PROTECTED_ADMIN_EMAIL,...fresh.privateActivation};
  });
}
module.exports={review,activate};
