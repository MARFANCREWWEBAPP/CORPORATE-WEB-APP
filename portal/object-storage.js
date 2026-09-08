'use strict';
const {putObject,getObject,sealed,unseal,sha}=require('./reliability');
const {now,admin,fail}=require('./store');
function createObjectStorage(store,env,fetcher=fetch){
  const configured=env.DEMO_MODE!=='1'&&['FILES_S3_ENDPOINT','FILES_S3_BUCKET','FILES_S3_ACCESS_KEY','FILES_S3_SECRET_KEY','FILES_ENCRYPTION_KEY'].every(k=>env[k]);
  const settings=Object.fromEntries(['ENDPOINT','BUCKET','ACCESS_KEY','SECRET_KEY','REGION','SESSION_TOKEN'].map(k=>['BACKUP_S3_'+k,env['FILES_S3_'+k]]));
  const key=configured?Buffer.from(env.FILES_ENCRYPTION_KEY,'base64'):null;if(key&&key.length!==32)throw new Error('FILES_ENCRYPTION_KEY debe contener 32 bytes en base64.');
  let busy=false,lastError=null;
  function pending(){const state=store.read(),done=new Set((state.fileReplicas||[]).map(r=>r.fileKey));return state.events.flatMap(event=>[...event.documents,...event.budgets].filter(file=>!done.has(file.fileKey)).map(file=>({eventId:event.id,fileKey:file.fileKey})));}
  function review(user){admin(user);const state=store.read(),files=pending().slice(0,20).map(file=>{const event=state.events.find(e=>e.id===file.eventId),metadata=[...event.documents,...event.budgets].find(f=>f.fileKey===file.fileKey);return {...file,name:metadata.originalName,eventName:event.eventName,sizeBytes:metadata.sizeBytes};});const destination=configured?new URL(settings.BACKUP_S3_ENDPOINT).origin+'/'+settings.BACKUP_S3_BUCKET:env.DEMO_MODE==='1'?'Simulación demo, sin destino externo':'Sin destino configurado';return {configured,demo:env.DEMO_MODE==='1',destination,files,digest:sha(JSON.stringify({destination,files}))};}
  async function copyReviewed(user,approval){admin(user);const plan=review(user);if(approval.confirm!==true||approval.digest!==plan.digest)fail(409,'Revisa los archivos y el destino antes de confirmar la copia.');if(plan.demo)return {simulated:true,count:plan.files.length};if(!configured)fail(503,'Falta configurar un destino privado.');if(busy)fail(409,'Hay otra copia en curso.');busy=true;try{for(const file of plan.files){
      const row=store.db.prepare('SELECT bytes FROM files WHERE id=?').get(file.fileKey);if(!row)throw new Error('Falta un archivo en el almacenamiento de origen.');const bytes=Buffer.from(row.bytes),digest=sha(bytes),objectKey='documents/'+file.fileKey+'/'+digest+'.enc',encrypted=sealed(bytes,key);
      await putObject(settings,objectKey,encrypted,fetcher);
      // Confirm an independent read before recording the replica as verified.
      const recovered=unseal(await getObject(settings,objectKey,fetcher),key);if(sha(recovered)!==digest)throw new Error('La copia del documento no coincide con el original.');
      store.transaction(null,'DOCUMENT_REPLICA_VERIFIED',state=>{state.fileReplicas||=[];if(!state.fileReplicas.some(r=>r.fileKey===file.fileKey))state.fileReplicas.push({...file,objectKey,sha256:digest,encryptedSha256:sha(encrypted),verifiedAt:now()});});
    }lastError=null;return {simulated:false,count:plan.files.length};}catch(error){lastError={at:now(),message:'No se ha confirmado la copia externa de un documento. Los originales siguen conservados en la base de datos.'};throw error;}finally{busy=false;}}
  async function recover(fileKey){if(!configured)throw new Error('Almacenamiento externo no configurado.');const replica=(store.read().fileReplicas||[]).find(r=>r.fileKey===fileKey);if(!replica)throw new Error('No existe una réplica verificada.');const bytes=unseal(await getObject(settings,replica.objectKey,fetcher),key);if(sha(bytes)!==replica.sha256)throw new Error('El documento no coincide con su huella.');return bytes;}
  function status(){const state=store.read();return {configured,verified:(state.fileReplicas||[]).length,pending:pending().length,lastError};}
  return {configured,review,copyReviewed,recover,status};
}
module.exports={createObjectStorage};
