'use strict';
const fs=require('node:fs');
const path=require('node:path');

function createHiDriveBackup(store,env,{sha,sealed,unseal},fetcher=fetch){
  const fields=['BACKUP_HIDRIVE_URL','BACKUP_HIDRIVE_USER','BACKUP_HIDRIVE_PASSWORD'];
  const requested=fields.some(name=>Boolean(env[name]));
  let target,key,destinationId,configurationError=null,lastError=null,running=false;
  if(requested)try{
    if(![...fields,'BACKUP_ENCRYPTION_KEY'].every(name=>env[name]))throw new Error('Falta completar el acceso de HiDrive y la clave de cifrado.');
    target=new URL(env.BACKUP_HIDRIVE_URL);
    if(target.protocol!=='https:'||!/^([a-z0-9-]+\.)?webdav\.hidrive\.ionos\.com$/.test(target.hostname)||target.port||target.username||target.password||target.search||target.hash)throw new Error('Configura una carpeta HTTPS de WebDAV de IONOS HiDrive.');
    if(target.pathname==='/'||target.pathname.split('/').some(part=>/%2f|%5c/i.test(part)))throw new Error('Selecciona una carpeta específica para las copias de B2BE.');
    if(env.BACKUP_HIDRIVE_USER.includes(':'))throw new Error('El nombre de usuario de HiDrive no es válido.');
    target.pathname=target.pathname.replace(/\/+$/,'')+'/';
    key=Buffer.from(env.BACKUP_ENCRYPTION_KEY,'base64');
    if(key.length!==32)throw new Error('La clave de cifrado debe contener 32 bytes en base64.');
    destinationId=sha(target.href+'\n'+env.BACKUP_HIDRIVE_USER);
  }catch(error){configurationError=error.message;}
  const configured=requested&&!configurationError;
  function verified(backup){return Boolean(configured&&backup.hidrive?.destinationId===destinationId&&backup.hidrive.verifiedAt);}
  async function request(method,name='',bytes){
    if(!configured)throw new Error(configurationError||'HiDrive todavía no está configurado.');
    // Only our generated filenames are appended. Never follow redirects carrying credentials.
    if(name&&!/^[a-zA-Z0-9._-]+$/.test(name))throw new Error('Nombre de copia no válido.');
    let response;
    try{response=await fetcher(new URL(encodeURIComponent(name),target),{method,redirect:'error',signal:AbortSignal.timeout(60000),headers:{Authorization:'Basic '+Buffer.from(env.BACKUP_HIDRIVE_USER+':'+env.BACKUP_HIDRIVE_PASSWORD).toString('base64'),'Content-Type':'application/octet-stream'},...(bytes===undefined?{}:{body:bytes})});}
    catch{throw new Error('No se ha podido conectar de forma segura con HiDrive.');}
    if(method==='MKCOL'&&response.status===405){await response.arrayBuffer();return;}
    if(!response.ok)throw new Error(response.status===401||response.status===403?'HiDrive ha rechazado el acceso. Revisa la cuenta y su permiso de escritura.':response.status===409?'La carpeta padre de las copias no existe en HiDrive.':'HiDrive no ha completado la operación ('+response.status+').');
    if(method==='GET')return Buffer.from(await response.arrayBuffer());
    await response.arrayBuffer();
  }
  async function sync(){
    if(!configured||running)return;
    running=true;
    try{
      const pending=store.backups().filter(backup=>!verified(backup)).slice(0,5);
      if(pending.length)await request('MKCOL');
      for(const backup of pending){
        const filename=path.join(store.directory,'backups',backup.filename);
        const bytes=fs.readFileSync(filename);
        if(sha(bytes)!==backup.sha256)throw new Error('La copia local no coincide con su huella; no se ha enviado a HiDrive.');
        const encrypted=sealed(bytes,key),name=backup.filename+'.enc';
        await request('PUT',name,encrypted);
        const downloaded=await request('GET',name);
        if(sha(downloaded)!==sha(encrypted)||sha(unseal(downloaded,key))!==backup.sha256)throw new Error('La copia descargada de HiDrive no coincide con el original.');
        const manifest=Buffer.from(JSON.stringify({filename:backup.filename,sha256:backup.sha256,sizeBytes:backup.sizeBytes,createdAt:backup.createdAt,encryptedSha256:sha(encrypted),encryptedObject:name,format:'marquee-encrypted-backup-v1'}));
        await request('PUT',backup.filename+'.manifest.json',manifest);
        if(sha(await request('GET',backup.filename+'.manifest.json'))!==sha(manifest))throw new Error('El manifiesto descargado de HiDrive no coincide.');
        const metadata={key:name,sha256:sha(encrypted),sizeBytes:encrypted.length,destinationId,uploadedAt:new Date().toISOString(),verifiedAt:new Date().toISOString()};
        // Other destinations can finish while this request is in flight; preserve their metadata.
        const latest=JSON.parse(fs.readFileSync(filename+'.json','utf8'));
        fs.writeFileSync(filename+'.json',JSON.stringify({...latest,hidrive:metadata}),{mode:0o600});
      }
      lastError=null;
    }catch(error){lastError={at:new Date().toISOString(),message:error.message};}
    finally{running=false;}
  }
  function status(){
    const backups=store.backups(),latest=backups.find(verified);
    return {requested,configured,running,error:configurationError?{message:configurationError}:lastError,lastVerified:latest?.hidrive.verifiedAt||null,pending:requested?backups.filter(b=>!verified(b)).length:0};
  }
  async function download(backup){
    if(!verified(backup))throw new Error('No hay una copia verificada en el destino HiDrive actual.');
    const encrypted=await request('GET',backup.hidrive.key);
    if(sha(encrypted)!==backup.hidrive.sha256)throw new Error('La huella de la copia de HiDrive no coincide.');
    const bytes=unseal(encrypted,key);
    if(sha(bytes)!==backup.sha256)throw new Error('El contenido de la copia de HiDrive no coincide.');
    return bytes;
  }
  return {sync,status,verified,download};
}
module.exports={createHiDriveBackup};
