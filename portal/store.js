'use strict';
const {DatabaseSync} = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {promisify} = require('node:util');
const scrypt = promisify(crypto.scrypt);
const PROTECTED_ADMIN_EMAIL = 'info@marquee.es';
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const clone = value => structuredClone(value);
const fail = (status, message) => { throw Object.assign(new Error(message), {status}); };
const text = (value, max = 500, required = false) => {
  if (value != null && typeof value !== 'string') fail(400, 'Texto no válido.');
  const result = (value || '').trim();
  if (result.length > max || (required && !result)) fail(400, 'Revisa los campos obligatorios y su longitud.');
  return result;
};
const email = value => { const result = text(value, 254, true).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) fail(400, 'Email no válido.'); return result; };
const choice = (value, options) => { if (!options.includes(value)) fail(400, 'Opción no válida.'); return value; };
const date = (value, required = false) => {
  const result = text(value, 10, required);
  if (result && (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0,10) !== result)) fail(400, 'Fecha no válida.');
  return result;
};
const STATUSES = ['NEW_REQUEST','PENDING_REVIEW','INFORMATION_PENDING','PREPARING_BUDGET','BUDGET_SENT','PENDING_RESPONSE','NEGOTIATION','CONFIRMED','NOT_ACCEPTED','CANCELLED','COMPLETED'];
const CLOSED = ['NOT_ACCEPTED','CANCELLED','COMPLETED'];
const STATUS_LABEL = {NEW_REQUEST:'Nueva petición',PENDING_REVIEW:'Pendiente de revisión',INFORMATION_PENDING:'Información pendiente',PREPARING_BUDGET:'Preparando presupuesto',BUDGET_SENT:'Presupuesto enviado',PENDING_RESPONSE:'Pendiente de respuesta',NEGOTIATION:'En negociación',CONFIRMED:'Confirmado',NOT_ACCEPTED:'No aceptado',CANCELLED:'Cancelado',COMPLETED:'Realizado'};
const ops = user => ['ADMIN','COMMERCIAL'].includes(user.role);
const admin = user => { if (user.role !== 'ADMIN') fail(403, 'Solo administración puede realizar esta acción.'); };
const publicUser = user => { const {passwordHash, ...result} = user; return result; };
async function passwordHash(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) fail(400, 'La contraseña debe tener entre 12 y 128 caracteres.');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64, {N:32768, r:8, p:1, maxmem:64*1024*1024});
  return `${salt}:${hash.toString('hex')}`;
}
async function verifyPassword(password, stored) {
  const [salt, hex] = stored.split(':');
  const hash = await scrypt(String(password || '').slice(0,129), salt, 64, {N:32768,r:8,p:1,maxmem:64*1024*1024});
  const expected = Buffer.from(hex, 'hex');
  return expected.length === hash.length && crypto.timingSafeEqual(hash, expected);
}
function emptyState() {
  return {version:7, revision:0, users:[], venues:[], events:[], notifications:[], audit:[], settings:{showCommercialToVenue:true,staleDays:5,budgetResponseDays:4,emailNotifications:false,whatsappPrepared:false,automaticBackups:false,backupRetention:30}};
}
class Store {
  constructor(directory) {
    fs.mkdirSync(directory, {recursive:true,mode:0o700});
    this.directory = directory;
    this.db = new DatabaseSync(path.join(directory, 'marquee.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, userId TEXT NOT NULL, csrf TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, eventId TEXT NOT NULL, bytes BLOB NOT NULL);`);
    this.db.prepare('INSERT OR IGNORE INTO state VALUES (1,?)').run(JSON.stringify(emptyState()));
    if (Object.values(this.db.prepare('PRAGMA quick_check').get())[0] !== 'ok') throw new Error('La base de datos no supera la verificación de integridad.');
    this.db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
  }
  read() { return JSON.parse(this.db.prepare('SELECT value FROM state WHERE id=1').get().value); }
  transaction(actor, action, fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const state = this.read();
      if (actor) {
        const current = state.users.find(u=>u.id===actor.id && u.active);
        if (!current || current.role!==actor.role || current.venueId!==actor.venueId) fail(401,'Tu acceso ha cambiado. Vuelve a entrar.');
      }
      const result = fn(state);
      state.revision++;
      state.audit.unshift({id:id(),actorId:actor?.id || null,action,createdAt:now()});
      this.db.prepare('UPDATE state SET value=? WHERE id=1').run(JSON.stringify(state));
      this.db.exec('COMMIT');
      return result;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  session(rawToken) {
    if (!rawToken) return null;
    const token = crypto.createHash('sha256').update(rawToken).digest('hex');
    const session = this.db.prepare('SELECT * FROM sessions WHERE token=? AND expires>?').get(token, Date.now());
    if (!session) return null;
    const state = this.read();
    const user = state.users.find(u=>u.id===session.userId && u.active);
    if (!user || (user.role==='VENUE_USER' && !state.venues.some(v=>v.id===user.venueId && v.state==='ACTIVE'))) return null;
    return {...session,user};
  }
  newSession(user) {
    const token = crypto.randomBytes(32).toString('base64url');
    const csrf = crypto.randomBytes(32).toString('base64url');
    const expires = Date.now()+12*3600000;
    this.db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'),user.id,csrf,expires);
    return {token,csrf,user:publicUser(user),expires};
  }
  revoke(userId) { this.db.prepare('DELETE FROM sessions WHERE userId=?').run(userId); }
  view(user) {
    const state = this.read();
    state.users = state.users.filter(u=>ops(user) || u.id===user.id || u.venueId===user.venueId || (ops(u) && state.settings.showCommercialToVenue)).map(u=> {
      const safe = publicUser(u);
      if (!ops(user) && u.id!==user.id) return {id:u.id,firstName:u.firstName,lastName:u.lastName,role:u.role,active:u.active,venueId:u.venueId,email:u.venueId===user.venueId ? u.email : ''};
      return safe;
    });
    state.venues = state.venues.filter(v=>ops(user) || v.id===user.venueId);
    state.events = state.events.filter(e=>ops(user) || e.venueId===user.venueId);
    if (!ops(user)) state.events = state.events.map(event=> {
      event.internalNotes=[];
      event.history=event.history.filter(h=>!h.internal);
      event.budgets=event.budgets.filter(b=>['SENT','FINAL'].includes(b.status));
      event.documents=event.documents.filter(d=>d.visibility==='SHARED');
      event.tasks=event.tasks.filter(t=>t.assignedTo==='VENUE');
      event.infoRequests=event.infoRequests.filter(t=>t.assignedTo==='VENUE');
      if (!state.settings.showCommercialToVenue) event.assignedCommercialId=null;
      return event;
    });
    state.notifications=state.notifications.filter(n=>n.recipientId===user.id);
    if (user.role!=='ADMIN') state.audit=[];
    return state;
  }
  venue(state, venueId) { const venue=state.venues.find(v=>v.id===venueId); if (!venue || venue.state!=='ACTIVE') fail(400,'Selecciona un espacio de eventos activo.'); return venue; }
  event(state, user, eventId, revision) {
    const event=state.events.find(e=>e.id===eventId);
    if (!event || (!ops(user) && event.venueId!==user.venueId)) fail(404,'Evento no encontrado.');
    if (revision!==undefined && revision!==event.revision) fail(409,'Otra persona ha actualizado el evento. Revisa los cambios antes de guardar.');
    return event;
  }
  history(event, user, summary, action='UPDATED', internal=false) {
    event.history.unshift({id:id(),actorId:user.id,summary,action,internal,createdAt:now()});
    event.updatedAt=now(); event.revision++;
  }
  notify(state,event,user,title,body, type='EVENT_UPDATED') {
    for (const recipient of state.users.filter(u=>u.active && u.id!==user.id && (ops(user) ? u.venueId===event.venueId : ops(u)))) {
      state.notifications.unshift({id:id(),recipientId:recipient.id,eventId:event.id,type,title,body,createdAt:now(),readAt:null});
    }
  }
  venueValues(data) {
    return {name:text(data.name,200,true),address:text(data.address),municipality:text(data.municipality,150),province:text(data.province,150),contactName:text(data.contactName,200),phone:text(data.phone,60),email:data.email ? email(data.email) : '',observations:text(data.observations,10000),state:choice(data.state||'ACTIVE',['ACTIVE','INACTIVE']),technicalProfile:data.technicalProfile||{}};
  }
  async prepareUser(data) {
    const temporaryPassword=data.password || crypto.randomBytes(18).toString('base64url');
    return {temporaryPassword,hash:await passwordHash(temporaryPassword)};
  }
  addUser(state,data,prepared, venueId) {
    const normalized=email(data.email);
    if (state.users.some(u=>u.email===normalized)) fail(409,'Ese email ya tiene una cuenta.');
    const role=choice(data.role||'VENUE_USER',['ADMIN','COMMERCIAL','VENUE_USER']);
    if (role==='VENUE_USER') this.venue(state,venueId||data.venueId);
    const user={id:id(),firstName:text(data.firstName,100,true),lastName:text(data.lastName,150),email:normalized,role,venueId:role==='VENUE_USER' ? venueId||data.venueId : null,active:true,mustChangePassword:true,passwordHash:prepared.hash,createdAt:now()};
    state.users.push(user); return user;
  }
  async createUser(actor,data) {
    admin(actor); const prepared=await this.prepareUser(data);
    const user=this.transaction(actor,'USER_CREATED',state=>this.addUser(state,data,prepared));
    return {user:publicUser(user),temporaryPassword:prepared.temporaryPassword};
  }
  async provisionProtectedAdmin(password) {
    const hash=await passwordHash(password);
    return this.transaction(null,'PROTECTED_ADMIN_PROVISIONED',state=> {
      let user=state.users.find(u=>u.email===PROTECTED_ADMIN_EMAIL);
      if(user?.protectedAccount)fail(409,'La cuenta protegida ya existe. Su contraseña no se sobrescribe.');
      if(!user){user={id:id(),firstName:'Administrador',lastName:'Marquee',email:PROTECTED_ADMIN_EMAIL,createdAt:now()};state.users.push(user);}
      Object.assign(user,{role:'ADMIN',venueId:null,active:true,protectedAccount:true,mustChangePassword:false,passwordHash:hash});
      this.revoke(user.id);return publicUser(user);
    });
  }
  async createVenueWithUser(actor,data) {
    admin(actor); const prepared=await this.prepareUser(data.user||{});
    const result=this.transaction(actor,'VENUE_AND_USER_CREATED',state=> {
      const venue={id:id(),...this.venueValues(data.venue||{}),createdAt:now()};
      state.venues.push(venue);
      const user=this.addUser(state,{...data.user,role:'VENUE_USER'},prepared,venue.id);
      return {venue,user:publicUser(user)};
    });
    return {...result,temporaryPassword:prepared.temporaryPassword};
  }
  async updateUser(actor,userId,data) {
    admin(actor);
    const hash=data.password ? await passwordHash(data.password) : null;
    return this.transaction(actor,'USER_UPDATED',state=> {
      const user=state.users.find(u=>u.id===userId); if (!user) fail(404,'Usuario no encontrado.');
      if(user.protectedAccount && (data.active===false || (data.role&&data.role!=='ADMIN') || (data.email&&email(data.email)!==user.email) || data.venueId || (hash&&actor.id!==user.id)))fail(403,'La cuenta de administración protegida no se puede desactivar, reasignar ni cambiar desde otra cuenta.');
      const role=choice(data.role||user.role,['ADMIN','COMMERCIAL','VENUE_USER']);
      const active=data.active===undefined ? user.active : data.active===true;
      if (user.id===actor.id && (!active || role!=='ADMIN')) fail(400,'No puedes desactivar ni quitar permisos a tu propia cuenta.');
      if (role==='VENUE_USER') this.venue(state,data.venueId||user.venueId);
      const normalized=data.email===undefined ? user.email : email(data.email);
      if (state.users.some(u=>u.email===normalized && u.id!==userId)) fail(409,'Ese email ya tiene una cuenta.');
      Object.assign(user,{role,active,email:normalized,venueId:role==='VENUE_USER' ? data.venueId||user.venueId : null});
      if (data.firstName!==undefined) user.firstName=text(data.firstName,100,true);
      if (data.lastName!==undefined) user.lastName=text(data.lastName,150);
      if (hash) {user.passwordHash=hash;user.mustChangePassword=true;}
      this.revoke(userId);
      return publicUser(user);
    });
  }
  saveVenue(actor,venueId,data) {
    admin(actor);
    return this.transaction(actor,'VENUE_UPDATED',state=> {
      if (!venueId) {const venue={id:id(),...this.venueValues(data),createdAt:now()}; state.venues.push(venue); return venue;}
      const venue=state.venues.find(v=>v.id===venueId); if (!venue) fail(404,'Finca no encontrada.');
      Object.assign(venue,this.venueValues({...venue,...data}));
      if (venue.state==='INACTIVE') for(const user of state.users.filter(u=>u.venueId===venueId)) this.revoke(user.id);
      return venue;
    });
  }
  eventValues(data) {
    const result={};
    if ('eventType' in data) result.eventType=choice(data.eventType,['CONVENTION','PRESENTATION','GALA','MEETING','PARTY','NETWORKING','TRAINING','OTHER']);
    for (const key of ['eventName','contactFirstName','contactLastName','agency','finalClient','email','phone','audiovisualRequest','technicalRequirements','observations']) if (key in data) result[key]=text(data[key],['audiovisualRequest','technicalRequirements','observations'].includes(key)?15000:300,key==='eventName');
    if ('eventDate' in data) result.eventDate=date(data.eventDate,true);
    for (const key of ['estimatedStartTime','estimatedEndTime']) if (key in data) {result[key]=text(data[key],5);if(result[key]&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(result[key])) fail(400,'Hora no válida.');}
    if ('numberOfPeople' in data) {const n=data.numberOfPeople==='' || data.numberOfPeople===null ? null : Number(data.numberOfPeople); if(n!==null && (!Number.isInteger(n)||n<1||n>1000000))fail(400,'Número de asistentes no válido.');result.numberOfPeople=n;}
    if (result.email) email(result.email);
    return result;
  }
  createEvent(user,data) {
    return this.transaction(user,'EVENT_CREATED',state=> {
      const venueId=ops(user) ? data.venueId : user.venueId;
      if (!ops(user) && data.venueId && data.venueId!==venueId) fail(403,'No puedes crear peticiones para otro espacio de eventos.');
      this.venue(state,venueId);
      const values=this.eventValues(data);
      if (!values.eventName || !values.eventDate) fail(400,'Indica el nombre y la fecha del evento.');
      const event={id:id(),venueId,...this.eventValues({contactFirstName:'',contactLastName:'',agency:'',finalClient:'',email:'',phone:'',audiovisualRequest:'',technicalRequirements:'',observations:'',estimatedStartTime:'',estimatedEndTime:'',numberOfPeople:null}),...values,status:'NEW_REQUEST',priority:choice(data.priority||'NORMAL',['LOW','NORMAL','HIGH','URGENT','VERY_URGENT']),createdById:user.id,assignedCommercialId:state.users.find(u=>u.active&&u.role==='COMMERCIAL')?.id||null,createdAt:now(),updatedAt:now(),revision:0,deletedAt:null,archivedAt:null,budgets:[],documents:[],comments:[],internalNotes:[],history:[],tasks:[],infoRequests:[],readBy:[],operationalTimes:{},waitingOn:'MARQUEE',nextAction:'Revisar nueva petición',nextActionDue:values.eventDate};
      this.history(event,user,'Se creó la petición de presupuesto','CREATED');
      state.events.unshift(event);this.notify(state,event,user,'Nueva petición recibida',event.eventName,'NEW_REQUEST');return event;
    });
  }
  updateEvent(user,eventId,data) {
    return this.transaction(user,'EVENT_UPDATED',state=> {
      const event=this.event(state,user,eventId,data.revision);
      if (!ops(user) && CLOSED.includes(event.status)) fail(403,'El evento está archivado. Solicita a Marquee su reapertura.');
      const protectedKeys=['status','priority','assignedCommercialId','nextAction','nextActionDue','waitingOn','operationalTimes'];
      if (!ops(user) && protectedKeys.some(k=>k in data)) fail(403,'Solo Marquee puede modificar la gestión del evento.');
      if (data.venueId && data.venueId!==event.venueId) {if(!ops(user))fail(403,'No puedes cambiar de espacio de eventos.');this.venue(state,data.venueId);event.venueId=data.venueId;}
      Object.assign(event,this.eventValues(data));
      if ('status' in data) {
        const previous=event.status; const status=choice(data.status,STATUSES);
        if(CLOSED.includes(previous) && !CLOSED.includes(status)) admin(user);
        event.status=status; event.archivedAt=CLOSED.includes(status)?event.archivedAt||now():null;
        if (['CONFIRMED','COMPLETED'].includes(status)) event.acceptedAt=event.acceptedAt||now();
        if (status==='COMPLETED') event.completedAt=now();
        if (status==='CANCELLED') event.cancelledAt=now();
        if (status==='BUDGET_SENT') event.budgetSentAt=event.budgetSentAt||now();
        if(previous!==status) this.history(event,user,`${STATUS_LABEL[previous]} → ${STATUS_LABEL[status]}. Se conserva el expediente completo.`,CLOSED.includes(status)?'ARCHIVED':'STATUS_CHANGED');
      }
      if ('priority' in data) event.priority=choice(data.priority,['LOW','NORMAL','HIGH','URGENT','VERY_URGENT']);
      if ('assignedCommercialId' in data) {if(data.assignedCommercialId&&!state.users.some(u=>u.id===data.assignedCommercialId&&ops(u)&&u.active))fail(400,'Responsable no válido.');event.assignedCommercialId=data.assignedCommercialId||null;}
      if ('nextAction' in data) event.nextAction=text(data.nextAction,2000);
      if ('nextActionDue' in data) event.nextActionDue=date(data.nextActionDue);
      if ('waitingOn' in data) event.waitingOn=choice(data.waitingOn,['NONE','MARQUEE','VENUE','AGENCY','CLIENT']);
      if ('operationalTimes' in data) for(const key of ['access','setup','technicalTest','doors','eventStart','eventEnd','dismantle']) event.operationalTimes[key]=text(data.operationalTimes[key],100);
      this.history(event,user,'Se actualizaron los datos del evento');
      this.notify(state,event,user,'Evento actualizado',`${event.eventName}: ${STATUS_LABEL[event.status]}`,'STATUS_CHANGED');return event;
    });
  }
  addComment(user,eventId,data) {
    return this.transaction(user,'COMMENT_CREATED',state=> {
      const event=this.event(state,user,eventId);
      if (data.internal && !ops(user)) fail(403,'Acceso no permitido.');
      const comment={id:id(),authorId:user.id,body:text(data.body,20000,true),createdAt:now()};
      event[data.internal?'internalNotes':'comments'].push(comment);
      this.history(event,user,data.internal?'Se añadió una nota interna':'Se añadió un mensaje compartido',data.internal?'INTERNAL_NOTE_ADDED':'COMMENT_ADDED',Boolean(data.internal));
      if(!data.internal)this.notify(state,event,user,'Nuevo mensaje',comment.body.slice(0,150),'NEW_COMMENT');return comment;
    });
  }
  task(user,eventId,data) {
    return this.transaction(user,'TASK_UPDATED',state=> {
      const event=this.event(state,user,eventId,data.revision);
      const kind=choice(data.kind,['tasks','infoRequests']);
      if(data.id) {
        const task=event[kind].find(t=>t.id===data.id); if(!task)fail(404,'Elemento no encontrado.');
        if(!ops(user)&&task.assignedTo!=='VENUE')fail(403,'Acceso no permitido.');
        if(typeof data.done!=='boolean')fail(400,'Estado no válido.');task.done=data.done;task.completedAt=data.done?now():null;
      } else {
        if(!ops(user))fail(403,'Solo Marquee puede asignar tareas.');
        event[kind].push({id:id(),[kind==='tasks'?'title':'label']:text(data.title||data.label,2000,true),done:false,assignedTo:choice(data.assignedTo||'VENUE',['MARQUEE','VENUE','AGENCY','CLIENT']),dueDate:date(data.dueDate),createdAt:now(),requestedAt:now(),requestedById:user.id,category:'GENERAL',completedAt:null});
      }
      this.history(event,user,'Se actualizó una tarea del expediente','TASK_UPDATED',kind==='tasks'&&data.assignedTo==='MARQUEE');
      this.notify(state,event,user,'Seguimiento actualizado',event.eventName);return event;
    });
  }
  addFile(user,eventId,data,bytes) {
    if(data.kind==='budgets' && !ops(user))fail(403,'Solo Marquee puede publicar presupuestos.');
    return this.transaction(user,'FILE_ADDED',state=> {
      const event=this.event(state,user,eventId,data.revision);
      const kind=choice(data.kind,['budgets','documents']);
      const file={id:id(),fileKey:id(),originalName:text(data.originalName,200,true),displayName:text(data.displayName||data.originalName,200,true),description:text(data.description,10000),mimeType:data.mimeType,sizeBytes:bytes.length,uploadedById:user.id,createdAt:now(),viewedBy:[],downloadedBy:[]};
      if(kind==='budgets') {file.version=Math.max(0,...event.budgets.map(b=>b.version))+1;file.status=choice(data.status||'SENT',['DRAFT','SENT','FINAL']);file.isCurrent=file.status!=='DRAFT'; if(file.isCurrent)event.budgets.forEach(b=>b.isCurrent=false);}
      if(kind==='budgets' && file.status!=='DRAFT')event.budgetSentAt=event.budgetSentAt||now();
      else {file.visibility=ops(user)?choice(data.visibility||'SHARED',['SHARED','INTERNAL']):'SHARED';}
      this.db.prepare('INSERT INTO files VALUES (?,?,?)').run(file.fileKey,eventId,bytes);event[kind].push(file);
      const internal=file.visibility==='INTERNAL'||file.status==='DRAFT';
      this.history(event,user,`Se añadió ${file.displayName}`,kind==='budgets'?'BUDGET_ADDED':'DOCUMENT_ADDED',internal);
      if(!internal)this.notify(state,event,user,kind==='budgets'?'Nuevo presupuesto disponible':'Nuevo documento',file.displayName,kind==='budgets'?'BUDGET_AVAILABLE':'EVENT_UPDATED');
      return file;
    });
  }
  file(user,fileId) {
    const state=this.view(user);let metadata;
    for(const event of state.events) {metadata=[...event.budgets,...event.documents].find(f=>f.fileKey===fileId);if(metadata)break;}
    if(!metadata)fail(404,'Archivo no encontrado.');
    const row=this.db.prepare('SELECT bytes FROM files WHERE id=?').get(fileId);if(!row)fail(404,'Archivo no encontrado.');
    return {metadata,bytes:Buffer.from(row.bytes)};
  }
  markRead(user,notificationId) {
    this.transaction(user,'NOTIFICATIONS_READ',state=>{for(const n of state.notifications)if(n.recipientId===user.id&&(!notificationId||n.id===notificationId))n.readAt=n.readAt||now();});
  }
  backup(reason='manual') {
    const folder=path.join(this.directory,'backups');fs.mkdirSync(folder,{recursive:true,mode:0o700});
    const filename=`marquee-${now().replaceAll(':','-')}-${id().slice(0,8)}.sqlite`;
    const destination=path.join(folder,filename);
    this.db.prepare('VACUUM INTO ?').run(destination);
    const db=new DatabaseSync(destination,{readOnly:true});
    try {if(Object.values(db.prepare('PRAGMA integrity_check').get())[0]!=='ok')throw new Error('Copia no íntegra');} finally {db.close();}
    const bytes=fs.readFileSync(destination);
    const metadata={filename,createdAt:now(),reason,sizeBytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
    fs.writeFileSync(destination+'.json',JSON.stringify(metadata),{mode:0o600});
    return metadata;
  }
  backups() {
    const folder=path.join(this.directory,'backups');if(!fs.existsSync(folder))return[];
    return fs.readdirSync(folder).filter(f=>/^marquee-.*\.sqlite\.json$/.test(f)).map(f=>JSON.parse(fs.readFileSync(path.join(folder,f),'utf8'))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  }
  exportArchive(user,status) {
    admin(user);const state=this.view(user);
    const events=state.events.filter(e=>!status||(status==='CANCELLED'?['CANCELLED','NOT_ACCEPTED'].includes(e.status):e.status===status));
    const fileIds=new Set(events.flatMap(e=>[...e.budgets,...e.documents].map(f=>f.fileKey)));
    const files=[...fileIds].map(fileId=>({id:fileId,base64:Buffer.from(this.db.prepare('SELECT bytes FROM files WHERE id=?').get(fileId).bytes).toString('base64')}));
    return {format:'marquee-archive-v1',createdAt:now(),category:status||'ALL',events,venues:state.venues,users:state.users.map(({id,firstName,lastName,role,venueId})=>({id,firstName,lastName,role,venueId})),files};
  }
  close(){this.db.close();}
}
module.exports={Store,fail,id,now,email,text,date,choice,ops,admin,publicUser,passwordHash,verifyPassword,emptyState,STATUSES,CLOSED,PROTECTED_ADMIN_EMAIL};
