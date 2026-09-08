'use strict';
const crypto=require('node:crypto');
const {id,now,fail,text,admin,STATUSES,CLOSED}=require('./store');
const {normalize}=require('./workflow-store');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function inspect(store,archive){
  if(archive?.format!=='marquee-corporate-events-portable-backup'||!archive.data||!Array.isArray(archive.files))fail(400,'Selecciona una copia completa exportada desde la demo V4.');
  if(!Array.isArray(archive.data.events)||!Array.isArray(archive.data.venues)||archive.data.events.length>10000||archive.files.length>10000)fail(400,'La copia tiene una estructura o un tamaño no permitido.');
  const checksum=hash(JSON.stringify({data:archive.data,files:archive.files}));
  if(archive.checksum&&archive.checksum!=='no-disponible'&&archive.checksum!==checksum)fail(400,'La huella de integridad de la copia no coincide.');
  const state=store.read(),digest=hash(JSON.stringify(archive)),files=new Map(),venues=new Map(),events=[];let duplicates=0;
  for(const v of archive.data.venues){if(venues.has(v.id))fail(400,'La copia contiene espacios con identificadores repetidos.');venues.set(v.id,v);store.venueValues({...v,state:v.state==='INACTIVE'?'INACTIVE':'ACTIVE'});}
  for(const f of archive.files){const key=f.key||f.id;if(files.has(key))fail(400,'La copia contiene archivos repetidos.');if(typeof f.base64!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(f.base64))fail(400,'Hay un archivo codificado incorrectamente.');const bytes=Buffer.from(f.base64,'base64');if(bytes.length>20*1024*1024)fail(400,'Un archivo supera 20 MB.');files.set(key,{bytes,type:f.type});}
  const seen=new Set();
  for(const e of archive.data.events){if(seen.has(e.id))fail(400,'La copia contiene eventos con identificadores repetidos.');seen.add(e.id);const venue=venues.get(e.venueId);if(!venue)fail(400,'Un evento no tiene su espacio en la copia.');store.eventValues(e);
    const fingerprint=hash(normalize(venue.name)+'|'+normalize(e.eventName)+'|'+e.eventDate);
    if(state.events.some(current=>current.importSourceId===e.id&&current.importFingerprint===fingerprint||normalize(state.venues.find(v=>v.id===current.venueId)?.name)===normalize(venue.name)&&normalize(current.eventName)===normalize(e.eventName)&&current.eventDate===e.eventDate)){duplicates++;continue;}
    for(const f of [...(e.documents||[]),...(e.budgets||[])]){if(!f.fileKey||!files.has(f.fileKey))fail(400,'Falta el archivo '+text(f.displayName||f.originalName||'sin nombre',300)+' del evento '+text(e.eventName,300)+'. Exporta una copia completa antes de importar.');require('./server').parseFile({originalName:f.originalName||f.displayName,base64:files.get(f.fileKey).bytes.toString('base64')});}
    events.push({source:e,fingerprint});
  }
  const warnings=[];if(!archive.checksum||archive.checksum==='no-disponible')warnings.push('La demo no aportó una huella previa; se verificará que el archivo revisado no cambie antes de importarlo.');warnings.push('Se omiten las cuentas y contraseñas de la demo. Los autores históricos se conservan como texto.');
  return {digest,newEvents:events.length,duplicates,files:files.size,warnings,events,venues,sourceFiles:files};
}
function preview(store,user,archive){admin(user);const {digest,newEvents,duplicates,files,warnings}=inspect(store,archive);return {digest,newEvents,duplicates,files,warnings};}
function commit(store,user,data,recovery){admin(user);const plan=inspect(store,data.archive);if(data.digest!==plan.digest)fail(409,'La copia cambió desde la revisión. Analízala de nuevo.');recovery.make('antes de importar',true);
  return store.transaction(user,'LEGACY_DATA_IMPORTED',state=>{
    const venueMap=new Map();for(const [sourceId,source]of plan.venues){let venue=state.venues.find(v=>normalize(v.name)===normalize(source.name));if(!venue){venue={id:id(),...store.venueValues({...source,state:source.state==='INACTIVE'?'INACTIVE':'ACTIVE'}),createdAt:now(),importSourceId:sourceId};state.venues.push(venue);}venueMap.set(sourceId,venue.id);}
    const authorLabel=sourceId=>{const user=data.archive.data.users?.find(u=>u.id===sourceId);return user?[user.firstName,user.lastName].filter(Boolean).join(' '):'Autor de la demo';};
    for(const {source,fingerprint}of plan.events){
      if(state.events.some(e=>e.importSourceId===source.id&&e.importFingerprint===fingerprint))continue;
      const status=source.deletedAt?'CANCELLED':STATUSES.includes(source.status)?source.status:'PENDING_REVIEW';
      const event={id:id(),venueId:venueMap.get(source.venueId),...store.eventValues(source),status,priority:['LOW','NORMAL','HIGH','URGENT','VERY_URGENT'].includes(source.priority)?source.priority:'NORMAL',createdById:user.id,assignedCommercialId:null,createdAt:text(source.createdAt,50)||now(),updatedAt:now(),revision:1,deletedAt:null,archivedAt:CLOSED.includes(status)?now():null,acceptedAt:source.acceptedAt||(['CONFIRMED','COMPLETED'].includes(status)?now():null),budgets:[],documents:[],comments:[],internalNotes:[],history:[],tasks:[],infoRequests:[],readBy:[],operationalTimes:{},waitingOn:CLOSED.includes(status)?'NONE':'MARQUEE',nextAction:'Revisar expediente importado',nextActionDue:'',importSourceId:text(String(source.id),200),importFingerprint:fingerprint,importedAt:now()};
      for(const k of ['comments','internalNotes'])for(const item of source[k]||[])event[k].push({id:id(),authorId:user.id,importedAuthor:text(authorLabel(item.authorId),300),body:text('['+authorLabel(item.authorId)+' · histórico] '+(item.body||''),25000),createdAt:text(item.createdAt,50)||now()});
      for(const h of source.history||[])event.history.push({id:id(),actorId:user.id,summary:text('['+authorLabel(h.actorId)+' · histórico] '+(h.summary||''),25000),action:'IMPORTED_HISTORY',internal:Boolean(h.internal),createdAt:text(h.createdAt,50)||now()});
      for(const k of ['tasks','infoRequests'])for(const task of source[k]||[])event[k].push({id:id(),title:text(task.title,2000),label:text(task.label,2000),done:Boolean(task.done),assignedTo:['MARQUEE','VENUE','AGENCY','CLIENT'].includes(task.assignedTo)?task.assignedTo:'MARQUEE',dueDate:text(task.dueDate,10),createdAt:text(task.createdAt,50)||now(),completedAt:task.done?text(task.completedAt,50)||now():null});
      for(const [k,value]of Object.entries(source.operationalTimes||{}))if(['access','setup','technicalTest','doors','eventStart','eventEnd','dismantle'].includes(k))event.operationalTimes[k]=text(value,100);
      for(const kind of ['budgets','documents'])for(const f of source[kind]||[]){const bytes=plan.sourceFiles.get(f.fileKey).bytes,parsed=require('./server').parseFile({originalName:f.originalName||f.displayName,base64:bytes.toString('base64')});const metadata={id:id(),fileKey:id(),originalName:text(f.originalName||f.displayName,200,true),displayName:text(f.displayName||f.originalName,200,true),description:text(f.description,10000),mimeType:parsed.mimeType,sizeBytes:bytes.length,uploadedById:user.id,createdAt:text(f.createdAt,50)||now(),viewedBy:[],downloadedBy:[],sha256:hash(bytes)};
        if(kind==='budgets'){Object.assign(metadata,{version:Number.isInteger(f.version)?f.version:event.budgets.length+1,status:['DRAFT','SENT','FINAL','ARCHIVED'].includes(f.status)?f.status:'DRAFT',isCurrent:Boolean(f.isCurrent),amountCents:Number.isSafeInteger(f.amountCents)?f.amountCents:null,currency:'EUR'});}else metadata.visibility=f.visibility==='INTERNAL'?'INTERNAL':'SHARED';store.db.prepare('INSERT INTO files VALUES (?,?,?)').run(metadata.fileKey,event.id,bytes);event[kind].push(metadata);
      }
      const shared=event.budgets.filter(b=>['SENT','FINAL'].includes(b.status)).sort((a,b)=>b.version-a.version);if(shared.length){for(const b of event.budgets)b.isCurrent=b===shared[0];event.budgetSentAt=shared[0].createdAt;}
      store.applyEventExtras(state,user,event,{});store.history(event,user,'Expediente importado desde una copia V4 verificada; no se reemplazaron datos actuales.','IMPORTED');state.events.push(event);
    }
    return {imported:plan.newEvents,duplicates:plan.duplicates,digest:plan.digest};
  });
}
module.exports={preview,commit};
