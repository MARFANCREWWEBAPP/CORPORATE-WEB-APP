'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {admin,fail,now,id}=require('./store');
const {sha,verifyRecovery,getObject,unseal}=require('./reliability');

function inventory(filename) {
  const db=new DatabaseSync(filename,{readOnly:true});
  try {
    if(Object.values(db.prepare('PRAGMA integrity_check').get())[0]!=='ok')throw new Error('La copia no supera la integridad de base de datos.');
    const state=JSON.parse(db.prepare('SELECT value FROM state WHERE id=1').get().value);
    const files=db.prepare('SELECT id,eventId,bytes FROM files ORDER BY id').all();
    const references=state.events.flatMap(e=>[...e.budgets,...e.documents].map(f=>({eventId:e.id,...f})));
    for(const reference of references){
      const file=files.find(f=>f.id===reference.fileKey&&f.eventId===reference.eventId);
      if(!file||Buffer.from(file.bytes).length!==reference.sizeBytes)throw new Error('Falta un archivo o su tamaño no coincide.');
      if(reference.sha256&&sha(file.bytes)!==reference.sha256)throw new Error('Un archivo no coincide con su huella.');
    }
    for(const event of state.events)for(const release of event.production?.releases||[])if(sha(JSON.stringify(release.snapshot))!==release.sha256)throw new Error('La huella de una orden de producción no coincide.');
    const {outbox,resets,...business}=state;
    return {users:state.users.length,events:state.events.length,archived:state.events.filter(e=>['CANCELLED','NOT_ACCEPTED','COMPLETED'].includes(e.status)).length,files:files.length,orders:state.events.reduce((n,e)=>n+(e.production?.releases.length||0),0),changes:state.events.reduce((n,e)=>n+(e.changeRequests?.length||0),0),businessSha256:sha(JSON.stringify(business)),filesSha256:sha(JSON.stringify(files.map(f=>({id:f.id,eventId:f.eventId,sha256:sha(f.bytes)})))),sessions:db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n};
  } finally {db.close();}
}
function createContinuity(store,recovery,env,fetcher=fetch) {
  let running=false;
  function status(){
    const r=recovery.status(),state=store.read(),demo=env.DEMO_MODE==='1';
    const drill=state.settings.lastRecoveryDrill||null;
    const recent=value=>value&&Date.now()-Date.parse(value)<48*3600000;
    const checks=[
      {key:'private',label:'Entorno privado separado de la demo',ok:!demo},
      {key:'database',label:'Base de datos PostgreSQL',ok:!demo&&store.db.kind==='postgres'},
      {key:'volume',label:'Volumen persistente para copias locales',ok:!demo&&Boolean(env.RAILWAY_VOLUME_MOUNT_PATH)&&path.resolve(env.DATA_DIR)===path.resolve(env.RAILWAY_VOLUME_MOUNT_PATH)},
      {key:'https',label:'Acceso HTTPS y clave de seguridad configurada',ok:!demo&&/^https:\/\//.test(env.APP_ORIGIN||'')&&Boolean(env.PORTAL_SECRET_KEY)},
      {key:'local',label:'Copia local reciente y comprobada',ok:Boolean(recent(r.lastBackup?.createdAt)&&!r.lastError)},
      {key:'external',label:'Copia externa descargada y verificada',ok:Boolean(!demo&&recent(r.externalLastVerified)&&!r.externalError)},
      {key:'drill',label:'Recuperación externa ensayada en los últimos 30 días',ok:Boolean(!demo&&!state.settings.lastRecoveryDrillError&&drill?.source==='external'&&Date.now()-Date.parse(drill.at)<30*86400000)},
      {key:'capacity',label:'Capacidad de almacenamiento disponible',ok:!r.capacityWarning}
    ];
    return {mode:demo?'demo':'private',ready:checks.every(c=>c.ok),checks,lastDrill:drill,running,externalConfigured:r.externalConfigured};
  }
  async function drill(user,data){
    admin(user);if(running)fail(409,'Ya hay una comprobación de recuperación en curso.');
    if(!['local','external'].includes(data.source))fail(400,'Selecciona copia local o externa.');
    if(data.source==='external'&&(env.DEMO_MODE==='1'||!recovery.status().externalConfigured))fail(409,'Las copias externas todavía no están configuradas en el entorno privado.');
    running=true;let temporary;
    try {
      let backup,bytes;
      if(data.source==='external'){
        backup=store.backups().find(b=>b.external?.verifiedAt);
        if(!backup)fail(409,'Todavía no hay una copia externa verificada.');
        const encrypted=await getObject(env,backup.external.key,fetcher);
        if(sha(encrypted)!==backup.external.sha256)throw new Error('La huella externa no coincide.');
        bytes=unseal(encrypted,Buffer.from(env.BACKUP_ENCRYPTION_KEY,'base64'));
      }else{
        backup=recovery.make('ensayo de recuperación',true);
        bytes=fs.readFileSync(path.join(store.directory,'backups',backup.filename));
      }
      if(sha(bytes)!==backup.sha256)throw new Error('La huella de la copia no coincide.');
      temporary=fs.mkdtempSync(path.join(store.directory,'.recovery-check-'));
      const source=path.join(temporary,'source.sqlite');fs.writeFileSync(source,bytes,{mode:0o600});
      const before=inventory(source),destination=path.join(temporary,'restored');
      verifyRecovery(source,destination,backup.sha256);
      const after=inventory(path.join(destination,'marquee.sqlite'));
      if(before.businessSha256!==after.businessSha256||before.filesSha256!==after.filesSha256||after.sessions!==0)throw new Error('La recuperación no coincide con la copia o conserva sesiones anteriores.');
      const {sessions,...counts}=after;
      const report={id:id(),at:now(),source:data.source,backupFilename:backup.filename,backupCreatedAt:backup.createdAt,sha256:backup.sha256,...counts};
      store.transaction(user,'RECOVERY_DRILL_PASSED',state=>{state.settings.lastRecoveryDrill=report;delete state.settings.lastRecoveryDrillError;});
      return report;
    }catch(error){
      store.transaction(user,'RECOVERY_DRILL_FAILED',state=>{state.settings.lastRecoveryDrillError={at:now(),source:data.source};});
      if(error.status)throw error;
      throw Object.assign(new Error('La comprobación de recuperación falló. La base activa y las copias anteriores se conservan.'),{status:500});
    }finally{
      // This folder is created exclusively by this check and never contains the active database.
      if(temporary)fs.rmSync(temporary,{recursive:true,force:true});running=false;
    }
  }
  return {status,drill};
}
module.exports={createContinuity,inventory};
