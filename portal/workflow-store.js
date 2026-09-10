'use strict';
const crypto=require('node:crypto');
const {fail,id,now,text,email,choice,date,ops,admin,canVenue,CLOSED}=require('./store');
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').replace(/[^a-z0-9]+/g,' ').trim();
const {active:activeReservation}=require('./reservation-state');
function filterEvents(events,filters={}) {
  const query=normalize(filters.q);
  return events.filter(e=>(!filters.status||(filters.status==='CANCELLED'?['CANCELLED','NOT_ACCEPTED'].includes(e.status):e.status===filters.status))&&(!filters.venue||e.venueId===filters.venue)&&(!filters.from||e.eventDate>=filters.from)&&(!filters.to||e.eventDate<=filters.to)&&(!filters.eventType||e.eventType===filters.eventType)&&(!query||normalize([e.eventName,e.finalClient,e.agency,e.contactFirstName,e.contactLastName,e.email,e.phone,...e.documents.map(d=>d.displayName),...e.budgets.map(b=>b.displayName)].join(' ')).includes(query)));
}
function interval(event) {
  if(!event.eventDate)return null;
  const start=Date.parse(event.eventDate+'T'+(event.estimatedStartTime||'00:00')+':00Z');
  let end=Date.parse(event.eventDate+'T'+(event.estimatedEndTime||'23:59')+':00Z');
  if(end<=start)end+=86400000;
  return {start:start-(event.setupMinutes||0)*60000,end:end+(event.dismantleMinutes||0)*60000};
}
function scheduleConflicts(state,event) {
  const range=interval(event);if(!range)return[];
  return state.events.filter(e=>e.id!==event.id&&(e.status==='CONFIRMED'||(!CLOSED.includes(e.status)&&activeReservation(e)))).flatMap(e=>{
    const other=interval(e);if(!other||range.start>=other.end||other.start>=range.end)return[];
    const shared=(event.resourceIds||[]).filter(v=>(e.resourceIds||[]).includes(v));
    const room=event.venueId===e.venueId&&(!event.room||!e.room||normalize(event.room)===normalize(e.room));
    const hold=e.status==='CONFIRMED'?null:activeReservation(e);
    return room||shared.length?[{eventId:e.id,eventName:e.eventName,date:e.eventDate,room,resources:shared.map(v=>state.resources.find(r=>r.id===v)?.name||'Recurso'),kind:hold?'TEMPORARY_HOLD':'CONFIRMED',...(hold?{expiresAt:hold.expiresAt}:{})}]:[];
  });
}
function install(Store) {
  Store.prototype.applyEventExtras=function(state,user,event,data){
    if('finalClient'in data&&!('clientId'in data))event.clientId=null;
    if('clientId'in data){const client=state.clients.find(c=>c.id===data.clientId&&!c.mergedInto&&c.venueId===event.venueId);if(data.clientId&&!client)fail(400,'Cliente no disponible en este espacio.');event.clientId=client?.id||null;if(client)event.finalClient=client.name;}
    if(event.clientId&&!state.clients.some(c=>c.id===event.clientId&&c.venueId===event.venueId))event.clientId=null;
    if(!event.clientId&&event.finalClient){let c=state.clients.find(c=>c.venueId===event.venueId&&!c.mergedInto&&[c.name,...(c.aliases||[])].some(n=>normalize(n)===normalize(event.finalClient)));if(!c){c={id:id(),venueId:event.venueId,name:event.finalClient,aliases:[],email:'',phone:'',contactName:'',createdAt:now()};state.clients.push(c);}event.clientId=c.id;}
    if('room'in data)event.room=text(data.room,200);
    for(const k of ['setupMinutes','dismantleMinutes'])if(k in data){const n=Number(data[k]);if(!Number.isInteger(n)||n<0||n>10080)fail(400,'Indica minutos entre 0 y 10080.');event[k]=n;}
    if('resourceIds'in data){if(!ops(user))fail(403,'Solo Marquee asigna recursos.');if(!Array.isArray(data.resourceIds)||data.resourceIds.length>100)fail(400,'Recursos no válidos.');for(const v of data.resourceIds)if(!state.resources.some(r=>r.id===v&&r.active))fail(400,'Recurso no disponible.');event.resourceIds=[...new Set(data.resourceIds)];}
  };
  Store.prototype.checkSchedule=function(state,event,data,user){const conflicts=scheduleConflicts(state,event);if(conflicts.length){const reserved=conflicts.some(c=>c.kind==='TEMPORARY_HOLD');if(reserved||!ops(user)||!text(data.conflictReason,3000))throw Object.assign(new Error(reserved?'Hay una reserva temporal activa que coincide. Debe liberarse o caducar antes de confirmar.':'Hay coincidencias de espacio o recursos. Revisa disponibilidad antes de confirmar.'),{status:409,details:{kind:reserved?'reservation':'schedule',conflicts:ops(user)?conflicts:[{message:'El espacio o los recursos requieren revisión de disponibilidad por Marquee.'}]}});this.history(event,user,'Confirmación con coincidencias revisadas: '+text(data.conflictReason,3000),'SCHEDULE_OVERRIDE',true);}};
  Store.prototype.saveDraft=function(user,draftId,data){return this.transaction(user,'DRAFT_SAVED',state=>{
    let draft=state.drafts.find(d=>d.id===draftId&&d.userId===user.id&&!d.submittedEventId);
    if(draftId&&!draft)fail(404,'Borrador no encontrado.');
    if(draft&&draft.revision!==data.revision)fail(409,'El borrador ha cambiado en otro dispositivo. Tu texto sigue en esta pestaña.');
    const input=data.values||{};const values={};
    for(const k of ['eventName','contactFirstName','contactLastName','agency','finalClient','email','phone','audiovisualRequest','technicalRequirements','observations','eventDate','estimatedStartTime','estimatedEndTime','eventType','numberOfPeople','venueId','clientId','priority','room'])if(k in input)values[k]=text(String(input[k]??''),15000);
    values.venueId=values.venueId||user.venueId||'';
    if(values.venueId&&!canVenue(user,values.venueId))fail(403,'No puedes guardar borradores para otro espacio.');
    if(!draft){draft={id:id(),userId:user.id,createdAt:now(),revision:0};state.drafts.push(draft);}
    Object.assign(draft,{values,step:Math.max(1,Math.min(3,Number(data.step)||1)),updatedAt:now(),revision:draft.revision+1});return draft;
  });};
  Store.prototype.messageDraft=function(user,eventId,data){return this.transaction(user,'MESSAGE_DRAFT_SAVED',state=>{
    this.event(state,user,eventId);let draft=state.messageDrafts.find(d=>d.userId===user.id&&d.eventId===eventId);
    if(draft?data.revision!==draft.revision:data.revision!=null)throw Object.assign(new Error('El borrador de mensaje cambió en otro dispositivo. Revisa ambas versiones.'),{status:409,details:{kind:'message-draft',draft:draft||null}});
    if(!draft){draft={id:id(),userId:user.id,eventId,revision:0};state.messageDrafts.push(draft);}Object.assign(draft,{body:text(data.body,20000),revision:draft.revision+1,updatedAt:now()});return draft;
  });};
  Store.prototype.budgetDecision=function(user,eventId,budgetId,data){return this.transaction(user,'BUDGET_DECIDED',state=>{
    const event=this.event(state,user,eventId,data.revision);
    if(CLOSED.includes(event.status))fail(409,'El evento está archivado. Solicita su reapertura.');
    const budget=event.budgets.find(b=>b.id===budgetId&&['SENT','FINAL'].includes(b.status));
    if(!budget||!budget.isCurrent)fail(409,'Hay una versión más reciente. Abre el presupuesto vigente antes de decidir.');
    if(budget.validUntil&&budget.validUntil<now().slice(0,10))fail(409,'La propuesta ha caducado. Solicita una nueva versión.');
    if(budget.decisions?.some(d=>['ACCEPTED','REJECTED'].includes(d.decision)))fail(409,'Esta versión ya tiene una decisión definitiva. Publica otra versión para modificarla.');
    const decision=choice(data.decision,['ACCEPTED','REJECTED','CHANGES_REQUESTED']);
    const reason=text(data.reason,5000,decision!=='ACCEPTED');
    let signature=null;if(data.signature){if(decision!=='ACCEPTED'||data.signature.consent!==true)fail(400,'Debes aceptar expresamente el presupuesto antes de firmar.');signature={name:text(data.signature.name,200,true),method:'typed-name',statement:'He leído esta versión y acepto el presupuesto en nombre del cliente.',signedAt:now(),documentSha256:budget.sha256};}
    if(decision==='ACCEPTED'){
      this.checkSchedule(state,event,data,user);
      event.acceptedAt=event.acceptedAt||now();event.acceptedBudgetId=budget.id;event.acceptedAmountCents=budget.amountCents;event.status='CONFIRMED';event.waitingOn='NONE';
    }else if(decision==='REJECTED'){event.status='NOT_ACCEPTED';event.archivedAt=now();event.closeReason=reason;}
    else{event.status='NEGOTIATION';event.waitingOn='MARQUEE';event.nextAction='Revisar cambios solicitados en presupuesto V'+budget.version;}
    const record={id:id(),decision,reason,actorId:user.id,actorName:[user.firstName,user.lastName].filter(Boolean).join(' '),actorEmail:user.email,createdAt:now(),version:budget.version,fileSha256:budget.sha256};
    (budget.decisions||=[]).push(record);
    this.history(event,user,`Presupuesto V${budget.version}: ${decision==='ACCEPTED'?'aceptado':decision==='REJECTED'?'rechazado':'cambios solicitados'}${reason?' · '+reason:''}`,'BUDGET_DECISION');
    if(signature)record.signature=signature;
    this.notify(state,event,user,'Decisión sobre presupuesto V'+budget.version,event.eventName);return record;
  });};
  Store.prototype.saveClient=function(user,clientId,data){return this.transaction(user,'CLIENT_SAVED',state=>{
    let client=state.clients.find(c=>c.id===clientId&&canVenue(user,c.venueId));if(clientId&&!client)fail(404,'Cliente no encontrado.');
    const venueId=client?.venueId||data.venueId||user.venueId;this.venue(state,venueId);if(!canVenue(user,venueId))fail(403,'Espacio no permitido.');
    const name=text(data.name,300,true),aliases=(Array.isArray(data.aliases)?data.aliases:String(data.aliases||'').split('\n')).map(n=>text(n,300)).filter(Boolean).slice(0,50);
    const normalized=new Set([name,...aliases].map(normalize));if(state.clients.some(c=>c.id!==clientId&&!c.mergedInto&&c.venueId===venueId&&[c.name,...(c.aliases||[])].some(n=>normalized.has(normalize(n)))))fail(409,'Ya existe un cliente con ese nombre o alias. Puedes fusionar sus fichas.');
    if(!client){client={id:id(),venueId,createdAt:now()};state.clients.push(client);}
    Object.assign(client,{name,aliases,email:data.email?email(data.email):'',phone:text(data.phone,100),contactName:text(data.contactName,300),notes:text(data.notes,10000),updatedAt:now()});return client;
  });};
  Store.prototype.mergeClients=function(user,data){return this.transaction(user,'CLIENTS_MERGED',state=>{
    const source=state.clients.find(c=>c.id===data.sourceId&&!c.mergedInto),target=state.clients.find(c=>c.id===data.targetId&&!c.mergedInto);
    if(!source||!target||source.id===target.id||source.venueId!==target.venueId||!canVenue(user,source.venueId))fail(400,'Selecciona dos clientes distintos del mismo espacio.');
    target.aliases=[...new Set([...(target.aliases||[]),source.name,...(source.aliases||[])])];source.mergedInto=target.id;source.mergedAt=now();
    for(const e of state.events)if(e.venueId===target.venueId&&(e.clientId===source.id||(!e.clientId&&normalize(e.finalClient)===normalize(source.name)))){e.clientId=target.id;this.history(e,user,'Cliente vinculado a '+target.name+'; se conserva el nombre del expediente.','CLIENT_MERGED');}
    return target;
  });};
  Store.prototype.saveOrganization=function(user,organizationId,data){admin(user);return this.transaction(user,'ORGANIZATION_SAVED',state=>{
    let org=state.organizations.find(o=>o.id===organizationId);if(organizationId&&!org)fail(404,'Organización no encontrada.');
    if(!org){org={id:id(),createdAt:now()};state.organizations.push(org);}org.name=text(data.name,200,true);
    if(!Array.isArray(data.venueIds))fail(400,'Selecciona los espacios de la organización.');for(const venueId of data.venueIds){const venue=state.venues.find(v=>v.id===venueId);if(!venue)fail(400,'Espacio no válido.');venue.organizationId=org.id;}
    for(const venue of state.venues)if(venue.organizationId===org.id&&!data.venueIds.includes(venue.id))venue.organizationId='';return org;
  });};
  Store.prototype.saveResource=function(user,resourceId,data){if(!ops(user))fail(403,'Solo Marquee gestiona recursos.');return this.transaction(user,'RESOURCE_SAVED',state=>{
    let resource=state.resources.find(r=>r.id===resourceId);if(resourceId&&!resource)fail(404,'Recurso no encontrado.');if(!resource){resource={id:id(),createdAt:now()};state.resources.push(resource);}
    Object.assign(resource,{name:text(data.name,200,true),kind:choice(data.kind,['EQUIPMENT','TEAM','VEHICLE']),active:data.active!==false,notes:text(data.notes,3000)});return resource;
  });};
  Store.prototype.saveView=function(user,data){return this.transaction(user,'VIEW_SAVED',state=>{const view={id:id(),userId:user.id,name:text(data.name,120,true),page:choice(data.page,['cancelled','completed','statistics']),filters:{}};for(const k of ['venue','from','to','q','eventType'])view.filters[k]=text(data.filters?.[k],500);state.savedViews.push(view);return view;});};
  Store.prototype.preferences=function(user,data){return this.transaction(user,'PREFERENCES_UPDATED',state=>{const account=state.users.find(u=>u.id===user.id);account.preferences={...(account.preferences||{})};for(const k of ['requests','budgets','messages','updates','reminders','dailySummary'])if(k in data)account.preferences[k]=data[k]===true;return account.preferences;});};
  const originalExport=Store.prototype.exportArchive;
  Store.prototype.exportArchive=function(user,status,filters={}){
    const result=originalExport.call(this,user,status);result.events=filterEvents(result.events,filters);
    const fileIds=new Set(result.events.flatMap(e=>[...e.documents,...e.budgets].map(f=>f.fileKey))),venueIds=new Set(result.events.map(e=>e.venueId));
    const userIds=new Set(result.events.flatMap(e=>[e.createdById,e.assignedCommercialId,...e.comments.map(c=>c.authorId),...e.history.map(h=>h.actorId),...e.budgets.flatMap(b=>(b.decisions||[]).map(d=>d.actorId))]));
    result.files=result.files.filter(f=>fileIds.has(f.id));result.venues=result.venues.filter(v=>venueIds.has(v.id));result.users=result.users.filter(u=>userIds.has(u.id));result.filters=filters;return result;
  };
  const originalNotify=Store.prototype.notify;
  Store.prototype.notify=function(state,event,user,title,body,type='EVENT_UPDATED'){
    const previous=new Set(state.notifications.map(n=>n.id));originalNotify.call(this,state,event,user,title,body,type);
    for(const n of state.notifications.filter(n=>!previous.has(n.id))){const recipient=state.users.find(u=>u.id===n.recipientId);const kind=type==='NEW_REQUEST'?'requests':type==='BUDGET_AVAILABLE'?'budgets':type==='NEW_COMMENT'?'messages':'updates';
      if(recipient?.preferences?.[kind]===false)continue;
      state.outbox.push({id:n.id,recipientId:recipient.id,type:'notification',subject:'Marquee Audiovisuales · '+title,body:'Tienes una actualización en Marquee Audiovisuales. Entra en tu cuenta para consultar el expediente.',eventId:event.id,createdAt:now(),attempts:0,nextAttemptAt:now()});
    }
  };
}
module.exports={install,filterEvents,scheduleConflicts,interval,normalize};
