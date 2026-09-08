'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {isIP}=require('node:net');
const {DatabaseSync}=require('node:sqlite');
const {AsyncLocalStorage}=require('node:async_hooks');
const context=new AsyncLocalStorage();
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const hmac=(key,value)=>crypto.createHmac('sha256',key).update(value).digest();
function clientAddress(req,env){
  // Railway documents X-Real-IP as the edge-supplied client address. Ignore forwarded headers outside that explicitly enabled deployment.
  const forwarded=req.headers['x-real-ip'];
  if(env.RAILWAY_ENVIRONMENT_ID&&env.TRUST_RAILWAY_PROXY==='1'&&typeof forwarded==='string'&&isIP(forwarded))return forwarded;
  return req.socket.remoteAddress||'unknown';
}
function install(Store){
  const original=Store.prototype.transaction;
  Store.prototype.transaction=function(actor,action,fn){
    const operation=context.getStore();
    if(!operation?.key||!actor||operation.used)return original.call(this,actor,action,fn);
    this.db.exec('CREATE TABLE IF NOT EXISTS operations (key TEXT PRIMARY KEY, digest TEXT NOT NULL, result TEXT NOT NULL, created INTEGER NOT NULL)');
    const key=actor.id+':'+operation.key;
    return original.call(this,actor,action,state=>{
      const cached=this.db.prepare('SELECT * FROM operations WHERE key=?').get(key);
      if(cached){if(cached.digest!==operation.digest)throw Object.assign(new Error('Ese identificador de envío ya se usó con datos diferentes.'),{status:409});const result=JSON.parse(cached.result);const event=state.events.find(e=>e.id===result?.id);if(event&&!require('./store').canVenue(actor,event.venueId))throw Object.assign(new Error('Evento no encontrado.'),{status:404});operation.used=true;return result;}
      const result=fn(state);this.db.prepare('INSERT INTO operations VALUES (?,?,?,?)').run(key,operation.digest,JSON.stringify(result??null),Date.now());operation.used=true;
      this.db.prepare('DELETE FROM operations WHERE created < ?').run(Date.now()-90*86400000);return result;
    });
  };
}
function sealed(bytes,key){const nonce=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,nonce);return Buffer.concat([Buffer.from('MRQ1'),nonce,cipher.update(bytes),cipher.final(),cipher.getAuthTag()]);}
function unseal(bytes,key){if(bytes.subarray(0,4).toString()!=='MRQ1')throw new Error('Copia cifrada no válida');const cipher=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(4,16));cipher.setAuthTag(bytes.subarray(-16));return Buffer.concat([cipher.update(bytes.subarray(16,-16)),cipher.final()]);}
async function putObject(env,key,bytes,fetcher=fetch,method='PUT'){
  const endpoint=new URL(env.BACKUP_S3_ENDPOINT);if(endpoint.protocol!=='https:')throw new Error('El destino externo debe usar HTTPS.');
  const objectPath=[env.BACKUP_S3_BUCKET,...key.split('/')].map(encodeURIComponent).join('/');const url=new URL(endpoint.href.replace(/\/$/,'')+'/'+objectPath);
  const at=new Date().toISOString().replace(/[:-]|\.\d{3}/g,''),day=at.slice(0,8),region=env.BACKUP_S3_REGION||'auto';
  const digest=sha(bytes),headers={'host':url.host,'x-amz-content-sha256':digest,'x-amz-date':at};if(env.BACKUP_S3_SESSION_TOKEN)headers['x-amz-security-token']=env.BACKUP_S3_SESSION_TOKEN;
  const names=Object.keys(headers).sort();const canonical=[method,url.pathname,'',names.map(n=>n+':'+headers[n]+'\n').join(''),names.join(';'),digest].join('\n');
  const scope=day+'/'+region+'/s3/aws4_request';const signing=hmac(hmac(hmac(hmac('AWS4'+env.BACKUP_S3_SECRET_KEY,day),region),'s3'),'aws4_request');
  headers.authorization='AWS4-HMAC-SHA256 Credential='+env.BACKUP_S3_ACCESS_KEY+'/'+scope+', SignedHeaders='+names.join(';')+', Signature='+hmac(signing,['AWS4-HMAC-SHA256',at,scope,sha(canonical)].join('\n')).toString('hex');
  const response=await fetcher(url,{method,headers,...(method==='GET'?{}:{body:bytes}),signal:AbortSignal.timeout(60000)});if(!response.ok)throw new Error('El almacenamiento externo rechazó la copia ('+response.status+').');if(method==='GET')return Buffer.from(await response.arrayBuffer());return {key,sha256:digest,sizeBytes:bytes.length};
}
function createRecovery(store,env){
  let lastError=null,externalError=null,inFlight=false;
  const configured=['BACKUP_S3_ENDPOINT','BACKUP_S3_BUCKET','BACKUP_S3_ACCESS_KEY','BACKUP_S3_SECRET_KEY','BACKUP_ENCRYPTION_KEY'].every(k=>env[k]);
  const key=configured?Buffer.from(env.BACKUP_ENCRYPTION_KEY,'base64'):null;if(key&&key.length!==32)throw new Error('BACKUP_ENCRYPTION_KEY debe contener 32 bytes en base64.');
  function make(reason,force=false){try{
    const previous=store.backups()[0],revision=store.read().revision;
    if(!force&&previous&&previous.revision===revision&&Date.now()-Date.parse(previous.createdAt)<86400000)return previous;
    const backup=store.backup(reason);backup.revision=revision;fs.writeFileSync(path.join(store.directory,'backups',backup.filename+'.json'),JSON.stringify(backup),{mode:0o600});lastError=null;return backup;
  }catch(error){lastError=new Date().toISOString();throw error;}}
  function prune(){
    const backups=store.backups(),keep=new Set(backups.slice(0,5).map(b=>b.filename)),daily=new Set(),monthly=new Set();
    const cutoff=Date.now()-31*86400000;
    for(const b of backups){const day=b.createdAt.slice(0,10),month=day.slice(0,7);if(!daily.has(day)&&Date.parse(b.createdAt)>=cutoff){keep.add(b.filename);daily.add(day);}if(!monthly.has(month)&&monthly.size<12){keep.add(b.filename);monthly.add(month);}if(['manual','antes de importar','antes de recuperación'].includes(b.reason))keep.add(b.filename);}
    // Only delete redundant automatic copies whose integrity metadata is present. No live or archived event is affected.
    for(const b of backups){if(keep.has(b.filename)||!['arranque','automática diaria','evento archivado','automática horaria'].includes(b.reason))continue;if(configured&&!b.external)continue;fs.unlinkSync(path.join(store.directory,'backups',b.filename));fs.unlinkSync(path.join(store.directory,'backups',b.filename+'.json'));}
  }
  async function external(){if(inFlight||!configured)return;inFlight=true;try{
    for(const b of store.backups().filter(b=>!b.external).slice(0,5)){
      const filename=path.join(store.directory,'backups',b.filename),bytes=fs.readFileSync(filename);if(sha(bytes)!==b.sha256)throw new Error('Integridad local incorrecta.');
      const object=await putObject(env,'marquee/'+b.filename+'.enc',sealed(bytes,key));await putObject(env,'marquee/'+b.filename+'.manifest.json',Buffer.from(JSON.stringify({...b,encryptedSha256:object.sha256,encryptedObject:object.key,format:'marquee-encrypted-backup-v1'})));b.external={...object,uploadedAt:new Date().toISOString()};fs.writeFileSync(filename+'.json',JSON.stringify(b),{mode:0o600});
    }externalError=null;prune();
  }catch(error){externalError={at:new Date().toISOString(),message:error.message};}finally{inFlight=false;}}
  function status(){const stats=fs.statfsSync(store.directory),free=Number(stats.bavail)*Number(stats.bsize),total=Number(stats.blocks)*Number(stats.bsize);const backups=store.backups();return {lastError,externalConfigured:configured,externalError,externalLastSuccess:backups.find(b=>b.external)?.external.uploadedAt||null,freeBytes:free,totalBytes:total,capacityWarning:free<Math.max(512*1024*1024,total*.1),retention:'31 puntos diarios y 12 mensuales; mínimo 5 copias recientes. Las manuales se conservan.',lastBackup:backups[0]||null};}
  function report(){const current=status();const problems=[current.lastError?'No se pudo crear una copia local':null,current.externalError?'La copia externa necesita revisión':null,current.capacityWarning?'El almacenamiento está cerca de su límite':null].filter(Boolean);if(!problems.length)return;const today=new Date().toISOString().slice(0,10);const signature=sha(today+problems.join('|'));if(store.read().notifications.some(n=>n.serviceAlert===signature))return;store.transaction(null,'CONTINUITY_ALERT',state=>{for(const user of state.users.filter(u=>u.active&&u.role==='ADMIN')){const notification={id:crypto.randomUUID(),recipientId:user.id,eventId:null,type:'SYSTEM_ALERT',title:'Revisar conservación de datos',body:problems.join('. '),createdAt:new Date().toISOString(),readAt:null,serviceAlert:signature};state.notifications.unshift(notification);state.outbox.push({id:notification.id,recipientId:user.id,type:'notification',subject:'Marquee Audiovisuales · Revisar conservación de datos',body:notification.body,createdAt:notification.createdAt,attempts:0,nextAttemptAt:notification.createdAt});}});}
  return {make,prune,external,status,report};
}
function verifyRecovery(source,destination,expectedHash,key){
  if(fs.existsSync(destination))throw new Error('La carpeta de destino ya existe; elige una carpeta nueva.');
  let bytes=fs.readFileSync(source);if(key)bytes=unseal(bytes,key);if(sha(bytes)!==expectedHash)throw new Error('La huella de la copia no coincide.');
  fs.mkdirSync(destination,{recursive:true,mode:0o700});const file=path.join(destination,'marquee.sqlite');fs.writeFileSync(file,bytes,{mode:0o600});const db=new DatabaseSync(file);
  try{if(Object.values(db.prepare('PRAGMA integrity_check').get())[0]!=='ok')throw new Error('Integridad incorrecta.');db.exec('DELETE FROM sessions');const state=JSON.parse(db.prepare('SELECT value FROM state WHERE id=1').get().value);state.resets=[];for(const n of state.outbox||[])if(n.type==='reset')n.cancelledAt=new Date().toISOString();db.prepare('UPDATE state SET value=? WHERE id=1').run(JSON.stringify(state));return {events:state.events.length,users:state.users.length,files:db.prepare('SELECT COUNT(*) AS n FROM files').get().n};}finally{db.close();}
}
module.exports={getObject:(env,key,fetcher=fetch)=>putObject(env,key,Buffer.alloc(0),fetcher,'GET'),context,sha,install,clientAddress,sealed,unseal,putObject,createRecovery,verifyRecovery};
